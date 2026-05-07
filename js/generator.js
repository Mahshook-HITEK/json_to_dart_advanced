// Dart code generator.
//
// Takes a typed model tree (from parser.js), a naming mode, and an options bag,
// and produces a list of generated files: { path, content }.
//
// Each generated class follows the maaden-style convention:
//   - Nullable fields, snake_case JSON keys.
//   - `ClassName({this.a, this.b, ...})` default constructor.
//   - `ClassName.fromJson(Map<String, dynamic> json) { ... }` (NOT a factory).
//   - `Map<String, dynamic> toJson() { ... }`.
//
// Options:
//   mode:                  "api" | "param"
//   rootKey:               string used to derive root class/folder names
//   packageName:           string used in `package:<name>/...` imports (defaults to project folder)
//   nullSafeToJson:        bool — wrap each toJson assignment in `if (field != null)` (default true for "param")
//   useConvertService:     bool — use ConvertService.* helpers in fromJson assignments
//   capabilities: {
//     parseItem:  bool,
//     parseItems: bool,
//     copyItem:   bool,
//     copyItems:  bool,
//     toStringOverride: bool,
//   }

import { planFileLayout, relativeImport, NAMING_MODES } from "./naming.js";

const CONVERT_SERVICE_IMPORT_PLACEHOLDER = "__CS_IMPORT__";

export function generate({
  tree,
  mode,
  rootKey,
  packageName,
  nullSafeToJson,
  useConvertService,
  capabilities,
}) {
  const layout = planFileLayout({ mode, rootKey, root: tree });

  // Build a quick index from node -> layout entry so we can resolve imports.
  const nodeToEntry = new Map();
  for (const entry of layout) nodeToEntry.set(entry.node, entry);

  const files = [];
  for (const entry of layout) {
    const fileContent = renderFile({
      entry,
      nodeToEntry,
      mode,
      packageName,
      nullSafeToJson: nullSafeToJson ?? mode === NAMING_MODES.PARAM,
      useConvertService: !!useConvertService,
      capabilities: capabilities || {},
    });
    files.push({
      path: entry.folder ? `${entry.folder}/${entry.fileName}` : entry.fileName,
      content: fileContent,
      className: entry.className,
    });
  }
  return files;
}

function renderFile({
  entry,
  nodeToEntry,
  mode,
  packageName,
  nullSafeToJson,
  useConvertService,
  capabilities,
}) {
  const { node, className } = entry;
  const lines = [];

  // Imports: child classes referenced by this file.
  const importLines = collectImports({ entry, nodeToEntry, packageName, useConvertService });
  if (importLines.length > 0) {
    lines.push(...importLines);
    lines.push("");
  }

  lines.push(`class ${className} {`);

  // Field declarations
  for (const f of node.fields) {
    lines.push(`  ${f.dartType} ${f.name};`);
  }
  lines.push("");

  // Default constructor
  lines.push(`  ${className}({`);
  for (const f of node.fields) {
    lines.push(`    this.${f.name},`);
  }
  lines.push(`  });`);
  lines.push("");

  // fromJson
  lines.push(`  ${className}.fromJson(Map<String, dynamic> json) {`);
  for (const f of node.fields) {
    lines.push(...renderFromJsonAssignment(f, useConvertService).map((l) => `    ${l}`));
  }
  lines.push(`  }`);
  lines.push("");

  // toJson
  lines.push(`  Map<String, dynamic> toJson() {`);
  lines.push(`    final data = <String, dynamic>{};`);
  for (const f of node.fields) {
    lines.push(...renderToJsonAssignment(f, nullSafeToJson).map((l) => `    ${l}`));
  }
  lines.push(`    return data;`);
  lines.push(`  }`);

  // Optional capabilities
  if (capabilities.parseItem) {
    lines.push("");
    lines.push(...renderParseItem(className).map((l) => `  ${l}`));
  }
  if (capabilities.parseItems) {
    lines.push("");
    lines.push(...renderParseItems(className).map((l) => `  ${l}`));
  }
  if (capabilities.copyItem) {
    lines.push("");
    lines.push(...renderCopyItem(className).map((l) => `  ${l}`));
  }
  if (capabilities.copyItems) {
    lines.push("");
    lines.push(...renderCopyItems(className).map((l) => `  ${l}`));
  }
  if (capabilities.toStringOverride) {
    lines.push("");
    lines.push(...renderToStringOverride(node, className).map((l) => `  ${l}`));
  }

  lines.push(`}`);
  lines.push("");

  return lines.join("\n");
}

