// Single-shot file downloads + ZIP packaging for the generator panel.

import { convertServiceDart } from "./convertService.js";

export function triggerDownload(filename, content, mime = "text/plain") {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Build a ZIP for a single generation run.
// Files preserve their folder paths. If `useConvertService` is true, also bundle
// `utils/convert_service.dart` so the project compiles standalone.
export async function buildGenerationZip({ files, rootFolder, useConvertService }) {
  const zip = new JSZip();
  const root = rootFolder ? zip.folder(rootFolder) : zip;
  for (const f of files) {
    root.file(f.path, f.content);
  }
  if (useConvertService) {
    zip.folder("utils").file("convert_service.dart", convertServiceDart());
  }
  return zip.generateAsync({ type: "blob" });
}
