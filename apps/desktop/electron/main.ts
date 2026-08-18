import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, net, Notification, protocol, shell, Tray } from "electron";

// Register before app.whenReady so Chromium honours the scheme as "secure"
protocol.registerSchemesAsPrivileged([
  { scheme: "lpc", privileges: { secure: true, standard: true, supportFetchAPI: true } },
]);

import type { MediaProbeSummary } from "@lfc/types";
import {
  buildFfmpegArgs,
  ffprobeJsonToSummary,
  listFfmpegCapabilities,
  probeFfmpegVersion,
  runFfprobeJson,
  runFfmpegJob
} from "@lfc/ffmpeg-core";
import { getElectronFileFilters } from "@lfc/media-formats";
import {
  ipcFfmpegCapabilitiesRequestSchema,
  ipcGetFfmpegVersionRequestSchema,
  ipcMediaProbeRequestSchema,
  ipcOpenMediaDialogRequestSchema,
  ipcRunConvertJobRequestSchema,
  ipcSaveOutputDialogRequestSchema
} from "@lfc/validators";

import { resolveFfmpegExecutable, resolveFfprobeExecutable } from "./ffmpeg-resolve";

const VERSION_CHANNEL = "lfc/ffmpeg/get-version";
const PROBE_CHANNEL = "lfc/media/probe";
const CAPABILITIES_CHANNEL = "lfc/ffmpeg/capabilities";
const OPEN_MEDIA_CHANNEL = "lfc/media/open-dialog";
const SAVE_OUTPUT_CHANNEL = "lfc/media/save-output-dialog";
const RUN_CONVERT_CHANNEL = "lfc/ffmpeg/convert";
const RUN_CONVERT_PROGRESS_CHANNEL = "lfc/ffmpeg/convert-progress";
const READ_PREVIEW_CHANNEL = "lfc/media/read-preview";
const GET_OUTPUT_DIR_CHANNEL = "lfc/media/get-output-dir";
const SHOW_IN_FOLDER_CHANNEL = "lfc/shell/show-in-folder";
const CANCEL_CONVERT_CHANNEL = "lfc/ffmpeg/cancel-convert";
const AUDIO_MERGE_CHANNEL = "lfc/ffmpeg/audio-merge";
const VIDEO_MERGE_CHANNEL = "lfc/ffmpeg/video-merge";
const FRAME_EXTRACT_CHANNEL = "lfc/ffmpeg/frame-extract";
const GIF_CONVERT_CHANNEL = "lfc/ffmpeg/gif-convert";
const SETTINGS_GET_CHANNEL = "lfc/settings/get";
const SETTINGS_SET_CHANNEL = "lfc/settings/set";
const SUBTITLE_PROBE_CHANNEL = "lfc/ffmpeg/subtitle-probe";
const SUBTITLE_EXTRACT_CHANNEL = "lfc/ffmpeg/subtitle-extract";
const VIDEO_TRIM_CHANNEL = "lfc/ffmpeg/video-trim";
const AUDIO_NORMALIZE_CHANNEL = "lfc/ffmpeg/audio-normalize";
const WATERMARK_CHANNEL = "lfc/ffmpeg/watermark";
const METADATA_READ_CHANNEL = "lfc/ffmpeg/metadata-read";
const METADATA_WRITE_CHANNEL = "lfc/ffmpeg/metadata-write";
const APNG_CONVERT_CHANNEL = "lfc/ffmpeg/apng-convert";
const RUN_CONVERT_LOG_CHANNEL = "lfc/ffmpeg/convert-log";
const PROFILES_GET_CHANNEL = "lfc/profiles/get";
const PROFILES_SAVE_CHANNEL = "lfc/profiles/save";
const PROFILES_DELETE_CHANNEL = "lfc/profiles/delete";
const PDF_CONVERT_CHANNEL = "lfc/ffmpeg/pdf-convert";
const CHECK_UPDATE_CHANNEL = "lfc/app/check-update";

// Must be set before app.whenReady() so menu bar and dock show the correct name
app.setName("Local Privacy Converter");

interface LpcSettings {
  outputDir?: string;
  ffmpegBinary?: string;
  defaultQuality?: "high" | "compatible" | "balanced" | "small" | "very_small";
}

let lpcSettings: LpcSettings = {};

function settingsFilePath(): string {
  return path.join(app.getPath("userData"), "lpc-settings.json");
}

function loadSettings(): void {
  try {
    const raw = fs.readFileSync(settingsFilePath(), "utf-8");
    lpcSettings = JSON.parse(raw) as LpcSettings;
  } catch {
    lpcSettings = {};
  }
}

function saveSettings(patch: Partial<LpcSettings>): void {
  lpcSettings = { ...lpcSettings, ...patch };
  try {
    fs.writeFileSync(settingsFilePath(), JSON.stringify(lpcSettings, null, 2), "utf-8");
  } catch {
    /* ignore write errors */
  }
}

// ── Kullanıcı profilleri ──────────────────────────────────────────────────────

interface UserProfile {
  id: string;
  name: string;
  targetProfileId: string;
  qualityPreset?: string;
  resolutionPreset?: string;
  audioChannels?: number;
  extraFfmpegArgs?: string;
  createdAt: number;
}

function profilesFilePath(): string {
  return path.join(app.getPath("userData"), "lpc-profiles.json");
}

function loadProfiles(): UserProfile[] {
  try {
    const raw = fs.readFileSync(profilesFilePath(), "utf-8");
    return JSON.parse(raw) as UserProfile[];
  } catch {
    return [];
  }
}

function writeProfiles(profiles: UserProfile[]): void {
  try {
    fs.writeFileSync(profilesFilePath(), JSON.stringify(profiles, null, 2), "utf-8");
  } catch { /* ignore */ }
}

let currentConvertAbort: AbortController | null = null;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function setTaskbarProgress(progress: number | null) {
  if (!mainWindow) return;
  if (progress === null) {
    mainWindow.setProgressBar(-1);
  } else {
    mainWindow.setProgressBar(progress / 100);
  }
}

