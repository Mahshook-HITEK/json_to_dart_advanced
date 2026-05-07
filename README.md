# JSON → Dart · Advanced

**A free browser tool that turns JSON into ready-to-use Dart model classes for Flutter apps — with the kind of structure a real team would actually write.**

[**Try it live →**](https://mahshook-hitek.github.io/json_to_dart_advanced/)

No installation. No signup. Paste JSON, click Generate, copy or download the result.

---

## Table of Contents

- [What is this?](#what-is-this)
- [Why use it?](#why-use-it)
- [Quick example](#quick-example)
- [How to use it (step by step)](#how-to-use-it-step-by-step)
- [Every option, explained](#every-option-explained)
- [Use cases](#use-cases)
- [What you get out](#what-you-get-out)
- [Projects feature](#projects-feature)
- [The ConvertService helper](#the-convertservice-helper)
- [Documentation export](#documentation-export)
- [FAQ](#faq)
- [Run it locally / Self-host](#run-it-locally--self-host)
- [Project structure (for contributors)](#project-structure-for-contributors)
- [License](#license)

---

## What is this?

When you build a Flutter app that talks to a backend, the backend usually sends data as **JSON** — text like this:

```json
{ "id": 12, "name": "Alice", "is_active": true }
```

To use that data in Dart, you need a **model class** — a Dart class that mirrors the JSON shape and knows how to parse itself. Writing those by hand is slow and error-prone, especially when responses have nested objects and arrays.

**This tool reads any JSON and writes the Dart class for you.** It doesn't just convert types — it also:

- Names classes and folders the way real Flutter teams structure their code.
- Adds defensive parsing (so dirty server data doesn't crash your app).
- Distinguishes between **response models** (data you receive) and **param models** (data you send).
- Bundles helper utilities so the generated code works in any Flutter project with zero extra dependencies.
- Lets you save multiple generated models into a "project" and download the whole thing as a ready-to-drop folder.

If you've used [json_to_dart](https://javiercbk.github.io/json_to_dart/) before, this is the same idea — but with the rough edges fixed and many quality-of-life features added.

---

## Why use it?

If you've used the original `json_to_dart`, you may have run into these problems:

| Problem in the original | What this tool does |
|---|---|
| `null` values become `Null?` (a useless type) | They become `dynamic` so you can store anything in that field later. |
| `[]` (empty list) becomes `List<Null>?` | Becomes `List<dynamic>?` — usable. |
| `toJson()` always sends `null` keys to the server | Optional null-check wrapping — empty fields are simply omitted. |
| No defensive parsing — if the server sends `"12"` instead of `12`, `fromJson` crashes | Optional `ConvertService` wraps every parse call so type mismatches never throw. |
| Output is one giant file with all classes mashed together | Output is a clean folder structure with one class per file, organized by nesting depth. |
| No way to manage multiple generations | Built-in **Projects** workspace saves multiple JSON pastes per app. |
| No documentation export | One click exports markdown docs for any model or whole project. |

---

## Quick example

### Input — paste this JSON

```json
{
  "id": 12,
  "name": "Home",
  "menu": [
    {
      "title": "Profile",
      "sub_menu": [
        { "title": "Account" }
      ]
    }
  ],
  "user": { "id": 1, "name": "Alex", "avatar": null }
}
```

### Output — clean Dart files in a sensible structure

```
api_home/
├── api_home_model.dart       (ApiHomeModel)
├── user_model.dart           (UserModel — flat because no nested objects)
└── menu/
    ├── menu_model.dart       (MenuModel — has its own folder, contains sub_menu)
    └── sub_menu_model.dart   (SubMenuModel)
```

### What's inside `api_home_model.dart`

```dart
import 'package:my_app/api_home/menu/menu_model.dart';
import 'package:my_app/api_home/user_model.dart';

class ApiHomeModel {
  int? id;
  String? name;
  List<MenuModel>? menu;
  UserModel? user;

  ApiHomeModel({this.id, this.name, this.menu, this.user});

  ApiHomeModel.fromJson(Map<String, dynamic> json) {
    id = json['id'];
    name = json['name'];
    if (json['menu'] != null) {
      menu = <MenuModel>[];
      json['menu'].forEach((v) {
        menu!.add(MenuModel.fromJson(v));
      });
    }
    if (json['user'] != null) {
      user = UserModel.fromJson(json['user']);
    }
  }

  Map<String, dynamic> toJson() {
    final data = <String, dynamic>{};
    data['id'] = id;
    data['name'] = name;
    if (menu != null) {
      data['menu'] = menu!.map((v) => v.toJson()).toList();
    }
    if (user != null) {
      data['user'] = user!.toJson();
    }
    return data;
  }
}
```

This is exactly what an experienced Flutter developer would write by hand.

---

## How to use it (step by step)

### 1. Open the tool

[https://mahshook-hitek.github.io/json_to_dart_advanced/](https://mahshook-hitek.github.io/json_to_dart_advanced/)

You'll see three tabs at the top: **Generator**, **Projects**, **Docs & Help**. You start on Generator.

### 2. Pick a naming style

Top-left card asks: **API model** or **Param model**?

- **API model** — pick this when the JSON is something you **received** from the server (a response). The root class will be named `Api<Name>Model`, e.g. `ApiHomeModel`.
- **Param model** — pick this when the JSON is something you'll **send** to the server (a request body). The root class will be named `Pm<Name>Model`, e.g. `PmLoginModel`.

This naming is a convention used by Flutter teams to make the role of each class obvious at a glance.

### 3. Type a "root name"

This is the name of the screen, feature, or endpoint the JSON belongs to. Examples:
- For the home-page response → `home`
- For the login request → `login`
- For a list of products → `products`

The tool combines this with the mode prefix to name the root class and folder.

### 4. (Optional) Set a "package name"

If you know your Flutter app's package name (the value after `name:` in `pubspec.yaml`, like `my_app`), type it here.

The tool will produce **absolute imports** like:
```dart
import 'package:my_app/api_home/menu/menu_model.dart';
```

If you leave it blank, you get **relative imports** like:
```dart
import 'menu/menu_model.dart';
```

Both work in Flutter; absolute imports are slightly more readable in big apps.

### 5. Paste your JSON

Big text area in the middle. Copy a real API response (or request body) and paste it here.

> **Tip:** Click **Load sample** to see the tool in action with example JSON.

### 6. Pick options (covered in detail below)

The right sidebar has checkboxes for helpers and capabilities. Sensible defaults are pre-selected.

### 7. Click **Generate ▸**

You'll see a row of file tabs at the top of the right pane — one per generated class. Click any tab to view its content. The code is syntax-highlighted.

### 8. Copy or download

- **Copy active** — copies the currently visible file to your clipboard.
- **Download .zip** — packages all files (with their folder structure) into a ZIP. If you enabled `ConvertService`, the helper file is included too.
- **Download docs** — exports markdown documentation (great for handing context to teammates or AI assistants).
- **Save to Project** — adds these files to a saved project (see [Projects feature](#projects-feature)).

---

## Every option, explained

### "Use ConvertService in fromJson"

When **off** (default), parsing looks like:
```dart
id = json['id'];
```
This crashes if the server sends the field as the wrong type (e.g. a string `"12"` when you expect an int).

When **on**, parsing looks like:
```dart
id = ConvertService.convertInt(json['id']);
```
The `ConvertService` helper coerces values safely. If parsing fails, you get `0` or `""` or `false` instead of an exception.

**Recommended for any production app.** A real backend will eventually send unexpected types, and this prevents the entire screen from crashing.

When you enable this, the downloaded ZIP automatically includes a `utils/convert_service.dart` file that the generated classes reference.

### "Wrap each toJson field in a null check"

Without this, every field is sent to the server even if it's `null`:
```dart
data['contract_start_date'] = contractStartDate;  // sends null
```

With this enabled:
```dart
if (contractStartDate != null) {
  data['contract_start_date'] = contractStartDate;
}
```

**Auto-enabled when you pick Param mode** — request bodies almost always want this. Some APIs reject `null` values, and many ignore them but waste bandwidth.

### Capabilities

These add **static helper methods** inside each generated class. They're optional — turn them on if you find them useful, off if you want minimal output.

#### `parseItem(json)`
Parses one object safely:
```dart
final user = UserModel.parseItem(apiResponse.data);
```
If the input isn't an object, it returns an empty `UserModel()` instead of throwing.

#### `parseItems(json)`
Parses a list of objects, handling **two common API shapes**:
```dart
// shape 1: raw list
final list = UserModel.parseItems([{...}, {...}]);

// shape 2: wrapped under "data"
final list = UserModel.parseItems({ "data": [{...}, {...}] });
```

Both work without you needing to check the shape first.

#### `copyItem(source)`
Deep-copies one object. Useful when you want to edit a copy without mutating the original.

```dart
final clone = UserModel.copyItem(original);
clone.name = "New name";  // doesn't affect original
```

#### `copyItems(list)`
Deep-copies a list of objects.

#### `toString()` override
Replaces Dart's default `Instance of 'UserModel'` with something readable:
```dart
print(user); // prints "Alice" instead of "Instance of 'UserModel'"
```

The tool picks the most-likely-friendly field automatically: `name`, `title`, `label`, `id`, or the first string field.

---

## Use cases

### 1. Starting a new Flutter screen
You got an API contract from the backend team — a sample JSON response. Paste it here, generate the model, drop it into your `lib/features/<screen>/models/` folder, and start writing UI immediately.

### 2. Building a request body model
You need to call `POST /login` with `{ email, password, device_id }`. Paste a sample body, switch to Param mode, generate `PmLoginModel`. The `toJson()` is null-safe by default, so optional fields aren't sent when empty.

### 3. Migrating a legacy app
Your app has hand-written models that crash on `null` fields. Paste a real API response, enable ConvertService, generate, and replace the old model. The new one survives any kind of dirty data.

### 4. Building multiple features at once
Use the **Projects** tab. Create a project for the app you're building. Each time you generate a model, click **Save to Project** with a feature name (e.g. `audit`, `profile`, `dashboard`). When you're done for the day, hit **Download project ZIP** and you get a ready-to-extract `lib/features/...` tree.

### 5. Documenting an API for your team
Generate models from each endpoint. Use **Download docs** — you get a markdown bundle showing every field, type, and the original sample JSON. Drop it in your repo wiki or share it with new joiners.

### 6. Feeding context to an AI assistant
The markdown docs are formatted for readability. Paste them into ChatGPT/Claude/Cursor when asking for help with API integration — the assistant gets the full schema in seconds.

---

## What you get out

For a JSON like the [Quick example](#quick-example) above, with **API mode** + **all capabilities** + **ConvertService**, you get a folder like this:

```
api_home/
├── api_home_model.dart       <- root class (ApiHomeModel)
├── user_model.dart           <- UserModel (no nested objects → flat file)
└── menu/                     <- menu has nested sub_menu → its own folder
    ├── menu_model.dart       <- MenuModel
    └── sub_menu_model.dart   <- SubMenuModel
utils/
└── convert_service.dart      <- helper, only if ConvertService option is on
```

**Folder rule (simple):**
- A class with **no nested objects** lives as a flat file in its parent folder.
- A class with **nested objects** gets its own subfolder.
- The root class always gets its own folder named `api_<root>` or `pm_<root>`.

This keeps deep models from cluttering one giant folder.

---

## Projects feature

The **Projects** tab lets you accumulate multiple generated model sets into one workspace.

### How it works

1. Click **+ New** in the Projects tab.
2. Give it a name (e.g. the name of your Flutter app).
3. Go back to **Generator**, paste JSON, generate.
4. Click **Save to Project** — pick the project, and give it a "feature name" (e.g. `audit`, `profile`).
5. Repeat for every endpoint.

When you're ready, open the project and click **Download project ZIP**. You get this layout:

```
my-app/
├── lib/
│   ├── features/
│   │   ├── audit/
│   │   │   └── models/
│   │   │       ├── api_audit_list/
│   │   │       └── pm_audit_filter/
│   │   ├── profile/
│   │   │   └── models/
│   │   └── dashboard/
│   │       └── models/
│   └── core/
│       └── utils/
│           └── convert_service.dart   (only if any saved model uses it)
└── README.md
```

This matches the standard Flutter "feature-first" folder layout.

### Where projects live

In your browser's **localStorage**. They never leave your device. No server, no signup. If you clear your browser data, projects are gone — so download ZIPs of important work.

---

## The ConvertService helper

The bundled `convert_service.dart` is a small Dart class with defensive type-conversion helpers. Every method:
- Accepts any input type
- Returns a sensible default (`0`, `""`, `false`, `null`, `[]`) on failure
- **Never throws an exception**

### Available helpers

| Method | Purpose |
|---|---|
| `convertString(data)` | Returns string, `""` on null |
| `convertStringNullable(data)` | Returns string or `null` |
| `convertInt(data)` | Coerces to int, `0` on failure |
| `convertIntNullable(data)` | Coerces to int or `null` |
| `convertNum(data)` | Coerces to num |
| `convertDouble(data)` | Coerces to double, `0` on failure |
| `convertDoubleNullable(data)` | Coerces to double or `null` |
| `convertDoubleRound(data, fractionDigits: 2)` | Coerces and rounds |
| `convertBool(data)` | Handles "true"/"1"/"yes"/true |
| `convertBoolInt(data)` | Treats "1" as true (some APIs use 0/1) |
| `convertDateTime(data)` | Parses ISO date strings |
| `convertMap(data)` | Returns `Map<String, dynamic>` (parses JSON string if given) |
| `parseStringList(data)` | List of strings |
| `parseIntList(data)` | List of ints (decodes JSON string if given) |
| `parseDoubleList(data)` | List of doubles |
| `parseNumList(data)` | List of nums |
| `parseBoolList(data)` | List of bools |
| `parseList<T>(data, fromJson)` | Generic list of any model class |

### Get just the helper file

If you want only `convert_service.dart` (e.g. to drop into an existing project without changing the rest of your code), click **Download convert_service.dart only** in the sidebar — no JSON input needed.

---

## Documentation export

Two flavors:

### Per-generation docs (Generator tab → "Download docs")
Bundles markdown files describing the current generation:
- A `README.md` index listing every class
- One `.md` per class with field table (name, JSON key, Dart type), the original sample JSON, and the generated Dart for reference

### Project docs (Projects tab → "Download docs")
Same idea, but for every model set saved in the project. Useful for handover, code review, or onboarding.

---

## FAQ

### Is my JSON sent anywhere?

**No.** Everything runs in your browser. There's no backend. You can verify by opening the tool, switching to airplane mode, and confirming generation still works.

### Can I use this for sensitive / production data?

You can, with the same caveat as any browser tool: pasting real production JSON into a webpage means trusting that webpage's code. Since this tool is open source and runs entirely client-side, you can audit it. For maximum safety, [run it locally](#run-it-locally--self-host).

### Does this generate `freezed` / `json_serializable` classes?

No, by design. The output is plain Dart with manual `fromJson` / `toJson`. Reasons:
- Zero dependencies — works in any Flutter project as-is
- No build step required
- Readable — you can edit the generated class without re-running a code generator

If you specifically want `freezed`/`json_serializable`, use those packages directly.

### What if my JSON has a list with mixed types?

Mixed-type lists (e.g. `[1, "two", true]`) become `List<dynamic>?`. The tool can't infer a single type when there isn't one. You can refine to a more specific type by editing the generated class.

### Two of my fields produce the same class name. What happens?

The tool currently produces one shared class for both. Workaround: rename one of the JSON keys before pasting, or rename the generated class manually. We may add automatic name collision handling in a future version.

### Will my saved projects sync across devices?

No — they're stored in your browser's localStorage, which is per-device-per-browser. To move a project to another machine, download the project ZIP and re-import on the other device (manual for now).

### Can I edit a saved model set?

Not yet — saved sets are read-only snapshots. To "edit", regenerate from the source JSON and save again with a new feature name (or delete the old one first).

### Why two different "Model" suffixes? (`ApiHomeModel`, `MenuModel`)
The root class always gets a prefix (`Api` or `Pm`) so its role is obvious. Nested classes don't need it — `MenuModel` inside `ApiHomeModel` is clearly a sub-piece of an API response. This keeps names concise.

---

## Run it locally / Self-host

The tool is pure HTML/CSS/JavaScript with no build step. To run locally:

```bash
git clone https://github.com/Mahshook-HITEK/json_to_dart_advanced.git
cd json_to_dart_advanced
python3 -m http.server 8080
```

Then open <http://localhost:8080>. Any static file server works — `python3 -m http.server`, `npx serve`, `php -S`, VSCode Live Server, etc.

### Self-hosting on your own GitHub Pages

1. Fork or clone this repo to your account.
2. Push it to a public GitHub repo.
3. Go to **Settings → Pages → Source: Deploy from a branch → main → / (root) → Save**.
4. Wait ~30 seconds. Your fork is live at `https://<your-username>.github.io/<repo-name>/`.

No CI configuration needed. Push to main and Pages re-deploys automatically.

---

## Project structure (for contributors)

```
json_to_dart_advanced/
├── index.html              # UI shell (Generator / Projects / Docs tabs)
├── README.md               # this file
├── CLAUDE.md               # context for AI assistants
├── LICENSE                 # MIT
├── styles/
│   ├── theme.css           # color tokens (dark + light themes)
│   ├── main.css            # layout
│   └── components.css      # buttons, cards, forms, code preview, modals
└── js/
    ├── parser.js           # JSON value → typed model tree (type inference)
    ├── naming.js           # class name + folder layout (api/param rules)
    ├── generator.js        # tree → Dart code (the heart of the tool)
    ├── convertService.js   # convert_service.dart string template
    ├── downloader.js       # JSZip wrapper for ZIP downloads
    ├── projects.js         # localStorage project store
    ├── storage.js          # localStorage wrapper
    ├── docs.js             # markdown docs generator
    └── app.js              # UI controller (wires DOM events)
```

### Tech choices

- **No framework** — vanilla JS modules. Keeps the project small and the deploy story simple (just push the folder).
- **JSZip from CDN** — for ZIP downloads. The only external runtime dependency.
- **`<dialog>` element** — for modals. Modern browsers only.
- **LocalStorage** — for project persistence. No backend, no auth.

---

## License

[MIT](LICENSE) — free for personal and commercial use.

If this tool saves you time, consider starring the repo so others can find it.
