// JSON -> typed model tree.
//
// The parser walks a JSON value and produces a tree of "model nodes" describing
// every distinct object shape it encounters. Each node represents one Dart class.
//
// Node shape:
//   {
//     key:      string  | null     // raw key name (root has the user-supplied name)
//     path:     string[]           // path from root, [] for root
//     fields:   Field[]            // ordered fields detected on this object
//     children: Node[]             // child nodes for nested object/array-of-object fields
//   }
//
// Field shape:
//   {
//     key:           string         // original JSON key (used in toJson)
//     name:          string         // dart field name (camelCase)
//     dartType:      string         // resolved Dart type, e.g. "String", "int?", "List<MenuModel>?"
//     baseDartType:  string         // type without the trailing "?", e.g. "String", "List<MenuModel>"
//     kind:          "primitive" | "object" | "list" | "dynamic"
//     listElement:   Field|null     // for kind === "list" only
//     childRef:      Node|null      // for kind === "object" or list-of-object
//     primitive:     "String"|"int"|"double"|"num"|"bool"|"dynamic"|null
//   }
//
// Type-inference rules:
//   - null            -> dynamic              (NOT Null?)
//   - bool            -> bool
//   - int             -> int
//   - non-int number  -> double
//   - string          -> String
//   - object          -> nested class
//   - array           -> List<X>
//       - empty / all-null -> List<dynamic>
//       - all primitives same -> List<that>
//       - all objects (same shape, best-effort) -> List<ChildClass>
//       - mixed -> List<dynamic>
//
// All non-list, non-dynamic fields are emitted as nullable ("String?"), matching
// the convention of the reference tool. Lists are also nullable ("List<...>?").

import { toCamelCase, toPascalCase } from "./naming.js";

// Try to parse JSON, applying common auto-fixes if the raw text isn't valid JSON.
// Returns { json, fixedSource, fixes } where:
//   - json: the parsed value
//   - fixedSource: the corrected JSON text (same as input if no fix was needed)
//   - fixes: array of human-readable strings describing what was changed
// Throws the original parse error if no fix succeeds.
//
// Supported auto-fixes (applied in order):
//   1. Wrap a stray "key": value fragment in `{ ... }`
//   2. Wrap multiple comma-separated objects in `[ ... ]`
//   3. Strip trailing commas before `}` or `]`
//   4. Strip JS-style line/block comments
export function tryParseJson(raw) {
  const trimmed = raw.trim();
  if (!trimmed) throw new SyntaxError("Empty input");

  // 1) plain parse
  try {
    return { json: JSON.parse(trimmed), fixedSource: trimmed, fixes: [] };
  } catch (originalError) {
    // continue
  }

  const candidates = [];
  const fixes = [];

  // Strip line/block comments first — many people paste from JS objects.
  let stripped = trimmed
    .replace(/\/\/[^\n\r]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  if (stripped !== trimmed) fixes.push("removed JS-style comments");

  // Strip trailing commas (`, }` or `, ]`).
  let noTrailing = stripped.replace(/,(\s*[}\]])/g, "$1");
  if (noTrailing !== stripped) fixes.push("removed trailing commas");

  candidates.push({ src: noTrailing, extraFixes: [] });

  // Maybe it's a key-value fragment that needs `{ ... }` wrapping.
  if (/^"[^"\\]*"\s*:/.test(noTrailing) || /^[A-Za-z_][A-Za-z0-9_]*\s*:/.test(noTrailing)) {
    candidates.push({
      src: `{${noTrailing}}`,
      extraFixes: ["wrapped in { ... }"],
    });
  }

  // Maybe it's two-or-more comma-separated objects that need `[ ... ]` wrapping.
  // Heuristic: starts with `{`, ends with `}`, and contains `},` near the top level.
  if (
    /^\{[\s\S]*\}$/.test(noTrailing) &&
    /\}\s*,\s*\{/.test(noTrailing)
  ) {
    candidates.push({
      src: `[${noTrailing}]`,
      extraFixes: ["wrapped in [ ... ]"],
    });
  }

  let lastError = null;
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c.src);
      return {
        json: parsed,
        fixedSource: c.src,
        fixes: [...fixes, ...c.extraFixes],
      };
    } catch (e) {
      lastError = e;
    }
  }

  // All fixes failed — throw the most recent error so the message is informative.
  throw lastError || new SyntaxError("Could not auto-fix JSON");
}

export function parseJson(jsonValue, rootKey) {
  if (jsonValue === null || typeof jsonValue !== "object" || Array.isArray(jsonValue)) {
    // If user pasted an array, treat its first object as the model shape.
    if (Array.isArray(jsonValue)) {
      const firstObj = jsonValue.find((x) => x && typeof x === "object" && !Array.isArray(x));
      if (firstObj) return buildNode({ key: rootKey, path: [], obj: firstObj });
      // pure list of primitives or empty -> a synthetic single-field model
      return {
        key: rootKey,
        path: [],
        fields: [
          {
            key: "items",
            name: "items",
            dartType: "List<dynamic>?",
            baseDartType: "List<dynamic>",
            kind: "list",
            listElement: { kind: "dynamic", primitive: "dynamic" },
            childRef: null,
            primitive: null,
          },
        ],
        children: [],
      };
    }
    throw new Error("Top-level JSON must be an object or array of objects.");
  }
  return buildNode({ key: rootKey, path: [], obj: jsonValue });
}