function collectImports({ entry, nodeToEntry, packageName, useConvertService }) {
  const imports = new Set();

  // ConvertService import (always relative to project root)
  if (useConvertService) {
    if (packageName) {
      imports.add(`import 'package:${packageName}/utils/convert_service.dart';`);
    } else {
      // Fall back to a relative-ish import.
      imports.add(`import 'utils/convert_service.dart';`);
    }
  }

  // Child class imports: any field that refers to a child class lives in some other generated file.
  function visitField(f) {
    let target = null;
    if (f.kind === "object") target = f.childRef;
    else if (f.kind === "list" && f.listElement?.kind === "object") target = f.listElement.childRef;
    if (!target) return;
    const otherEntry = nodeToEntry.get(target);
    if (!otherEntry) return;
    if (otherEntry === entry) return; // shouldn't happen, but safe-guard

    if (packageName) {
      // Use absolute package import — flatter to read in real projects.
      const pkgPath = `${otherEntry.folder}/${otherEntry.fileName}`.replace(/^\/+/, "");
      imports.add(`import 'package:${packageName}/${pkgPath}';`);
    } else {
      const rel = relativeImport(entry.folder, entry.fileName, otherEntry.folder, otherEntry.fileName);
      imports.add(`import '${rel}';`);
    }
  }

  for (const f of entry.node.fields) visitField(f);

  return [...imports].sort();
}

// ---------- fromJson rendering ----------

function renderFromJsonAssignment(field, useCS) {
  const key = field.key;
  const name = field.name;

  if (field.kind === "primitive") {
    if (useCS) {
      const helper = csReadHelper(field.primitive);
      if (helper) return [`${name} = ${helper}(json['${key}']);`];
    }
    // Default: direct assignment with .toString() for ids that come back numeric.
    return [`${name} = json['${key}'];`];
  }

  if (field.kind === "dynamic") {
    return [`${name} = json['${key}'];`];
  }

  if (field.kind === "object") {
    const childClass = field.baseDartType;
    return [
      `if (json['${key}'] != null) {`,
      `  ${name} = ${childClass}.fromJson(json['${key}']);`,
      `}`,
    ];
  }

  if (field.kind === "list") {
    const elt = field.listElement;
    if (elt.kind === "object") {
      const childClass = elt.childRef ? `${className(elt.childRef.key)}` : "dynamic";
      // We rely on baseDartType which is "List<XxxModel>"; pull XxxModel out.
      const inner = innerOfList(field.baseDartType);
      return [
        `if (json['${key}'] != null) {`,
        `  ${name} = <${inner}>[];`,
        `  json['${key}'].forEach((v) {`,
        `    ${name}!.add(${inner}.fromJson(v));`,
        `  });`,
        `}`,
      ];
    }
    if (elt.kind === "primitive") {
      if (useCS) {
        const helper = csReadListHelper(elt.primitive);
        if (helper) return [`${name} = ${helper}(json['${key}']);`];
      }
      const inner = innerOfList(field.baseDartType);
      return [
        `if (json['${key}'] != null) {`,
        `  ${name} = (json['${key}'] as List).map((v) => v as ${inner}).toList();`,
        `}`,
      ];
    }
    // dynamic list
    return [
      `if (json['${key}'] != null) {`,
      `  ${name} = (json['${key}'] as List).map((v) => v).toList();`,
      `}`,
    ];
  }

  return [`${name} = json['${key}'];`];
}

