// Main app controller. Wires UI events to parser/generator/projects/downloader/docs.

import { parseJson, tryParseJson } from "./parser.js";
import { generate } from "./generator.js";
import { triggerDownload, buildGenerationZip } from "./downloader.js";
import { buildDocs, indexTreeForDocs } from "./docs.js";
import { convertServiceDart } from "./convertService.js";
import {
  listProjects,
  getProject,
  createProject,
  deleteProject,
  addModelSet,
  deleteModelSet,
  buildProjectZip,
  slugify,
} from "./projects.js";
import { loadState, patchState } from "./storage.js";

// ---------- DOM refs ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const els = {
  themeToggle: $("#themeToggle"),
  tabs: $$(".tab"),
  panels: {
    generator: $("#panel-generator"),
    projects:  $("#panel-projects"),
    docs:      $("#panel-docs"),
  },

  // generator inputs
  modeRadios: $$('input[name="mode"]'),
  rootKey: $("#rootKey"),
  packageName: $("#packageName"),
  rootPreview: $("#rootPreview"),
  optConvertService: $("#optConvertService"),
  optNullSafeToJson: $("#optNullSafeToJson"),
  capParseItem: $("#capParseItem"),
  capParseItems: $("#capParseItems"),
  capCopyItem: $("#capCopyItem"),
  capCopyItems: $("#capCopyItems"),
  capToString: $("#capToString"),

  jsonInput: $("#jsonInput"),
  parseStatus: $("#parseStatus"),
  generateBtn: $("#generateBtn"),
  loadSampleBtn: $("#loadSampleBtn"),
  clearInputBtn: $("#clearInputBtn"),
  formatBtn: $("#formatBtn"),
  copyAllBtn: $("#copyAllBtn"),
  saveToProjectBtn: $("#saveToProjectBtn"),
  downloadDocBtn: $("#downloadDocBtn"),
  downloadZipBtn: $("#downloadZipBtn"),
  downloadConvertServiceBtn: $("#downloadConvertServiceBtn"),

  filesTabs: $("#filesTabs"),
  codeOutputCode: $("#codeOutputCode"),

  // projects
  projectsList: $("#projectsList"),
  projectDetail: $("#projectDetail"),
  newProjectBtn: $("#newProjectBtn"),

  // modals
  newProjectModal: $("#newProjectModal"),
  newProjectName: $("#newProjectName"),
  newProjectDesc: $("#newProjectDesc"),
  cancelNewProjectBtn: $("#cancelNewProjectBtn"),

  saveToProjectModal: $("#saveToProjectModal"),
  saveTargetProject: $("#saveTargetProject"),
  saveFeatureName: $("#saveFeatureName"),
  cancelSaveBtn: $("#cancelSaveBtn"),

  toast: $("#toast"),
};

// ---------- state ----------
let lastResult = null; // { tree, files, options, json }
let activeFileIdx = 0;
let activeProjectId = null;

// ---------- theme ----------
function applyTheme(theme) {
  document.body.dataset.theme = theme;
  patchState({ theme });
}

els.themeToggle.addEventListener("click", () => {
  const next = document.body.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
});

// ---------- tabs ----------
function showTab(name) {
  for (const t of els.tabs) t.classList.toggle("is-active", t.dataset.tab === name);
  for (const [k, p] of Object.entries(els.panels)) {
    p.setAttribute("aria-hidden", k === name ? "false" : "true");
  }
  if (name === "projects") renderProjectsList();
}

for (const t of els.tabs) {
  t.addEventListener("click", () => showTab(t.dataset.tab));
}

// ---------- live name preview ----------
function getMode() {
  return els.modeRadios.find((r) => r.checked).value;
}

function updateRootPreview() {
  const mode = getMode();
  const key = els.rootKey.value.trim() || "...";
  const cls = mode === "api" ? `Api${pascal(key)}Model` : `Pm${pascal(key)}Model`;
  const folder = mode === "api" ? `api_${snake(key)}` : `pm_${snake(key)}`;
  els.rootPreview.innerHTML = `→ <code>${cls}</code> in <code>${folder}/${folder}_model.dart</code>`;
}

function pascal(s) {
  return String(s)
    .replace(/[^a-zA-Z0-9]+/g, " ").trim().split(" ").filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("");
}
function snake(s) {
  return String(s)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/_+/g, "_").replace(/^_|_$/g, "").toLowerCase();
}