function buildNode({ key, path, obj }) {
  const fields = [];
  const children = [];

  for (const [jsonKey, value] of Object.entries(obj)) {
    const fieldName = toCamelCase(jsonKey);
    const childPath = [...path, jsonKey];

    if (value === null) {
      fields.push({
        key: jsonKey,
        name: fieldName,
        dartType: "dynamic",
        baseDartType: "dynamic",
        kind: "dynamic",
        listElement: null,
        childRef: null,
        primitive: "dynamic",
      });
      continue;
    }

    if (Array.isArray(value)) {
      const elt = inferListElement({ key: jsonKey, path: childPath, list: value });
      let dartElement;
      let childRef = null;
      if (elt.kind === "object") {
        const childNode = buildNode({ key: jsonKey, path: childPath, obj: elt.sample });
        children.push(childNode);
        const className = `${toPascalCase(jsonKey)}Model`;
        dartElement = className;
        childRef = childNode;
      } else if (elt.kind === "primitive") {
        dartElement = elt.primitive;
      } else {
        dartElement = "dynamic";
      }
      const baseDartType = `List<${dartElement}>`;
      fields.push({
        key: jsonKey,
        name: fieldName,
        dartType: `${baseDartType}?`,
        baseDartType,
        kind: "list",
        listElement: { kind: elt.kind, primitive: elt.primitive ?? null, childRef },
        childRef,
        primitive: null,
      });
      continue;
    }

    if (typeof value === "object") {
      const childNode = buildNode({ key: jsonKey, path: childPath, obj: value });
      children.push(childNode);
      const className = `${toPascalCase(jsonKey)}Model`;
      fields.push({
        key: jsonKey,
        name: fieldName,
        dartType: `${className}?`,
        baseDartType: className,
        kind: "object",
        listElement: null,
        childRef: childNode,
        primitive: null,
      });
      continue;
    }

    // primitive
    const prim = primitiveDartType(value);
    fields.push({
      key: jsonKey,
      name: fieldName,
      dartType: prim === "dynamic" ? "dynamic" : `${prim}?`,
      baseDartType: prim,
      kind: prim === "dynamic" ? "dynamic" : "primitive",
      listElement: null,
      childRef: null,
      primitive: prim,
    });
  }

  return { key, path, fields, children };
}

function primitiveDartType(value) {
  switch (typeof value) {
    case "boolean": return "bool";
    case "string":  return "String";
    case "number":
      return Number.isInteger(value) ? "int" : "double";
    default:        return "dynamic";
  }
}

// Inspect array contents and decide element kind.
function inferListElement({ list }) {
  // Filter out nulls when surveying types.
  const nonNull = list.filter((x) => x !== null);
  if (nonNull.length === 0) return { kind: "dynamic" };

  const allObjects = nonNull.every((x) => x && typeof x === "object" && !Array.isArray(x));
  if (allObjects) {
    // Pick the object with the most keys as the canonical sample (best-effort union).
    const sample = mergeObjectSamples(nonNull);
    return { kind: "object", sample };
  }

  const allArrays = nonNull.every((x) => Array.isArray(x));
  if (allArrays) {
    // Nested arrays - flatten down to dynamic for now; advanced cases are rare.
    return { kind: "dynamic" };
  }

  const types = new Set(nonNull.map((x) => primitiveDartType(x)));
  if (types.size === 1) {
    return { kind: "primitive", primitive: [...types][0] };
  }
  // Mixed primitive types - fall back to dynamic. (e.g. int + double -> num could be smarter, but dynamic is safest.)
  if (types.size === 2 && types.has("int") && types.has("double")) {
    return { kind: "primitive", primitive: "double" };
  }
  return { kind: "dynamic" };
}

// Merge multiple example objects into one "union" sample so the generated
// class covers fields that appear in any element of the list.
function mergeObjectSamples(objects) {
  const merged = {};
  for (const obj of objects) {
    for (const [k, v] of Object.entries(obj)) {
      if (!(k in merged) || merged[k] === null) {
        merged[k] = v;
      } else if (Array.isArray(v) && Array.isArray(merged[k])) {
        merged[k] = [...merged[k], ...v];
      } else if (
        v && typeof v === "object" && !Array.isArray(v) &&
        merged[k] && typeof merged[k] === "object" && !Array.isArray(merged[k])
      ) {
        merged[k] = { ...merged[k], ...v };
      }
    }
  }
  return merged;
}
