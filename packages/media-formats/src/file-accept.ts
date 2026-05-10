import { INPUT_EXTENSIONS } from "./input-profile";

/** `<input type="file" accept="...">` değeri */
export function buildHtmlFileAccept(): string {
  return INPUT_EXTENSIONS.map((e) => `.${e}`).join(",");
}

/** Electron `dialog.showOpenDialog` filtreleri */
export function getElectronFileFilters(): { name: string; extensions: string[] }[] {
  return [
    {
      name: "Desteklenen medya",
      extensions: [...INPUT_EXTENSIONS]
    },
    { name: "Tüm dosyalar", extensions: ["*"] }
  ];
}