function csReadHelper(primitive) {
  switch (primitive) {
    case "String": return "ConvertService.convertString";
    case "int":    return "ConvertService.convertInt";
    case "double": return "ConvertService.convertDouble";
    case "num":    return "ConvertService.convertNum";
    case "bool":   return "ConvertService.convertBool";
    default:       return null;
  }
}

function csReadListHelper(primitive) {
  switch (primitive) {
    case "String": return "ConvertService.parseStringList";
    case "int":    return "ConvertService.parseIntList";
    case "double": return "ConvertService.parseDoubleList";
    case "num":    return "ConvertService.parseNumList";
    case "bool":   return "ConvertService.parseBoolList";
    default:       return null;
  }
}

// ---------- toJson rendering ----------

function renderToJsonAssignment(field, nullSafe) {
  const key = field.key;
  const name = field.name;
  const lines = [];

  let assignBody;
  if (field.kind === "object") {
    assignBody = `data['${key}'] = ${name}!.toJson();`;
  } else if (field.kind === "list") {
    if (field.listElement?.kind === "object") {
      assignBody = `data['${key}'] = ${name}!.map((v) => v.toJson()).toList();`;
    } else {
      assignBody = `data['${key}'] = ${name};`;
    }
  } else {
    assignBody = `data['${key}'] = ${name};`;
  }

  // Always wrap object/list in null-check (otherwise `!` would crash).
  const mustGuard = field.kind === "object" || (field.kind === "list" && field.listElement?.kind === "object");
  if (nullSafe || mustGuard) {
    lines.push(`if (${name} != null) {`);
    lines.push(`  ${assignBody}`);
    lines.push(`}`);
  } else {
    lines.push(assignBody);
  }
  return lines;
}

// ---------- capabilities ----------

function renderParseItem(className) {
  return [
    `static ${className} parseItem(dynamic productJson) {`,
    `  try {`,
    `    if (productJson is Map<String, dynamic>) {`,
    `      return ${className}.fromJson(productJson);`,
    `    }`,
    `  } catch (_) {}`,
    `  return ${className}();`,
    `}`,
  ];
}

function renderParseItems(className) {
  return [
    `static List<${className}> parseItems(dynamic productJson) {`,
    `  try {`,
    `    if (productJson is Map<String, dynamic>) {`,
    `      final json = productJson;`,
    `      var list = json["data"] as List;`,
    `      return list.map((data) => ${className}.fromJson(data)).toList();`,
    `    }`,
    `    var list = productJson as List;`,
    `    return list.map((data) => ${className}.fromJson(data)).toList();`,
    `  } catch (_) {}`,
    `  return [];`,
    `}`,
  ];
}

function renderCopyItem(className) {
  return [
    `static ${className} copyItem(${className} source) {`,
    `  return ${className}.fromJson(source.toJson());`,
    `}`,
  ];
}

function renderCopyItems(className) {
  return [
    `static List<${className}> copyItems(List<${className}> source) {`,
    `  return source.map((e) => copyItem(e)).toList();`,
    `}`,
  ];
}

function renderToStringOverride(node, className) {
  // Pick the "best" field for a friendly toString:
  //   preference: name -> title -> label -> id -> first String field -> first field.
  const preferred = ["name", "title", "label", "id"];
  let chosen = null;
  for (const p of preferred) {
    chosen = node.fields.find((f) => f.name === p && f.kind === "primitive");
    if (chosen) break;
  }
  if (!chosen) chosen = node.fields.find((f) => f.kind === "primitive" && f.primitive === "String");
  if (!chosen) chosen = node.fields[0];
  const ref = chosen ? chosen.name : "''";
  return [
    `@override`,
    `String toString() => "\${${ref}}";`,
  ];
}

// ---------- helpers ----------

function innerOfList(baseDartType) {
  // baseDartType is e.g. "List<MenuModel>" or "List<String>" or "List<dynamic>"
  const m = baseDartType.match(/^List<(.+)>$/);
  return m ? m[1] : "dynamic";
}

function className(key) {
  // helper used only above for fallback
  return key;
}
