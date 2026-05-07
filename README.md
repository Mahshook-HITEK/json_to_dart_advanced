# JSON → Dart · Advanced

A modern, browser-based tool that converts JSON into idiomatic Dart model classes — with naming conventions, defensive parsing helpers, project workspaces, and exportable docs. Inspired by [json_to_dart](https://javiercbk.github.io/json_to_dart/), built for real Flutter codebases.

> **Pure static site.** No backend, no signup, no build step — just open `index.html` or push to GitHub Pages.

## Features

### Naming conventions
- **API mode** — for HTTP responses. Root class → `Api<Name>Model`, folder → `api_<name>/`.
- **Param mode** — for request payloads. Root class → `Pm<Name>Model`, folder → `pm_<name>/`.
- All sub-classes end with `Model`. A nested object with its **own** nested objects gets its own folder; otherwise it lives flat in the parent folder.

### Type inference (better than the original)
| JSON | Dart |
|---|---|
| `null` | `dynamic` (not `Null?`) |
| `[]` / list of all-null | `List<dynamic>?` |
| `[1, 2.0]` (mixed numeric) | `List<double>?` |
| Mixed-type list | `List<dynamic>?` |
| Object | Generated `<Name>Model?` |
| Array of objects | `List<<Name>Model>?` (fields merged across all elements) |

### Param mode `toJson` null-checks
Every assignment is wrapped:
```dart
if (contractStartDate != null) {
  data['contract_start_date'] = contractStartDate;
}
```

### `ConvertService` integration
Optional: bundle a downloadable `convert_service.dart` and call its helpers in every `fromJson` so flaky API responses (numbers as strings, `"null"` strings, etc.) never crash your parser.

```dart
id = ConvertService.convertInt(json['id']);
name = ConvertService.convertString(json['name']);
tags = ConvertService.parseStringList(json['tags']);
```

The bundled `ConvertService` is extended beyond the original maaden version with:
- `convertStringNullable`, `convertIntNullable`, `convertDoubleNullable`
- `convertDateTime`, `convertMap`
- `parseNumList`, `parseBoolList`, generic `parseList<T>`

### Capabilities (optional static helpers per class)
- `parseItem(json)` — safe single-object parse, never throws.
- `parseItems(json)` — handles **both** `[{...},{...}]` **and** `{ data: [{...},{...}] }`.
- `copyItem(source)` / `copyItems(list)` — deep copy via JSON round-trip.
- `toString()` override — prints `name`, `title`, `label`, or `id` if present.

### Project workspaces
Use the **Projects** tab to group models by app (e.g. `myFm`, `maaden`).
Each project holds multiple **model sets** organised by feature.
One click downloads the entire `lib/features/<feature>/models/...` tree as a structured ZIP.

### Documentation export
- **Per-generation docs** — markdown bundle with one file per model (fields, types, sample JSON, generated Dart).
- **Project docs** — full bundle covering every saved model set.

Useful for onboarding, code review, or feeding context to AI assistants.

## Quickstart

### Use it online
Open the GitHub Pages URL (after publishing — see below).

### Use it locally
```bash
git clone <this-repo>
cd json_to_dart_advanced
# any static server works:
python3 -m http.server 8080
# then open http://localhost:8080
```

## Publishing to GitHub Pages

1. Create a new public GitHub repo and push this folder.
2. In **Settings → Pages**, pick the branch (e.g. `main`) and root (`/`).
3. Wait ~30s, then visit `https://<your-username>.github.io/<repo>/`.

That's it — no build, no CI.

## Architecture

```
json_to_dart_advanced/
├── index.html              # UI shell
├── styles/                 # theme tokens, layout, components
├── js/
│   ├── parser.js           # JSON → typed model tree
│   ├── naming.js           # api/param naming + folder layout
│   ├── generator.js        # tree → Dart files (the heart)
│   ├── convertService.js   # convert_service.dart template
│   ├── downloader.js       # JSZip wrapper
│   ├── projects.js         # localStorage-backed project store
│   ├── docs.js             # markdown docs generator
│   ├── storage.js          # localStorage helpers
│   └── app.js              # UI controller
└── README.md
```

## Conventions reference (matches the maaden codebase)

- **Field declaration:** nullable, `Type? fieldName;`.
- **Default constructor:** `ClassName({this.field1, this.field2, ...});`.
- **`fromJson`:** named constructor (`ClassName.fromJson(...)`) — not a factory.
- **Nested objects:** wrapped in a null-check before parsing.
- **Lists of objects:** initialised as `<Foo>[]` then populated via `forEach`.

## Known limitations

- Two siblings with the same key (e.g. both `user`) produce one shared class. Rename the JSON key or split the input if that conflicts.
- No support yet for sealed/union types or polymorphic deserialization.
- Single-pass generation — the tool doesn't re-open saved model sets for editing (yet).

## Roadmap

- Edit-in-place for saved model sets.
- Custom field renaming overrides.
- Equatable / `==` / `hashCode` capability.
- "Compare against existing model" diff view.

## License

MIT.
