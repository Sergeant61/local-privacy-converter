import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

import { app } from "electron";

const require = createRequire(import.meta.url);

function ffmpegBinaryName(): string {
  return process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
}

/**
 * FFmpeg yolu: kullanıcı/geçersiz kılma → LFC_FFMPEG_PATH → (paketliyse) resources/ffmpeg → ffmpeg-static.
 * Gömülü ikili masaüstü dağıtımında PATH’e bağımlı olmamayı sağlar.
 */
export function resolveFfmpegExecutable(override?: string | undefined): string {
  const trimmed = override?.trim();
  if (trimmed && trimmed.length > 0) {
    return trimmed;
  }

  const fromEnv = process.env.LFC_FFMPEG_PATH?.trim();
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv;
  }

  if (app.isPackaged) {
    const packaged = path.join(process.resourcesPath, "ffmpeg", ffmpegBinaryName());
    if (fs.existsSync(packaged)) {
      return packaged;
    }
  }

  const bundled = require("ffmpeg-static") as string | null | undefined;
  if (typeof bundled === "string" && bundled.length > 0 && fs.existsSync(bundled)) {
    return bundled;
  }

  throw new Error(
    "Gömülü FFmpeg bulunamadı. Bağımlılık kurulumunu veya paket kaynaklarını kontrol edin."
  );
}
