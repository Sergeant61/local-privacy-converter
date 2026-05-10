import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

import { app } from "electron";

const require = createRequire(import.meta.url);

function ffmpegBinaryName(): string {
  return process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
}

/** @ffmpeg-binary/ffmpeg (FFmpeg 7.x) ile eşleşen platform paketi adı. */
function ffmpegBinaryPlatformPackage(): string | null {
  const { platform, arch: cpu } = process;
  if (platform === "darwin" && cpu === "arm64") {
    return "@ffmpeg-binary/darwin-arm64";
  }
  if (platform === "darwin" && cpu === "x64") {
    return "@ffmpeg-binary/darwin-x64";
  }
  if (platform === "linux" && cpu === "arm64") {
    return "@ffmpeg-binary/linux-arm64";
  }
  if (platform === "linux" && cpu === "x64") {
    return "@ffmpeg-binary/linux-x64";
  }
  if (platform === "win32" && cpu === "x64") {
    return "@ffmpeg-binary/win32-x64";
  }
  return null;
}

function resolveFfmpegFromFfmpegBinaryPackage(): string | null {
  const pkg = ffmpegBinaryPlatformPackage();
  if (pkg === null) {
    return null;
  }
  try {
    const metaPkgJson = require.resolve("@ffmpeg-binary/ffmpeg/package.json");
    const nestedRequire = createRequire(metaPkgJson);
    const platformPkgJson = nestedRequire.resolve(`${pkg}/package.json`);
    const dir = path.dirname(platformPkgJson);
    const candidate = path.join(dir, ffmpegBinaryName());
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  } catch {
    /* İkili kurulu değil veya isteğe bağlı bağımlılık yüklenmedi */
  }
  return null;
}

/**
 * FFmpeg yolu: kullanıcı geçersiz kılma → LFC_FFMPEG_PATH → (paketliyse) resources/ffmpeg
 * → @ffmpeg-binary (FFmpeg 7.x gömülü ikili).
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

  const fromFfmpegBinary = resolveFfmpegFromFfmpegBinaryPackage();
  if (fromFfmpegBinary !== null) {
    return fromFfmpegBinary;
  }

  throw new Error(
    "Gömülü FFmpeg (7.x) bulunamadı. @ffmpeg-binary/ffmpeg kurulumunu veya desteklenen bir platform (ör. darwin arm64/x64, linux x64/arm64, win32 x64) kullandığınızı doğrulayın. Ayrıca LFC_FFMPEG_PATH ile özel ikili verebilirsiniz."
  );
}

function ffprobeBinaryName(): string {
  return process.platform === "win32" ? "ffprobe.exe" : "ffprobe";
}

/**
 * ffprobe yolu: geçersiz kılma → LFC_FFPROBE_PATH → (paketliyse) resources/ffmpeg → ffprobe-static.
 * Not: ffprobe-static hâlen FFmpeg 6.x ikilisi içerir; metadata okuma için genelde uygundur.
 */
export function resolveFfprobeExecutable(override?: string | undefined): string {
  const trimmed = override?.trim();
  if (trimmed && trimmed.length > 0) {
    return trimmed;
  }

  const fromEnv = process.env.LFC_FFPROBE_PATH?.trim();
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv;
  }

  if (app.isPackaged) {
    const packaged = path.join(process.resourcesPath, "ffmpeg", ffprobeBinaryName());
    if (fs.existsSync(packaged)) {
      return packaged;
    }
  }

  const mod = require("ffprobe-static") as { path?: string };
  const fromPkg = mod?.path;
  if (typeof fromPkg === "string" && fromPkg.length > 0 && fs.existsSync(fromPkg)) {
    return fromPkg;
  }

  throw new Error(
    "Gömülü ffprobe bulunamadı. ffprobe-static kurulumunu veya LFC_FFPROBE_PATH ortam değişkenini kontrol edin."
  );
}
