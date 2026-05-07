// Naming convention helpers.
// Two modes:
//   "api"    -> root class: Api<Name>Model        (e.g. ApiHomeModel)
//                root folder: api_<name>/         (e.g. api_home/)
//   "param"  -> root class: Pm<Name>Model         (e.g. PmLoginModel)
//                root folder: pm_<name>/          (e.g. pm_login/)
// Sub-classes are always <Name>Model (PascalCase + "Model" suffix).
// File names are snake_case + "_model.dart".
// A node that has child object types becomes its own folder; otherwise it is a flat file in its parent folder.

export const NAMING_MODES = { API: "api", PARAM: "param" };

export function toPascalCase(input) {
  if (!input) return "";
  return String(input)
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

export function toCamelCase(input) {
  const p = toPascalCase(input);
  if (!p) return "";
  return p.charAt(0).toLowerCase() + p.slice(1);
}

export function toSnakeCase(input) {
  if (!input) return "";
  return String(input)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase();
}

// Decide class name + file name + folder for a node.
// `path` is the array of keys from root: [] for the root, ["menu"] for a child, etc.
// `rootKey` is the user-supplied name for the root model (e.g. "home" / "login").
export function nameForNode({ mode, rootKey, path, hasChildren }) {
  const isRoot = path.length === 0;
  const baseName = isRoot ? rootKey : path[path.length - 1];
  const pascal = toPascalCase(baseName);

  // Class name
  let className;
  if (isRoot) {
    if (mode === NAMING_MODES.API) className = `Api${pascal}Model`;
    else className = `Pm${pascal}Model`;
  } else {
    className = `${pascal}Model`;
  }

  // File name (snake_case)
  const snake = toSnakeCase(baseName);
  let fileBase;
  if (isRoot) {
    fileBase = mode === NAMING_MODES.API ? `api_${snake}` : `pm_${snake}`;
  } else {
    fileBase = snake;
  }
  const fileName = `${fileBase}_model.dart`;

  // Folder path: relative to project root.
  // Root always lives inside its own folder named like fileBase.
  // A non-root node with children also gets its own folder under its parent.
  // A non-root leaf is a file in its parent's folder.
  // We compute folder by walking the path; caller passes hasChildrenForEachAncestor in `ancestorFolders`.
  return { className, fileName, fileBase };
}

// Given a tree of model nodes, produce a flat list of generated files with proper folder paths.
// Each node carries: { key, path, hasChildren, children: [node,...] }.
// Returns: [{ node, folder, fileName, className, fileBase, importPath }]
export function planFileLayout({ mode, rootKey, root }) {
  const out = [];

  function walk(node, parentFolder) {
    const naming = nameForNode({
      mode,
      rootKey,
      path: node.path,
      hasChildren: node.children.length > 0,
    });
    const isRoot = node.path.length === 0;
    // Root always lives in its own folder named fileBase.
    // Non-root with children gets its own folder under parentFolder.
    // Non-root without children stays in parentFolder.
    let folder;
    if (isRoot) folder = naming.fileBase;
    else if (node.children.length > 0) folder = `${parentFolder}/${naming.fileBase}`;
    else folder = parentFolder;

    const entry = {
      node,
      folder,
      fileName: naming.fileName,
      className: naming.className,
      fileBase: naming.fileBase,
      // path used in `import` statements: relative within the project folder.
      // We use package-style `package:<root>/...` later; here we only store the folder/file pair.
      hasOwnFolder: isRoot || node.children.length > 0,
    };
    out.push(entry);

    for (const child of node.children) {
      walk(child, folder);
    }
  }

  walk(root, "");
  return out;
}

// Compute the relative import path from one generated file to another.
// e.g. file "api_home/api_home_model.dart" importing "api_home/menu_model.dart" -> "menu_model.dart"
// e.g. file "api_home/api_home_model.dart" importing "api_home/menu/menu_model.dart" -> "menu/menu_model.dart"
// e.g. file "api_home/menu/menu_model.dart" importing "api_home/api_home_model.dart" -> "../api_home_model.dart"
export function relativeImport(fromFolder, fromFile, toFolder, toFile) {
  const fromParts = fromFolder ? fromFolder.split("/") : [];
  const toParts = toFolder ? toFolder.split("/") : [];

  // Common prefix length
  let i = 0;
  while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) i++;

  const upCount = fromParts.length - i;
  const downParts = toParts.slice(i);

  const segments = [];
  for (let k = 0; k < upCount; k++) segments.push("..");
  for (const p of downParts) segments.push(p);
  segments.push(toFile);
  return segments.join("/");
}
