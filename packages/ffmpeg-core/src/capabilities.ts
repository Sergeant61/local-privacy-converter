import type { FfmpegCapabilities } from "@lfc/types";

import { joinedOutput, spawnText } from "./spawn-text";

const FLAG_RE = /^\s*[A-Z.]{6}\s+([a-zA-Z0-9_-]+)/;

/**
 * `ffmpeg -encoders` / `-decoders` metninden codec kimliklerini çıkarır.
 * İlk sütun bayraklarını atlayıp ikinci alanı alır.
 */
export function parseFfmpegCodecTable(text: string): string[] {
  const seen = new Set<string>();
  for (const line of text.split("\n")) {
    const m = line.match(FLAG_RE);
    const name = m?.[1];
    if (name) {
      seen.add(name);
    }
  }
  return [...seen];
}

/**
 * `ffmpeg -hwaccels` çıktısı: başlık satırını atlayıp yöntem adlarını döner.
 */
export function parseHwaccels(text: string): string[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) {
    return [];
  }
  const head = lines[0];
  const body = head !== undefined && head.toLowerCase().includes("hardware") ? lines.slice(1) : lines;
  return body.filter((l) => !l.includes(":"));
}

export async function listFfmpegCapabilities(ffmpegExecutable: string): Promise<
  | { ok: true; value: FfmpegCapabilities }
  | { ok: false; message: string }
> {
  const [enc, dec, hw] = await Promise.all([
    spawnText(ffmpegExecutable, ["-hide_banner", "-encoders"]),
    spawnText(ffmpegExecutable, ["-hide_banner", "-decoders"]),
    spawnText(ffmpegExecutable, ["-hide_banner", "-hwaccels"])
  ]);

  if (!enc.ok) {
    return {
      ok: false,
      message: enc.stderr.trim() || `ffmpeg encoders çıkış kodu: ${enc.code ?? "?"}`
    };
  }
  if (!dec.ok) {
    return {
      ok: false,
      message: dec.stderr.trim() || `ffmpeg decoders çıkış kodu: ${dec.code ?? "?"}`
    };
  }
  if (!hw.ok) {
    return {
      ok: false,
      message: hw.stderr.trim() || `ffmpeg hwaccels çıkış kodu: ${hw.code ?? "?"}`
    };
  }

  const encText = joinedOutput(enc);
  const decText = joinedOutput(dec);
  const hwText = joinedOutput(hw);

  return {
    ok: true,
    value: {
      encoders: parseFfmpegCodecTable(encText),
      decoders: parseFfmpegCodecTable(decText),
      hwaccels: parseHwaccels(hwText)
    }
  };
}