function createTray() {
  const resourceBase = app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, "..", "build-resources");

  try {
    // Build a multi-resolution native image for 1x + Retina @2x
    const img = nativeImage.createEmpty();
    const path1x = path.join(resourceBase, "tray-icon.png");
    const path2x = path.join(resourceBase, "tray-icon@2x.png");
    img.addRepresentation({ scaleFactor: 1.0, dataURL: nativeImage.createFromPath(path1x).toDataURL() });
    if (fs.existsSync(path2x)) {
      img.addRepresentation({ scaleFactor: 2.0, dataURL: nativeImage.createFromPath(path2x).toDataURL() });
    }
    // White template adapts to dark/light menu bar on macOS
    if (process.platform === "darwin") img.setTemplateImage(true);
    tray = new Tray(img);
    tray.setToolTip("Local Privacy Converter");
    updateTrayMenu("Hazır");
    tray.on("double-click", () => {
      mainWindow?.show();
    });
  } catch {
    // Tray may not be supported on all platforms
  }
}

function updateTrayMenu(statusLabel: string) {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: "Local Privacy Converter", enabled: false },
    { label: `Durum: ${statusLabel}`, enabled: false },
    { type: "separator" },
    { label: "Göster", click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { label: "Gizle", click: () => { mainWindow?.hide(); } },
    { type: "separator" },
    { label: "Çıkış", click: () => { app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

function notifyCompletion(title: string, body: string): void {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function pickVersionLine(stdout: string): string {
  const line = stdout
    .split("\n")
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate.toLowerCase().startsWith("ffmpeg version"));
  return line ?? stdout.split("\n").find(Boolean) ?? stdout.trim();
}

function wireIpcHandlers() {
  ipcMain.removeHandler(VERSION_CHANNEL);
  ipcMain.handle(
    VERSION_CHANNEL,
    async (
      _event,
      payload
    ): Promise<
      | {
          ok: true;
          versionLine: string;
        }
      | {
          ok: false;
          message: string;
        }
    > => {
      const parsed = ipcGetFfmpegVersionRequestSchema.safeParse(payload ?? {});
      if (!parsed.success) {
        return { ok: false, message: "Geçersiz parametre paketi." };
      }

      let executable: string;
      try {
        executable = resolveFfmpegExecutable(parsed.data.executable);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, message };
      }

      const result = await probeFfmpegVersion(executable);
      if (result.ok) {
        return {
          ok: true,
          versionLine: pickVersionLine(result.stdout)
        };
      }

      const message =
        result.stderr.trim().length > 0
          ? result.stderr.trim()
          : `ffmpeg çıkış kodu: ${result.code ?? "bilinmiyor"}`;

      return { ok: false, message };
    }
  );

  ipcMain.removeHandler(PROBE_CHANNEL);
  ipcMain.handle(
    PROBE_CHANNEL,
    async (
      _event,
      payload
    ): Promise<{ ok: true; summary: MediaProbeSummary } | { ok: false; message: string }> => {
      const parsed = ipcMediaProbeRequestSchema.safeParse(payload ?? {});
      if (!parsed.success) {
        return { ok: false, message: "Geçersiz parametre paketi." };
      }

      let ffprobeExe: string;
      try {
        ffprobeExe = resolveFfprobeExecutable(parsed.data.ffprobeExecutable);
      } catch (error: unknown) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }

      const raw = await runFfprobeJson(ffprobeExe, parsed.data.inputPath);
      if (!raw.ok) {
        return { ok: false, message: raw.message };
      }

      const summary = ffprobeJsonToSummary(raw.json);
      return { ok: true, summary };
    }
  );

  ipcMain.removeHandler(CAPABILITIES_CHANNEL);
  ipcMain.handle(
    CAPABILITIES_CHANNEL,
    async (
      _event,
      payload
    ): Promise<
      | { ok: true; value: { encoders: string[]; decoders: string[]; hwaccels: string[] } }
      | { ok: false; message: string }
    > => {
      const parsed = ipcFfmpegCapabilitiesRequestSchema.safeParse(payload ?? {});
      if (!parsed.success) {
        return { ok: false, message: "Geçersiz parametre paketi." };
      }

      let executable: string;
      try {
        executable = resolveFfmpegExecutable(parsed.data.ffmpegExecutable);
      } catch (error: unknown) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }

      return await listFfmpegCapabilities(executable);
    }
  );

  ipcMain.removeHandler(OPEN_MEDIA_CHANNEL);
  ipcMain.handle(OPEN_MEDIA_CHANNEL, async (event, payload): Promise<{ canceled: true } | { canceled: false; filePath: string }> => {
    const parsed = ipcOpenMediaDialogRequestSchema.safeParse(payload ?? {});
    if (!parsed.success) {
      return { canceled: true };
    }

    const parent = BrowserWindow.fromWebContents(event.sender);
    if (parent == null) {
      return { canceled: true };
    }
    const result = await dialog.showOpenDialog(parent, {
      properties: ["openFile"],
      filters: getElectronFileFilters()
    });

    if (result.canceled || !result.filePaths[0]) {
      return { canceled: true };
    }

    return { canceled: false, filePath: result.filePaths[0] };
  });

  ipcMain.removeHandler(SAVE_OUTPUT_CHANNEL);
  ipcMain.handle(
    SAVE_OUTPUT_CHANNEL,
    async (
      event,
      payload
    ): Promise<{ canceled: true } | { canceled: false; filePath: string }> => {
      const parsed = ipcSaveOutputDialogRequestSchema.safeParse(payload ?? {});
      if (!parsed.success) {
        return { canceled: true };
      }

      const parent = BrowserWindow.fromWebContents(event.sender);
      if (parent == null) {
        return { canceled: true };
      }

      const result = await dialog.showSaveDialog(parent, {
        defaultPath: parsed.data.defaultPath,
        filters: parsed.data.filters,
        title: parsed.data.title
      });

      if (result.canceled || !result.filePath) {
        return { canceled: true };
      }

      return { canceled: false, filePath: result.filePath };
    }
  );

  ipcMain.removeHandler(RUN_CONVERT_CHANNEL);
  ipcMain.handle(
    RUN_CONVERT_CHANNEL,
    async (
      event,
      payload
    ): Promise<{ ok: true } | { ok: false; message: string; code?: number | null }> => {
      const parsed = ipcRunConvertJobRequestSchema.safeParse(payload ?? {});
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        const detail =
          first != null ? `${first.path.join(".") || "kök"}: ${first.message}` : parsed.error.message;
        return { ok: false, message: `Geçersiz dönüşüm paketi — ${detail}` };
      }

      let executable: string;
      try {
        executable = resolveFfmpegExecutable(parsed.data.ffmpegExecutable);
      } catch (error: unknown) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : String(error)
        };
      }

      // Hedef boyut bitrate'e çevrilebilsin diye kaynak süresini spec'e taşı.
      // Süre yoksa build-args boyut kısıtını hiç uygulamaz (kırpma yerine tam dosya).
      const durationSec = parsed.data.inputDurationSec ?? null;
      const specForArgs =
        durationSec != null && parsed.data.spec.videoHints?.targetSizeMb != null
          ? {
              ...parsed.data.spec,
              videoHints: { ...parsed.data.spec.videoHints, sourceDurationSec: durationSec }
            }
          : parsed.data.spec;

      const args = buildFfmpegArgs(specForArgs);
      const ac = new AbortController();
      currentConvertAbort = ac;
      const run = await runFfmpegJob(executable, args, {
        inputDurationSec: parsed.data.inputDurationSec ?? null,
        signal: ac.signal,
        onProgress: (percent) => {
          if (event.sender.isDestroyed()) return;
          event.sender.send(RUN_CONVERT_PROGRESS_CHANNEL, { percent });
          setTaskbarProgress(percent);
        },
        onLog: (line) => {
          if (event.sender.isDestroyed()) return;
          event.sender.send(RUN_CONVERT_LOG_CHANNEL, { line });
        }
      });
      currentConvertAbort = null;
      if (run.ok) {
        const outName = parsed.data.spec.outputPath.split(/[/\\]/).pop() ?? "dosya";
        notifyCompletion("Dönüşüm Tamamlandı", outName);
        return { ok: true };
      }

      if (!ac.signal.aborted) {
        notifyCompletion("Dönüşüm Başarısız", "Bir hata oluştu.");
      }

      return {
        ok: false,
        message: ac.signal.aborted ? "İptal edildi." : run.stderr,
        code: run.code
      };
    }
  );

  ipcMain.removeHandler(READ_PREVIEW_CHANNEL);
  ipcMain.handle(
    READ_PREVIEW_CHANNEL,
    async (
      _event,
      payload: unknown
    ): Promise<{ ok: true; dataUrl: string } | { ok: false; message: string }> => {
      const filePath = (payload as { filePath?: unknown })?.filePath;
      if (typeof filePath !== "string" || !filePath) {
        return { ok: false, message: "Dosya yolu gerekli." };
      }
      const mimeMap: Record<string, string> = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        webp: "image/webp",
        gif: "image/gif",
        bmp: "image/bmp",
        tif: "image/tiff",
        tiff: "image/tiff"
      };
      const ext = (filePath.split(".").pop() ?? "").toLowerCase();
      const mime = mimeMap[ext];
      if (!mime) {
        return { ok: false, message: "Bu format için önizleme desteklenmiyor." };
      }
      try {
        const buffer = await fs.promises.readFile(filePath);
        return { ok: true, dataUrl: `data:${mime};base64,${buffer.toString("base64")}` };
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }
    }
  );

  ipcMain.removeHandler(GET_OUTPUT_DIR_CHANNEL);
  ipcMain.handle(
    GET_OUTPUT_DIR_CHANNEL,
    async (): Promise<{ ok: true; dir: string } | { ok: false; message: string }> => {
      try {
        const dir = lpcSettings.outputDir?.trim()
          ? lpcSettings.outputDir.trim()
          : path.join(app.getPath("documents"), "LPC");
        await fs.promises.mkdir(dir, { recursive: true });
        return { ok: true, dir };
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }
    }
  );

  ipcMain.removeHandler(SHOW_IN_FOLDER_CHANNEL);
  ipcMain.handle(SHOW_IN_FOLDER_CHANNEL, (_event, payload: unknown): void => {
    const filePath = (payload as { filePath?: unknown })?.filePath;
    if (typeof filePath === "string" && filePath) {
      shell.showItemInFolder(filePath);
    }
  });

  ipcMain.removeHandler(CANCEL_CONVERT_CHANNEL);
  ipcMain.handle(CANCEL_CONVERT_CHANNEL, (): void => {
    currentConvertAbort?.abort();
  });

  // --- Ayarlar ---
  ipcMain.removeHandler(SETTINGS_GET_CHANNEL);
  ipcMain.handle(SETTINGS_GET_CHANNEL, (): LpcSettings => {
    return { ...lpcSettings };
  });

  ipcMain.removeHandler(SETTINGS_SET_CHANNEL);
  ipcMain.handle(
    SETTINGS_SET_CHANNEL,
    async (
      _event,
      payload: unknown
    ): Promise<{ ok: true } | { ok: false; message: string }> => {
      const p = payload as Partial<LpcSettings> & { pickOutputDir?: boolean };
      if (p?.pickOutputDir) {
        const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
        if (result.canceled || !result.filePaths[0]) {
          return { ok: false, message: "İptal edildi." };
        }
        saveSettings({ outputDir: result.filePaths[0] });
        return { ok: true };
      }
      const patch: Partial<LpcSettings> = {};
      if (typeof p?.outputDir === "string") patch.outputDir = p.outputDir;
      if (typeof p?.ffmpegBinary === "string") patch.ffmpegBinary = p.ffmpegBinary;
      if (typeof p?.defaultQuality === "string") patch.defaultQuality = p.defaultQuality as LpcSettings["defaultQuality"];
      saveSettings(patch);
      return { ok: true };
    }
  );

  // --- Kullanıcı Profilleri ---
  ipcMain.removeHandler(PROFILES_GET_CHANNEL);
  ipcMain.handle(PROFILES_GET_CHANNEL, (): UserProfile[] => {
    return loadProfiles();
  });

  ipcMain.removeHandler(PROFILES_SAVE_CHANNEL);
  ipcMain.handle(
    PROFILES_SAVE_CHANNEL,
    (_event, payload: unknown): { ok: true } | { ok: false; message: string } => {
      const p = payload as Partial<UserProfile>;
      if (typeof p?.name !== "string" || !p.name.trim()) {
        return { ok: false, message: "Profil adı gerekli." };
      }
      if (typeof p?.targetProfileId !== "string" || !p.targetProfileId) {
        return { ok: false, message: "Hedef profil gerekli." };
      }
      const profiles = loadProfiles();
      const id = p.id ?? `profile-${Date.now()}`;
      const existing = profiles.findIndex((pr) => pr.id === id);
      const entry: UserProfile = {
        id,
        name: p.name.trim(),
        targetProfileId: p.targetProfileId,
        qualityPreset: typeof p.qualityPreset === "string" ? p.qualityPreset : undefined,
        resolutionPreset: typeof p.resolutionPreset === "string" ? p.resolutionPreset : undefined,
        audioChannels: typeof p.audioChannels === "number" ? p.audioChannels : undefined,
        extraFfmpegArgs: typeof p.extraFfmpegArgs === "string" ? p.extraFfmpegArgs : undefined,
        createdAt: existing >= 0 ? (profiles[existing]?.createdAt ?? Date.now()) : Date.now()
      };
      if (existing >= 0) {
        profiles[existing] = entry;
      } else {
        profiles.push(entry);
      }
      writeProfiles(profiles);
      return { ok: true };
    }
  );

  ipcMain.removeHandler(PROFILES_DELETE_CHANNEL);
  ipcMain.handle(
    PROFILES_DELETE_CHANNEL,
    (_event, payload: unknown): { ok: true } | { ok: false; message: string } => {
      const id = (payload as { id?: unknown })?.id;
      if (typeof id !== "string") return { ok: false, message: "ID gerekli." };
      const profiles = loadProfiles().filter((p) => p.id !== id);
      writeProfiles(profiles);
      return { ok: true };
    }
  );

  // --- Güncelleme Kontrolü ---
  ipcMain.removeHandler(CHECK_UPDATE_CHANNEL);
  ipcMain.handle(
    CHECK_UPDATE_CHANNEL,
    (): Promise<
      | { ok: true; currentVersion: string; latestVersion: string; hasUpdate: boolean; releaseUrl: string }
      | { ok: false; message: string }
    > => {
      const currentVersion = app.getVersion();
      return new Promise((resolve) => {
        const https = require("node:https") as typeof import("node:https");
        const options = {
          hostname: "api.github.com",
          path: "/repos/recepozen/file-converter-api/releases/latest",
          method: "GET",
          headers: { "User-Agent": "LPC-App", Accept: "application/vnd.github.v3+json" }
        };
        const req = https.get(options, (res) => {
          let body = "";
          res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
          res.on("end", () => {
            try {
              const json = JSON.parse(body) as { tag_name?: string; html_url?: string };
              const tag = json.tag_name?.replace(/^v/, "") ?? "";
              if (!tag) {
                resolve({ ok: false, message: "Sürüm etiketi alınamadı." });
                return;
              }
              const hasUpdate = tag !== currentVersion;
              resolve({
                ok: true,
                currentVersion,
                latestVersion: tag,
                hasUpdate,
                releaseUrl: json.html_url ?? "https://github.com/recepozen/file-converter-api/releases"
              });
            } catch {
              resolve({ ok: false, message: "GitHub API yanıtı ayrıştırılamadı." });
            }
          });
        });
        req.on("error", (err: Error) => {
          resolve({ ok: false, message: `Ağ hatası: ${err.message}` });
        });
        req.setTimeout(8000, () => {
          req.destroy();
          resolve({ ok: false, message: "Bağlantı zaman aşımı." });
        });
      });
    }
  );

  // --- PDF → Görüntü ---
  ipcMain.removeHandler(PDF_CONVERT_CHANNEL);
  ipcMain.handle(
    PDF_CONVERT_CHANNEL,
    async (
      _event,
      payload: unknown
    ): Promise<{ ok: true; outputDir: string } | { ok: false; message: string }> => {
      const p = payload as { inputPath?: unknown; format?: unknown; dpi?: unknown };
      const inputPath = p?.inputPath;
      const format = typeof p?.format === "string" ? p.format : "png";
      const dpi = typeof p?.dpi === "number" && p.dpi > 0 ? p.dpi : 150;

      if (typeof inputPath !== "string" || !inputPath) {
        return { ok: false, message: "PDF dosyası gerekli." };
      }

      // Determine output directory: same as input, with subdir
      const inputDir = path.dirname(inputPath);
      const inputBase = path.basename(inputPath, ".pdf");
      const outputDir = path.join(inputDir, `${inputBase}-sayfalar`);

      try {
        fs.mkdirSync(outputDir, { recursive: true });
      } catch {
        return { ok: false, message: "Çıktı klasörü oluşturulamadı." };
      }

      const outputPrefix = path.join(outputDir, "sayfa");

      return await new Promise((resolve) => {
        // Try pdftoppm (poppler-utils)
        const { spawn } = require("node:child_process") as typeof import("node:child_process");
        const args = [
          "-r", String(dpi),
          `-${format}`,
          inputPath,
          outputPrefix
        ];
        const proc = spawn("pdftoppm", args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
        let errText = "";
        proc.stderr?.on("data", (chunk: Buffer) => { errText += chunk.toString(); });
        proc.on("error", (err: NodeJS.ErrnoException) => {
          if (err.code === "ENOENT") {
            resolve({ ok: false, message: "pdftoppm bulunamadı. Poppler'ı yükleyin: `brew install poppler` (macOS) veya `apt install poppler-utils` (Linux)." });
          } else {
            resolve({ ok: false, message: err.message });
          }
        });
        proc.on("close", (code) => {
          if (code === 0) {
            resolve({ ok: true, outputDir });
          } else {
            resolve({ ok: false, message: errText.trim() || `pdftoppm çıkış kodu: ${code}` });
          }
        });
      });
    }
  );

  // --- Ses Birleştirme (Audio Merge) ---
  ipcMain.removeHandler(AUDIO_MERGE_CHANNEL);
  ipcMain.handle(
    AUDIO_MERGE_CHANNEL,
    async (
      event,
      payload: unknown
    ): Promise<{ ok: true } | { ok: false; message: string }> => {
      const p = payload as {
        inputPaths?: unknown;
        outputPath?: unknown;
        mode?: unknown;
        outputEncoder?: unknown;
      };
      const inputPaths = p?.inputPaths;
      const outputPath = p?.outputPath;
      const mode = (p?.mode as string) ?? "concat";
      const encoder = (p?.outputEncoder as string) ?? "libmp3lame";

      if (!Array.isArray(inputPaths) || inputPaths.length < 2) {
        return { ok: false, message: "En az 2 ses dosyası gerekli." };
      }
      if (typeof outputPath !== "string" || !outputPath) {
        return { ok: false, message: "Çıktı yolu gerekli." };
      }

      let executable: string;
      try {
        executable = resolveFfmpegExecutable(lpcSettings.ffmpegBinary);
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }

      const inputs: string[] = [];
      for (const p of inputPaths as string[]) {
        inputs.push("-i", p);
      }

      let filterArgs: string[];
      const n = (inputPaths as string[]).length;
      if (mode === "mix") {
        const inLabels = Array.from({ length: n }, (_, i) => `[${i}:a]`).join("");
        filterArgs = [
          "-filter_complex",
          `${inLabels}amix=inputs=${n}:duration=longest:dropout_transition=2[a]`,
          "-map", "[a]"
        ];
      } else {
        const inLabels = Array.from({ length: n }, (_, i) => `[${i}:a]`).join("");
        filterArgs = [
          "-filter_complex",
          `${inLabels}concat=n=${n}:v=0:a=1[a]`,
          "-map", "[a]"
        ];
      }

      const args = [...inputs, ...filterArgs, "-c:a", encoder, "-y", outputPath];
      const ac = new AbortController();
      currentConvertAbort = ac;
      updateTrayMenu("Dönüştürülüyor…");
      const run = await runFfmpegJob(executable, args, {
        signal: ac.signal,
        onProgress: (percent) => {
          if (event.sender.isDestroyed()) return;
          event.sender.send(RUN_CONVERT_PROGRESS_CHANNEL, { percent });
          setTaskbarProgress(percent);
        }
      });
      currentConvertAbort = null;
      setTaskbarProgress(null);
      if (run.ok) {
        updateTrayMenu("Hazır");
        notifyCompletion("Ses Birleştirme Tamamlandı", "Dosyalar başarıyla birleştirildi.");
        return { ok: true };
      }
      return { ok: false, message: ac.signal.aborted ? "İptal edildi." : run.stderr };
    }
  );

  // --- Video Birleştirme (Video Merge) ---
  ipcMain.removeHandler(VIDEO_MERGE_CHANNEL);
  ipcMain.handle(
    VIDEO_MERGE_CHANNEL,
    async (
      event,
      payload: unknown
    ): Promise<{ ok: true } | { ok: false; message: string }> => {
      const p = payload as { inputPaths?: unknown; outputPath?: unknown };
      const inputPaths = p?.inputPaths;
      const outputPath = p?.outputPath;

      if (!Array.isArray(inputPaths) || inputPaths.length < 2) {
        return { ok: false, message: "En az 2 video dosyası gerekli." };
      }
      if (typeof outputPath !== "string" || !outputPath) {
        return { ok: false, message: "Çıktı yolu gerekli." };
      }

      let executable: string;
      try {
        executable = resolveFfmpegExecutable(lpcSettings.ffmpegBinary);
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }

      // concat demuxer için geçici liste dosyası
      const listPath = outputPath + ".concat-list.txt";
      const listContent = (inputPaths as string[])
        .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
        .join("\n");
      await fs.promises.writeFile(listPath, listContent, "utf8");

      const args = [
        "-f", "concat", "-safe", "0",
        "-i", listPath,
        "-c", "copy",
        "-y", outputPath
      ];
      const ac = new AbortController();
      currentConvertAbort = ac;
      updateTrayMenu("Dönüştürülüyor…");
      const run = await runFfmpegJob(executable, args, {
        signal: ac.signal,
        onProgress: (percent) => {
          if (event.sender.isDestroyed()) return;
          event.sender.send(RUN_CONVERT_PROGRESS_CHANNEL, { percent });
          setTaskbarProgress(percent);
        }
      });
      currentConvertAbort = null;
      fs.promises.unlink(listPath).catch(() => undefined);
      if (run.ok) {
        notifyCompletion("Video Birleştirme Tamamlandı", "Dosyalar başarıyla birleştirildi.");
        return { ok: true };
      }
      return { ok: false, message: ac.signal.aborted ? "İptal edildi." : run.stderr };
    }
  );

  // --- Kare Çıkarma (Frame Extraction) ---
  ipcMain.removeHandler(FRAME_EXTRACT_CHANNEL);
  ipcMain.handle(
    FRAME_EXTRACT_CHANNEL,
    async (
      event,
      payload: unknown
    ): Promise<{ ok: true; outputDir: string } | { ok: false; message: string }> => {
      const p = payload as {
        inputPath?: unknown;
        outputDir?: unknown;
        intervalSec?: unknown;
        format?: unknown;
      };
      const inputPath = p?.inputPath;
      const outputDir = p?.outputDir;
      const intervalSec = typeof p?.intervalSec === "number" ? p.intervalSec : 1;
      const format = (p?.format as string) ?? "png";

      if (typeof inputPath !== "string" || !inputPath) {
        return { ok: false, message: "Giriş dosyası gerekli." };
      }
      if (typeof outputDir !== "string" || !outputDir) {
        return { ok: false, message: "Çıktı klasörü gerekli." };
      }

      let executable: string;
      try {
        executable = resolveFfmpegExecutable(lpcSettings.ffmpegBinary);
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }

      await fs.promises.mkdir(outputDir, { recursive: true });
      const outputPattern = path.join(outputDir, `frame-%04d.${format}`);
      const args = [
        "-i", inputPath,
        "-vf", `fps=1/${intervalSec}`,
        "-q:v", "2",
        "-y", outputPattern
      ];
      const ac = new AbortController();
      currentConvertAbort = ac;
      updateTrayMenu("Dönüştürülüyor…");
      const run = await runFfmpegJob(executable, args, {
        signal: ac.signal,
        onProgress: (percent) => {
          if (event.sender.isDestroyed()) return;
          event.sender.send(RUN_CONVERT_PROGRESS_CHANNEL, { percent });
          setTaskbarProgress(percent);
        }
      });
      currentConvertAbort = null;
      setTaskbarProgress(null);
      if (run.ok) {
        updateTrayMenu("Hazır");
        notifyCompletion("Kare Çıkarma Tamamlandı", `${outputDir.split(/[/\\]/).pop()} klasörüne kaydedildi.`);
        return { ok: true, outputDir };
      }
      return { ok: false, message: ac.signal.aborted ? "İptal edildi." : run.stderr };
    }
  );

  // --- GIF Dönüştürme (palettegen + paletteuse) ---
  ipcMain.removeHandler(GIF_CONVERT_CHANNEL);
  ipcMain.handle(
    GIF_CONVERT_CHANNEL,
    async (
      event,
      payload: unknown
    ): Promise<{ ok: true } | { ok: false; message: string }> => {
      const p = payload as {
        inputPath?: unknown;
        outputPath?: unknown;
        fps?: unknown;
        width?: unknown;
        loop?: unknown;
      };
      const inputPath = p?.inputPath;
      const outputPath = p?.outputPath;
      const fps = typeof p?.fps === "number" && p.fps > 0 ? p.fps : 10;
      const width = typeof p?.width === "number" && p.width > 0 ? p.width : 480;
      const loop = typeof p?.loop === "number" ? p.loop : 0;

      if (typeof inputPath !== "string" || !inputPath) {
        return { ok: false, message: "Giriş dosyası gerekli." };
      }
      if (typeof outputPath !== "string" || !outputPath) {
        return { ok: false, message: "Çıktı dosyası gerekli." };
      }

      let executable: string;
      try {
        executable = resolveFfmpegExecutable(lpcSettings.ffmpegBinary);
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }

      const filterComplex = [
        `[0:v]fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1]`,
        `[s0]palettegen=max_colors=256:stats_mode=diff[p]`,
        `[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`
      ].join(";");

      const args = [
        "-i", inputPath,
        "-filter_complex", filterComplex,
        "-loop", String(loop),
        "-y", outputPath
      ];

      const ac = new AbortController();
      currentConvertAbort = ac;
      updateTrayMenu("Dönüştürülüyor…");
      const run = await runFfmpegJob(executable, args, {
        signal: ac.signal,
        onProgress: (percent) => {
          if (event.sender.isDestroyed()) return;
          event.sender.send(RUN_CONVERT_PROGRESS_CHANNEL, { percent });
          setTaskbarProgress(percent);
        }
      });
      currentConvertAbort = null;
      setTaskbarProgress(null);
      if (run.ok) {
        updateTrayMenu("Hazır");
        notifyCompletion("GIF Oluşturuldu", "GIF dosyası kaydedildi.");
        return { ok: true };
      }
      return { ok: false, message: ac.signal.aborted ? "İptal edildi." : run.stderr };
    }
  );

  // --- APNG Dönüştürme ---
  ipcMain.removeHandler(APNG_CONVERT_CHANNEL);
  ipcMain.handle(
    APNG_CONVERT_CHANNEL,
    async (
      event,
      payload: unknown
    ): Promise<{ ok: true } | { ok: false; message: string }> => {
      const p = payload as {
        inputPath?: unknown;
        outputPath?: unknown;
        fps?: unknown;
        width?: unknown;
        plays?: unknown;
      };
      const inputPath = p?.inputPath;
      const outputPath = p?.outputPath;
      const fps = typeof p?.fps === "number" && p.fps > 0 ? p.fps : 15;
      const width = typeof p?.width === "number" && p.width > 0 ? p.width : 480;
      const plays = typeof p?.plays === "number" ? p.plays : 0;

      if (typeof inputPath !== "string" || !inputPath) {
        return { ok: false, message: "Giriş dosyası gerekli." };
      }
      if (typeof outputPath !== "string" || !outputPath) {
        return { ok: false, message: "Çıktı dosyası gerekli." };
      }

      let executable: string;
      try {
        executable = resolveFfmpegExecutable(lpcSettings.ffmpegBinary);
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }

      const vf = `fps=${fps},scale=${width}:-1:flags=lanczos`;
      const args = [
        "-i", inputPath,
        "-vf", vf,
        "-f", "apng",
        "-plays", String(plays),
        "-y", outputPath
      ];

      const ac = new AbortController();
      currentConvertAbort = ac;
      updateTrayMenu("Dönüştürülüyor…");
      const run = await runFfmpegJob(executable, args, {
        signal: ac.signal,
        onProgress: (percent) => {
          if (event.sender.isDestroyed()) return;
          event.sender.send(RUN_CONVERT_PROGRESS_CHANNEL, { percent });
          setTaskbarProgress(percent);
        }
      });
      currentConvertAbort = null;
      setTaskbarProgress(null);
      if (run.ok) {
        updateTrayMenu("Hazır");
        notifyCompletion("APNG Oluşturuldu", "APNG dosyası kaydedildi.");
        return { ok: true };
      }
      return { ok: false, message: ac.signal.aborted ? "İptal edildi." : run.stderr };
    }
  );

  // --- Altyazı Akışı Tespit ---
  ipcMain.removeHandler(SUBTITLE_PROBE_CHANNEL);
  ipcMain.handle(
    SUBTITLE_PROBE_CHANNEL,
    async (
      _event,
      payload: unknown
    ): Promise<
      | { ok: true; streams: { index: number; codecName: string; title: string; language: string }[] }
      | { ok: false; message: string }
    > => {
      const inputPath = (payload as { inputPath?: unknown })?.inputPath;
      if (typeof inputPath !== "string" || !inputPath) {
        return { ok: false, message: "Giriş dosyası gerekli." };
      }
      let ffprobeExec: string;
      try {
        ffprobeExec = resolveFfprobeExecutable(undefined);
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }
      const result = await runFfprobeJson(ffprobeExec, inputPath);
      if (!result.ok) return { ok: false, message: result.message };
      const streams = (result.json.streams ?? [])
        .map((s, i) => ({ ...s, globalIndex: i }))
        .filter((s) => s.codec_type === "subtitle")
        .map((s) => ({
          index: s.globalIndex,
          codecName: s.codec_name ?? "unknown",
          title: (s as Record<string, unknown>)["tags"]
            ? String(((s as Record<string, unknown>)["tags"] as Record<string, unknown>)?.["title"] ?? "")
            : "",
          language: (s as Record<string, unknown>)["tags"]
            ? String(((s as Record<string, unknown>)["tags"] as Record<string, unknown>)?.["language"] ?? "")
            : ""
        }));
      return { ok: true, streams };
    }
  );

  // --- Altyazı Akışı Çıkarma ---
  ipcMain.removeHandler(SUBTITLE_EXTRACT_CHANNEL);
  ipcMain.handle(
    SUBTITLE_EXTRACT_CHANNEL,
    async (
      _event,
      payload: unknown
    ): Promise<{ ok: true } | { ok: false; message: string }> => {
      const p = payload as { inputPath?: unknown; streamIndex?: unknown; outputPath?: unknown; format?: unknown };
      const inputPath = p?.inputPath;
      const streamIndex = typeof p?.streamIndex === "number" ? p.streamIndex : 0;
      const outputPath = p?.outputPath;

      if (typeof inputPath !== "string" || !inputPath) {
        return { ok: false, message: "Giriş dosyası gerekli." };
      }
      if (typeof outputPath !== "string" || !outputPath) {
        return { ok: false, message: "Çıktı dosyası gerekli." };
      }

      let executable: string;
      try {
        executable = resolveFfmpegExecutable(lpcSettings.ffmpegBinary);
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }

      const args = [
        "-i", inputPath,
        "-map", `0:${streamIndex}`,
        "-c:s", "copy",
        "-y", outputPath
      ];

      const result = await runFfmpegJob(executable, args, {});
      if (result.ok) return { ok: true };
      return { ok: false, message: result.stderr };
    }
  );

  // --- Video Trim ---
  ipcMain.removeHandler(VIDEO_TRIM_CHANNEL);
  ipcMain.handle(
    VIDEO_TRIM_CHANNEL,
    async (
      event,
      payload: unknown
    ): Promise<{ ok: true } | { ok: false; message: string }> => {
      const p = payload as {
        inputPath?: unknown;
        outputPath?: unknown;
        startSec?: unknown;
        endSec?: unknown;
        streamCopy?: unknown;
      };
      const inputPath = p?.inputPath;
      const outputPath = p?.outputPath;
      const startSec = typeof p?.startSec === "number" ? p.startSec : 0;
      const endSec = typeof p?.endSec === "number" ? p.endSec : null;
      const streamCopy = p?.streamCopy !== false;

      if (typeof inputPath !== "string" || !inputPath) {
        return { ok: false, message: "Giriş dosyası gerekli." };
      }
      if (typeof outputPath !== "string" || !outputPath) {
        return { ok: false, message: "Çıktı dosyası gerekli." };
      }

      let executable: string;
      try {
        executable = resolveFfmpegExecutable(lpcSettings.ffmpegBinary);
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }

      if (endSec !== null && endSec <= startSec) {
        return { ok: false, message: "Bitiş zamanı başlangıçtan büyük olmalı." };
      }

      const args: string[] = [];
      // `-ss` girdi tarafında hızlı aramayı sağlar, ancak zaman damgalarını sıfırlar.
      // Bu yüzden bitiş noktası `-to` ile değil, süre olarak `-t` ile verilmeli —
      // aksi halde 3-7 sn aralığı isteyen kullanıcı 7 sn'lik çıktı alır.
      if (startSec > 0) args.push("-ss", String(startSec));
      args.push("-i", inputPath);
      if (endSec !== null) args.push("-t", String(endSec - startSec));
      if (streamCopy) {
        args.push("-c", "copy");
      }
      args.push("-y", outputPath);

      const ac = new AbortController();
      currentConvertAbort = ac;
      updateTrayMenu("Dönüştürülüyor…");
      const run = await runFfmpegJob(executable, args, {
        signal: ac.signal,
        onProgress: (percent) => {
          if (event.sender.isDestroyed()) return;
          event.sender.send(RUN_CONVERT_PROGRESS_CHANNEL, { percent });
          setTaskbarProgress(percent);
        }
      });
      currentConvertAbort = null;
      setTaskbarProgress(null);
      if (run.ok) {
        updateTrayMenu("Hazır");
        notifyCompletion("Video Kırpma Tamamlandı", `${String(outputPath).split(/[/\\]/).pop()} kaydedildi.`);
        return { ok: true };
      }
      return { ok: false, message: ac.signal.aborted ? "İptal edildi." : run.stderr };
    }
  );

  // --- Ses Normalizasyonu (EBU R128 loudnorm) ---
  ipcMain.removeHandler(AUDIO_NORMALIZE_CHANNEL);
  ipcMain.handle(
    AUDIO_NORMALIZE_CHANNEL,
    async (
      event,
      payload: unknown
    ): Promise<{ ok: true } | { ok: false; message: string }> => {
      const p = payload as {
        inputPath?: unknown;
        outputPath?: unknown;
        targetLufs?: unknown;
        truePeak?: unknown;
        lra?: unknown;
      };
      const inputPath = p?.inputPath;
      const outputPath = p?.outputPath;
      const targetLufs = typeof p?.targetLufs === "number" ? p.targetLufs : -14;
      const truePeak = typeof p?.truePeak === "number" ? p.truePeak : -1;
      const lra = typeof p?.lra === "number" ? p.lra : 11;

      if (typeof inputPath !== "string" || !inputPath) {
        return { ok: false, message: "Giriş dosyası gerekli." };
      }
      if (typeof outputPath !== "string" || !outputPath) {
        return { ok: false, message: "Çıktı dosyası gerekli." };
      }

      let executable: string;
      try {
        executable = resolveFfmpegExecutable(lpcSettings.ffmpegBinary);
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }

      const loudnorm = `loudnorm=I=${targetLufs}:TP=${truePeak}:LRA=${lra}:print_format=none`;
      const args = [
        "-i", inputPath,
        "-af", loudnorm,
        "-y", outputPath
      ];

      const ac = new AbortController();
      currentConvertAbort = ac;
      updateTrayMenu("Dönüştürülüyor…");
      const run = await runFfmpegJob(executable, args, {
        signal: ac.signal,
        onProgress: (percent) => {
          if (event.sender.isDestroyed()) return;
          event.sender.send(RUN_CONVERT_PROGRESS_CHANNEL, { percent });
          setTaskbarProgress(percent);
        }
      });
      currentConvertAbort = null;
      setTaskbarProgress(null);
      if (run.ok) {
        updateTrayMenu("Hazır");
        notifyCompletion("Ses Normalizasyonu Tamamlandı", `${String(outputPath).split(/[/\\]/).pop()} kaydedildi.`);
        return { ok: true };
      }
      return { ok: false, message: ac.signal.aborted ? "İptal edildi." : run.stderr };
    }
  );

  // --- Filigran (Watermark) ---
  ipcMain.removeHandler(WATERMARK_CHANNEL);
  ipcMain.handle(
    WATERMARK_CHANNEL,
    async (
      event,
      payload: unknown
    ): Promise<{ ok: true } | { ok: false; message: string }> => {
      const p = payload as {
        inputPath?: unknown;
        outputPath?: unknown;
        mode?: unknown;
        text?: unknown;
        imagePath?: unknown;
        position?: unknown;
        opacity?: unknown;
        fontSize?: unknown;
        fontColor?: unknown;
      };
      const inputPath = p?.inputPath;
      const outputPath = p?.outputPath;
      const mode = String(p?.mode ?? "text");
      const text = String(p?.text ?? "Filigran");
      const imagePath = p?.imagePath;
      const position = String(p?.position ?? "bottomright");
      const opacity = typeof p?.opacity === "number" ? Math.min(1, Math.max(0, p.opacity)) : 0.5;
      const fontSize = typeof p?.fontSize === "number" ? p.fontSize : 36;
      const fontColor = String(p?.fontColor ?? "white");

      if (typeof inputPath !== "string" || !inputPath) {
        return { ok: false, message: "Giriş dosyası gerekli." };
      }
      if (typeof outputPath !== "string" || !outputPath) {
        return { ok: false, message: "Çıktı dosyası gerekli." };
      }

      let executable: string;
      try {
        executable = resolveFfmpegExecutable(lpcSettings.ffmpegBinary);
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }

      // Position mapping to FFmpeg overlay expressions
      const posMap: Record<string, string> = {
        topleft:     "10:10",
        topright:    "W-w-10:10",
        bottomleft:  "10:H-h-10",
        bottomright: "W-w-10:H-h-10",
        center:      "(W-w)/2:(H-h)/2",
      };
      const overlayPos = posMap[position] ?? posMap["bottomright"]!;

      let args: string[];
      if (mode === "image" && typeof imagePath === "string" && imagePath) {
        args = [
          "-i", inputPath,
          "-i", imagePath,
          "-filter_complex",
          `[1:v]format=rgba,colorchannelmixer=aa=${opacity}[wm];[0:v][wm]overlay=${overlayPos}`,
          "-codec:a", "copy",
          "-y", outputPath
        ];
      } else {
        const drawtext = [
          `text='${text.replace(/'/g, "\\'")}'`,
          `fontsize=${fontSize}`,
          `fontcolor=${fontColor}@${opacity}`,
          `x=${overlayPos.split(":")[0]}`,
          `y=${overlayPos.split(":")[1]}`,
          "shadowx=1",
          "shadowy=1",
          "shadowcolor=black@0.5",
        ].join(":");
        args = [
          "-i", inputPath,
          "-vf", `drawtext=${drawtext}`,
          "-codec:a", "copy",
          "-y", outputPath
        ];
      }

      const ac = new AbortController();
      currentConvertAbort = ac;
      updateTrayMenu("Dönüştürülüyor…");
      const run = await runFfmpegJob(executable, args, {
        signal: ac.signal,
        onProgress: (percent) => {
          if (event.sender.isDestroyed()) return;
          event.sender.send(RUN_CONVERT_PROGRESS_CHANNEL, { percent });
          setTaskbarProgress(percent);
        }
      });
      currentConvertAbort = null;
      setTaskbarProgress(null);
      if (run.ok) {
        updateTrayMenu("Hazır");
        notifyCompletion("Filigran Eklendi", `${String(outputPath).split(/[/\\]/).pop()} kaydedildi.`);
        return { ok: true };
      }
      return { ok: false, message: ac.signal.aborted ? "İptal edildi." : run.stderr };
    }
  );

  // --- Metadata Okuma ---
  ipcMain.removeHandler(METADATA_READ_CHANNEL);
  ipcMain.handle(
    METADATA_READ_CHANNEL,
    async (
      _event,
      payload: unknown
    ): Promise<{ ok: true; tags: Record<string, string> } | { ok: false; message: string }> => {
      const p = payload as { inputPath?: unknown };
      const inputPath = p?.inputPath;
      if (typeof inputPath !== "string" || !inputPath) {
        return { ok: false, message: "Giriş dosyası gerekli." };
      }
      let ffprobeExec: string;
      try {
        ffprobeExec = resolveFfprobeExecutable(lpcSettings.ffmpegBinary);
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }
      const result = await runFfprobeJson(ffprobeExec, inputPath);
      if (!result.ok) return { ok: false, message: result.message };
      const tags: Record<string, string> = {};
      const formatTags = (result.json as { format?: { tags?: Record<string, string> } }).format?.tags ?? {};
      for (const [k, v] of Object.entries(formatTags)) {
        tags[k.toLowerCase()] = String(v);
      }
      return { ok: true, tags };
    }
  );

  // --- Metadata Yazma ---
  ipcMain.removeHandler(METADATA_WRITE_CHANNEL);
  ipcMain.handle(
    METADATA_WRITE_CHANNEL,
    async (
      _event,
      payload: unknown
    ): Promise<{ ok: true } | { ok: false; message: string }> => {
      const p = payload as { inputPath?: unknown; outputPath?: unknown; tags?: unknown };
      const inputPath = p?.inputPath;
      const outputPath = p?.outputPath;
      const tags = p?.tags;

      if (typeof inputPath !== "string" || !inputPath) {
        return { ok: false, message: "Giriş dosyası gerekli." };
      }
      if (typeof outputPath !== "string" || !outputPath) {
        return { ok: false, message: "Çıktı dosyası gerekli." };
      }
      if (typeof tags !== "object" || tags === null) {
        return { ok: false, message: "Etiketler gerekli." };
      }

      let executable: string;
      try {
        executable = resolveFfmpegExecutable(lpcSettings.ffmpegBinary);
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }

      const args = ["-i", inputPath];
      for (const [k, v] of Object.entries(tags as Record<string, string>)) {
        if (typeof v === "string") {
          args.push("-metadata", `${k}=${v}`);
        }
      }
      args.push("-c", "copy", "-y", outputPath);

      const result = await runFfmpegJob(executable, args, {});
      if (result.ok) {
        notifyCompletion("Metadata Güncellendi", `${String(outputPath).split(/[/\\]/).pop()} kaydedildi.`);
        return { ok: true };
      }
      return { ok: false, message: result.stderr };
    }
  );
}

