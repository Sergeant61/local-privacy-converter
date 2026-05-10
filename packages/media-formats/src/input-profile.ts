import type { MediaKind } from "@lfc/types";

const VIDEO_EXTENSIONS = new Set([
  "mp4",
  "m4v",
  "mkv",
  "webm",
  "avi",
  "mov",
  "wmv",
  "flv",
  "ogv",
  "mpg",
  "mpeg",
  "ts",
  "m2ts",
  "mts",
  "m2t",
  "3gp",
  "3g2",
  "asf",
  "divx",
  "vob",
  "f4v",
  "dv"
]);

const AUDIO_EXTENSIONS = new Set([
  "mp3",
  "wav",
  "flac",
  "aac",
  "m4a",
  "m4b",
  "ogg",
  "oga",
  "opus",
  "wma",
  "aiff",
  "aif",
  "ac3",
  "eac3",
  "dts",
  "mka",
  "ape",
  "wv",
  "caf",
  "au"
]);

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "bmp",
  "gif",
  "tif",
  "tiff",
  "heic",
  "heif",
  "avif"
]);

/** Dosya seçicide ve probede kullanılan birleşik uzantı listesi (noktasız, küçük harf). */
export const INPUT_EXTENSIONS: readonly string[] = Array.from(
  new Set<string>([
    ...VIDEO_EXTENSIONS,
    ...AUDIO_EXTENSIONS,
    ...IMAGE_EXTENSIONS
  ])
).sort((a, b) => a.localeCompare(b));

export function normalizeExtension(filenameOrExt: string): string {
  const base = filenameOrExt.includes(".")
    ? filenameOrExt.slice(filenameOrExt.lastIndexOf(".") + 1)
    : filenameOrExt;
  return base.trim().toLowerCase();
}

export function classifyExtension(ext: string): MediaKind | "unknown" {
  const e = normalizeExtension(ext);
  if (VIDEO_EXTENSIONS.has(e)) {
    return "video";
  }
  if (AUDIO_EXTENSIONS.has(e)) {
    return "audio";
  }
  if (IMAGE_EXTENSIONS.has(e)) {
    return "image-only";
  }
  return "unknown";
}

export function isKnownInputExtension(ext: string): boolean {
  return classifyExtension(ext) !== "unknown";
}