for (const r of els.modeRadios) r.addEventListener("change", () => {
  updateRootPreview();
  // auto-enable null-safe toJson for param
  if (r.value === "param" && r.checked) els.optNullSafeToJson.checked = true;
});
els.rootKey.addEventListener("input", updateRootPreview);

// ---------- generation ----------
function readOptions() {
  return {
    mode: getMode(),
    rootKey: els.rootKey.value.trim() || "model",
    packageName: els.packageName.value.trim() || null,
    useConvertService: els.optConvertService.checked,
    nullSafeToJson: els.optNullSafeToJson.checked,
    capabilities: {
      parseItem:  els.capParseItem.checked,
      parseItems: els.capParseItems.checked,
      copyItem:   els.capCopyItem.checked,
      copyItems:  els.capCopyItems.checked,
      toStringOverride: els.capToString.checked,
    },
  };
}

function runGenerate() {
  const raw = els.jsonInput.value.trim();
  if (!raw) {
    setStatus("Paste some JSON to start.", "muted");
    return;
  }
  let json, fixedSource, fixes;
  try {
    ({ json, fixedSource, fixes } = tryParseJson(raw));
  } catch (e) {
    setStatus(`Invalid JSON: ${e.message}`, "error");
    return;
  }
  // If auto-fix changed the source, update the textarea so the user sees it.
  if (fixes.length > 0) {
    try {
      els.jsonInput.value = JSON.stringify(json, null, 2);
    } catch (_) {
      els.jsonInput.value = fixedSource;
    }
  }
  const opts = readOptions();
  let tree, files;
  try {
    tree = parseJson(json, opts.rootKey);
    files = generate({
      tree,
      mode: opts.mode,
      rootKey: opts.rootKey,
      packageName: opts.packageName,
      nullSafeToJson: opts.nullSafeToJson,
      useConvertService: opts.useConvertService,
      capabilities: opts.capabilities,
    });
  } catch (e) {
    setStatus(`Generator error: ${e.message}`, "error");
    console.error(e);
    return;
  }

  lastResult = { tree, files, options: opts, json: els.jsonInput.value };
  activeFileIdx = 0;
  renderFilesTabs();
  renderActiveFile();
  const fileCount = `Generated ${files.length} file${files.length === 1 ? "" : "s"}`;
  const fixNote = fixes.length > 0 ? ` · auto-fixed: ${fixes.join(", ")}` : "";
  setStatus(fileCount + fixNote + ".", "success");
  els.copyAllBtn.disabled = false;
}

function setStatus(msg, kind = "muted") {
  els.parseStatus.textContent = msg;
  els.parseStatus.style.color =
    kind === "error" ? "var(--danger)" :
    kind === "success" ? "var(--success)" :
    "var(--text-muted)";
}

function renderFilesTabs() {
  els.filesTabs.innerHTML = "";
  if (!lastResult) return;
  lastResult.files.forEach((f, i) => {
    const btn = document.createElement("button");
    btn.className = "files-tab" + (i === activeFileIdx ? " is-active" : "");
    btn.innerHTML = `<span>${escapeHtml(f.className)}</span> <span class="files-tab__path">${escapeHtml(f.path)}</span>`;
    btn.addEventListener("click", () => {
      activeFileIdx = i;
      renderFilesTabs();
      renderActiveFile();
    });
    els.filesTabs.appendChild(btn);
  });
}

function renderActiveFile() {
  if (!lastResult) {
    els.codeOutputCode.textContent = "";
    return;
  }
  const f = lastResult.files[activeFileIdx];
  els.codeOutputCode.innerHTML = highlightDart(f.content);
}

// ---------- minimal Dart syntax highlighting ----------
const DART_KEYWORDS = new Set([
  "class","import","final","var","const","static","return","if","else","for","while",
  "true","false","null","new","this","void","async","await","try","catch","throw",
  "as","is","in","required","late","extends","implements","with","abstract","factory",
  "get","set","override",
]);
const DART_TYPES = new Set([
  "String","int","double","num","bool","dynamic","List","Map","DateTime","Object","Null",
]);

function highlightDart(src) {
  const lines = src.split("\n");
  const out = [];
  for (const raw of lines) {
    out.push(highlightLine(raw));
  }
  return out.join("\n");
}