async function createWindow(): Promise<void> {
  const devUrl = process.env.VITE_DEV_SERVER_URL?.trim() ?? "";

  const window = new BrowserWindow({
    width: 980,
    height: 660,
    minWidth: 920,
    minHeight: 600,
    title: "Local Privacy Converter",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow = window;
  window.once("ready-to-show", () => window.show());

  if (devUrl.length > 0) {
    await window.loadURL(devUrl);
    window.webContents.openDevTools({ mode: "detach" });
  } else {
    await window.loadURL("lpc://localhost/");
  }
}

async function bootstrap(): Promise<void> {
  await app.whenReady();

  // Serve the SvelteKit static build via lpc:// so that absolute asset paths
  // (/_app/immutable/...) resolve correctly in the packaged app.
  const buildDir = path.join(__dirname, "..", "build");
  protocol.handle("lpc", (req) => {
    const { pathname } = new URL(req.url);
    const filePath = pathname === "/" || pathname === ""
      ? path.join(buildDir, "index.html")
      : path.join(buildDir, pathname);
    return net.fetch(pathToFileURL(filePath).toString());
  });

  loadSettings();
  wireIpcHandlers();
  await createWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow().catch((error: unknown) => console.error(error));
    }
  });
}

void bootstrap().catch((error: unknown) => console.error(error));

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
