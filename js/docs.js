// Generates markdown documentation from a parsed model tree.
//
// One markdown file per class, plus an index README.
// Each per-class file lists fields with types, the original (sample) JSON, and
// the generated Dart for quick reference / handoff.

export function buildDocs({ tree, files, json, mode, rootKey }) {
  const docs = [];

  const index = ["# Model documentation", ""];
  index.push(`- **Root model:** \`${rootKey}\``);
  index.push(`- **Mode:** ${mode === "api" ? "API response" : "Param (request)"}`);
  index.push("");
  index.push("## Files");
  index.push("");

  // Walk tree to gather fields per class.
  const fieldsByClass = new Map(); // className -> Field[]
  function walk(node) {
    fieldsByClass.set(classOfNode(node, files), node.fields);
    for (const c of node.children) walk(c);
  }
  walk(tree);

  for (const f of files) {
    index.push(`- [\`${f.className}\`](${f.path.replace(/\.dart$/, ".md")}) — \`${f.path}\``);
    docs.push({
      path: f.path.replace(/\.dart$/, ".md"),
      content: classDoc(f, fieldsByClass.get(f.className) || []),
    });
  }

  index.push("");
  index.push("## Source JSON");
  index.push("");
  index.push("```json");
  index.push(safeJson(json));
  index.push("```");

  docs.unshift({ path: "README.md", content: index.join("\n") });
  return docs;
}

function classOfNode(node, files) {
  // Files are in tree order, root first; match the same order via path length + key.
  // But it's easier to just look up the file whose className we'd derive from this node.
  // Since node has key + path, and file was generated from nameForNode using identical
  // logic, the className is deterministic by index — but we don't know index here.
  // Use a stable lookup via path length: caller passes files ordered same as walk().
  const idx = node.__docIdx;
  if (typeof idx === "number" && files[idx]) return files[idx].className;
  return null;
}

function classDoc(file, fields) {
  const lines = [];
  lines.push(`# \`${file.className}\``);
  lines.push("");
  lines.push(`**File:** \`${file.path}\``);
  lines.push("");
  lines.push("## Fields");
  lines.push("");
  if (fields.length === 0) {
    lines.push("_No fields detected._");
  } else {
    lines.push("| Field | JSON key | Dart type |");
    lines.push("|---|---|---|");
    for (const f of fields) {
      lines.push(`| \`${f.name}\` | \`${f.key}\` | \`${f.dartType}\` |`);
    }
  }
  lines.push("");
  lines.push("## Generated Dart");
  lines.push("");
  lines.push("```dart");
  lines.push(file.content);
  lines.push("```");
  return lines.join("\n");
}

function safeJson(json) {
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch (_) {
    return json;
  }
}

// Helper to attach an index to each tree node so docs can resolve className -> file.
// Call once before buildDocs.
export function indexTreeForDocs(tree, files) {
  let i = 0;
  function visit(node) {
    node.__docIdx = i++;
    for (const c of node.children) visit(c);
  }
  visit(tree);
  return tree;
}