function highlightLine(line) {
  // comment
  const cmt = line.match(/^(\s*\/\/.*)$/);
  if (cmt) return `<span class="tk-comment">${escapeHtml(cmt[1])}</span>`;

  // tokenize roughly: strings, then word tokens, then symbols
  let result = "";
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    // string literals
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      while (j < line.length && line[j] !== quote) {
        if (line[j] === "\\") j++;
        j++;
      }
      const seg = line.slice(i, Math.min(j + 1, line.length));
      result += `<span class="tk-string">${escapeHtml(seg)}</span>`;
      i = j + 1;
      continue;
    }
    // annotation
    if (ch === "@" && /[A-Za-z_]/.test(line[i + 1] || "")) {
      let j = i + 1;
      while (j < line.length && /[A-Za-z0-9_]/.test(line[j])) j++;
      const seg = line.slice(i, j);
      result += `<span class="tk-anno">${escapeHtml(seg)}</span>`;
      i = j;
      continue;
    }
    // number
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < line.length && /[0-9.]/.test(line[j])) j++;
      result += `<span class="tk-num">${escapeHtml(line.slice(i, j))}</span>`;
      i = j;
      continue;
    }
    // word
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < line.length && /[A-Za-z0-9_]/.test(line[j])) j++;
      const word = line.slice(i, j);
      if (DART_KEYWORDS.has(word)) {
        result += `<span class="tk-keyword">${escapeHtml(word)}</span>`;
      } else if (DART_TYPES.has(word) || /^[A-Z][A-Za-z0-9_]*$/.test(word)) {
        result += `<span class="tk-type">${escapeHtml(word)}</span>`;
      } else {
        result += escapeHtml(word);
      }
      i = j;
      continue;
    }
    result += escapeHtml(ch);
    i++;
  }
  return result;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ---------- actions ----------
els.generateBtn.addEventListener("click", runGenerate);

els.loadSampleBtn.addEventListener("click", () => {
  els.jsonInput.value = SAMPLE_JSON;
  els.rootKey.value = "home";
  updateRootPreview();
  runGenerate();
});

els.clearInputBtn.addEventListener("click", () => {
  els.jsonInput.value = "";
  setStatus("");
});

els.formatBtn.addEventListener("click", () => {
  const raw = els.jsonInput.value.trim();
  if (!raw) return;
  try {
    const { json, fixes } = tryParseJson(raw);
    els.jsonInput.value = JSON.stringify(json, null, 2);
    const note = fixes.length > 0 ? ` (auto-fixed: ${fixes.join(", ")})` : "";
    setStatus(`Formatted${note}.`, "success");
  } catch (e) {
    setStatus(`Cannot format: ${e.message}`, "error");
  }
});

els.copyAllBtn.addEventListener("click", async () => {
  if (!lastResult) return;
  try {
    await navigator.clipboard.writeText(lastResult.files[activeFileIdx].content);
    toast("Copied to clipboard", "success");
  } catch (e) {
    toast("Copy failed", "error");
  }
});

els.downloadZipBtn.addEventListener("click", async () => {
  if (!lastResult) {
    toast("Generate something first", "error");
    return;
  }
  const opts = lastResult.options;
  const blob = await buildGenerationZip({
    files: lastResult.files,
    rootFolder: null,
    useConvertService: opts.useConvertService,
  });
  const name = opts.mode === "api"
    ? `api_${slugify(opts.rootKey)}_models.zip`
    : `pm_${slugify(opts.rootKey)}_models.zip`;
  triggerDownload(name, blob);
  toast("ZIP downloaded", "success");
});

els.downloadConvertServiceBtn.addEventListener("click", () => {
  triggerDownload("convert_service.dart", convertServiceDart(), "text/plain");
  toast("convert_service.dart downloaded", "success");
});

els.downloadDocBtn.addEventListener("click", async () => {
  if (!lastResult) {
    toast("Generate something first", "error");
    return;
  }
  indexTreeForDocs(lastResult.tree, lastResult.files);
  const docs = buildDocs({
    tree: lastResult.tree,
    files: lastResult.files,
    json: lastResult.json,
    mode: lastResult.options.mode,
    rootKey: lastResult.options.rootKey,
  });
  const zip = new JSZip();
  for (const d of docs) zip.file(d.path, d.content);
  const blob = await zip.generateAsync({ type: "blob" });
  triggerDownload(`${slugify(lastResult.options.rootKey)}_docs.zip`, blob);
  toast("Docs downloaded", "success");
});

