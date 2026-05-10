#!/usr/bin/env node
/**
 * Copies platform-specific ffmpeg + ffprobe binaries into
 * apps/desktop/extra-resources/ffmpeg/ so electron-builder can embed them
 * as extraResources → resourcesPath/ffmpeg/{ffmpeg,ffprobe}[.exe]
 *
 * Run before `electron-builder` in CI and local packaging.
 */

import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const destDir = path.join(root, "apps", "desktop", "extra-resources", "ffmpeg");

fs.mkdirSync(destDir, { recursive: true });

const isWin = process.platform === "win32";

// createRequire anchored to the desktop app so pnpm symlinks resolve correctly
const desktopRequire = createRequire(
  path.join(root, "apps", "desktop", "electron", "main.ts")
);

// ── ffmpeg ─────────────────────────────────────────────────────────────────

const FFMPEG_PLATFORM_PKGS = {
  "darwin-arm64": "@ffmpeg-binary/darwin-arm64",
  "darwin-x64":   "@ffmpeg-binary/darwin-x64",
  "linux-arm64":  "@ffmpeg-binary/linux-arm64",
  "linux-x64":    "@ffmpeg-binary/linux-x64",
  "win32-x64":    "@ffmpeg-binary/win32-x64",
};

const platformKey = `${process.platform}-${process.arch}`;
const ffmpegPlatformPkg = FFMPEG_PLATFORM_PKGS[platformKey];

if (!ffmpegPlatformPkg) {
  console.error(`[prepare-ffmpeg] Unsupported platform: ${platformKey}`);
  process.exit(1);
}

const ffmpegBin = isWin ? "ffmpeg.exe" : "ffmpeg";

try {
  const metaPath = desktopRequire.resolve("@ffmpeg-binary/ffmpeg/package.json");
  const nestedRequire = createRequire(metaPath);
  const platformPkgPath = nestedRequire.resolve(`${ffmpegPlatformPkg}/package.json`);
  const src = path.join(path.dirname(platformPkgPath), ffmpegBin);
  if (!fs.existsSync(src)) throw new Error(`binary not found: ${src}`);
  const dest = path.join(destDir, ffmpegBin);
  fs.copyFileSync(src, dest);
  if (!isWin) fs.chmodSync(dest, 0o755);
  console.log(`✓ ffmpeg  →  ${path.relative(root, dest)}`);
} catch (err) {
  console.error("[prepare-ffmpeg] ffmpeg stage failed:", err.message);
  process.exit(1);
}

// ── ffprobe ────────────────────────────────────────────────────────────────

const ffprobeBin = isWin ? "ffprobe.exe" : "ffprobe";

try {
  const ffprobeStatic = desktopRequire("ffprobe-static");
  const src = ffprobeStatic?.path;
  if (!src || !fs.existsSync(src)) throw new Error(`ffprobe-static path not found: ${src}`);
  const dest = path.join(destDir, ffprobeBin);
  fs.copyFileSync(src, dest);
  if (!isWin) fs.chmodSync(dest, 0o755);
  console.log(`✓ ffprobe →  ${path.relative(root, dest)}`);
} catch (err) {
  console.error("[prepare-ffmpeg] ffprobe stage failed:", err.message);
  process.exit(1);
}