// ---------- save to project ----------
els.saveToProjectBtn.addEventListener("click", () => {
  if (!lastResult) {
    toast("Generate something first", "error");
    return;
  }
  const projects = listProjects();
  if (projects.length === 0) {
    toast("Create a project first (Projects tab)", "error");
    showTab("projects");
    return;
  }
  els.saveTargetProject.innerHTML = projects
    .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
    .join("");
  els.saveFeatureName.value = els.saveFeatureName.value || lastResult.options.rootKey;
  els.saveToProjectModal.showModal();
});

els.cancelSaveBtn.addEventListener("click", () => els.saveToProjectModal.close());

els.saveToProjectModal.addEventListener("submit", (e) => {
  e.preventDefault();
  const projectId = els.saveTargetProject.value;
  const featureName = els.saveFeatureName.value.trim();
  if (!projectId || !featureName) return;
  addModelSet(projectId, {
    featureName,
    mode: lastResult.options.mode,
    rootKey: lastResult.options.rootKey,
    options: lastResult.options,
    json: lastResult.json,
    files: lastResult.files,
  });
  els.saveToProjectModal.close();
  toast(`Saved to project`, "success");
});

// ---------- new project ----------
els.newProjectBtn.addEventListener("click", () => {
  els.newProjectName.value = "";
  els.newProjectDesc.value = "";
  els.newProjectModal.showModal();
});

els.cancelNewProjectBtn.addEventListener("click", () => els.newProjectModal.close());

els.newProjectModal.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = els.newProjectName.value.trim();
  if (!name) return;
  const p = createProject({ name, description: els.newProjectDesc.value });
  els.newProjectModal.close();
  activeProjectId = p.id;
  renderProjectsList();
  renderProjectDetail();
  toast("Project created", "success");
});

// ---------- projects rendering ----------
function renderProjectsList() {
  const projects = listProjects();
  els.projectsList.innerHTML = "";
  if (projects.length === 0) {
    const empty = document.createElement("li");
    empty.className = "hint";
    empty.style.padding = "12px";
    empty.textContent = "No projects yet — create one with the + New button.";
    els.projectsList.appendChild(empty);
    renderProjectDetail();
    return;
  }
  if (!activeProjectId || !projects.find((p) => p.id === activeProjectId)) {
    activeProjectId = projects[0].id;
  }
  for (const p of projects) {
    const li = document.createElement("li");
    li.className = "project-item" + (p.id === activeProjectId ? " is-active" : "");
    li.innerHTML = `
      <span class="project-item__name">
        ${escapeHtml(p.name)}
        <span class="project-item__count">${p.modelSets.length}</span>
      </span>
      <span class="project-item__desc">${escapeHtml(p.description || "—")}</span>
    `;
    li.addEventListener("click", () => {
      activeProjectId = p.id;
      renderProjectsList();
      renderProjectDetail();
    });
    els.projectsList.appendChild(li);
  }
  renderProjectDetail();
}

function renderProjectDetail() {
  if (!activeProjectId) {
    els.projectDetail.innerHTML = `
      <div class="empty-state">
        <h3>No project selected</h3>
        <p>Create a project, then save generated models into it.</p>
      </div>
    `;
    return;
  }
  const p = getProject(activeProjectId);
  if (!p) {
    els.projectDetail.innerHTML = `<div class="empty-state"><h3>Project not found</h3></div>`;
    return;
  }
  const sets = p.modelSets;
  const featuresHtml = sets.length === 0
    ? `<p class="hint">No models saved yet. Generate something and click <strong>Save to Project</strong>.</p>`
    : sets.map((s) => `
        <div class="feature-card">
          <div class="feature-card__head">
            <div>
              <div class="feature-card__title">${escapeHtml(s.featureName)} <span class="feature-card__meta">· ${s.mode} · ${escapeHtml(s.rootKey)}</span></div>
              <div class="feature-card__meta">${new Date(s.createdAt).toLocaleString()} · ${s.files.length} file${s.files.length === 1 ? "" : "s"}</div>
            </div>
            <div class="row">
              <button class="btn btn--secondary btn--small" data-action="del-set" data-id="${s.id}">Remove</button>
            </div>
          </div>
          <div class="feature-card__models">
            ${s.files.map((f) => `<span class="model-chip">${escapeHtml(f.className)}</span>`).join("")}
          </div>
        </div>
      `).join("");

  els.projectDetail.innerHTML = `
    <div class="project-detail__head">
      <div>
        <h2>${escapeHtml(p.name)}</h2>
        <div class="desc">${escapeHtml(p.description || "")}</div>
      </div>
      <div class="row">
        <button class="btn btn--primary" id="btnDownloadProjectZip">Download project ZIP</button>
        <button class="btn btn--secondary" id="btnDownloadProjectDocs">Download docs</button>
        <button class="btn btn--secondary" id="btnDeleteProject">Delete project</button>
      </div>
    </div>
    ${featuresHtml}
  `;

  $("#btnDownloadProjectZip").addEventListener("click", async () => {
    const blob = await buildProjectZip(p);
    triggerDownload(`${slugify(p.name)}.zip`, blob);
    toast("Project ZIP downloaded", "success");
  });

  $("#btnDownloadProjectDocs").addEventListener("click", async () => {
    const zip = new JSZip();
    for (const s of p.modelSets) {
      // re-build per-set docs from the saved tree-equivalent data; we only have files+json,
      // so emit a minimal set: README + each file as markdown wrapper.
      const folder = zip.folder(slugify(s.featureName));
      folder.file("README.md", featureDocsReadme(s));
      for (const f of s.files) {
        folder.file(f.path.replace(/\.dart$/, ".md"), wrapFileDoc(f));
      }
    }
    zip.file("README.md", projectDocsIndex(p));
    const blob = await zip.generateAsync({ type: "blob" });
    triggerDownload(`${slugify(p.name)}_docs.zip`, blob);
    toast("Docs downloaded", "success");
  });

  $("#btnDeleteProject").addEventListener("click", () => {
    if (!confirm(`Delete project "${p.name}"? This cannot be undone.`)) return;
    deleteProject(p.id);
    activeProjectId = null;
    renderProjectsList();
    toast("Project deleted", "success");
  });

  for (const btn of $$("[data-action='del-set']", els.projectDetail)) {
    btn.addEventListener("click", () => {
      deleteModelSet(p.id, btn.dataset.id);
      renderProjectDetail();
      renderProjectsList();
    });
  }
}

function featureDocsReadme(s) {
  return [
    `# ${s.featureName}`,
    "",
    `- **Root:** \`${s.rootKey}\``,
    `- **Mode:** ${s.mode}`,
    "",
    `## Source JSON`,
    "",
    "```json",
    safeJson(s.json),
    "```",
  ].join("\n");
}

function wrapFileDoc(f) {
  return [
    `# \`${f.className}\``,
    "",
    `**File:** \`${f.path}\``,
    "",
    "```dart",
    f.content,
    "```",
  ].join("\n");
}

function projectDocsIndex(p) {
  const lines = [
    `# ${p.name} — model documentation`,
    "",
    p.description || "",
    "",
  ];
  for (const s of p.modelSets) {
    lines.push(`## ${s.featureName} (${s.mode})`);
    for (const f of s.files) {
      lines.push(`- [\`${f.className}\`](${slugify(s.featureName)}/${f.path.replace(/\.dart$/, ".md")})`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function safeJson(json) {
  try { return JSON.stringify(JSON.parse(json), null, 2); }
  catch (_) { return json; }
}

// ---------- toast ----------
let toastTimer = null;
function toast(msg, kind = "") {
  els.toast.textContent = msg;
  els.toast.className = `toast is-visible${kind ? " is-" + kind : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.className = "toast";
  }, 2200);
}

// ---------- init ----------
const initial = loadState();
applyTheme(initial.theme || "dark");
updateRootPreview();
showTab("generator");

const SAMPLE_JSON = `{
  "id": 12,
  "name": "Home",
  "is_active": true,
  "score": 4.6,
  "tags": ["new", "featured"],
  "menu": [
    {
      "title": "Profile",
      "icon": "user",
      "sub_menu": [
        { "title": "Account", "route": "/account" },
        { "title": "Settings", "route": "/settings" }
      ]
    },
    { "title": "Logout", "icon": "logout" }
  ],
  "user": {
    "id": 1,
    "name": "Alex",
    "avatar": null
  },
  "task_schedule_work_permit_details": [],
  "unit_size": null
}`;
