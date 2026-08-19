/**
 * Tüm IPC handler'ları (renderer → main).
 *
 * Eskiden `main.ts` içindeki 1300 satırlık tek bir `wireIpcHandlers()`
 * fonksiyonuydu ve hiç testi yoktu — DENETIM.md'de bulunan kırık
 * özelliklerin çoğu (D-06, D-20) tam olarak burada saklanıyordu: argüman
 * üreticileri doğru çalışırken handler onları yanlış çağırıyordu.
 *
 * Ayrı modül olmasının tek nedeni test edilebilirlik: burası `electron`,
 * `@lfc/ffmpeg-core` ve `./ffmpeg-resolve` dışında hiçbir şeye dokunmuyor,
 * üçü de testte taklit edilebiliyor. Pencere, tepsi ve bildirim gibi
 * gerçekten pencereye bağlı işler `main.ts`'te kaldı ve buraya `IpcHost`
 * ile enjekte ediliyor (KALAN-ISLER.md K-02).
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";

import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";

import { getElectronFileFilters, isNewerVersion } from "@lfc/media-formats";
import type { MediaProbeSummary } from "@lfc/types";
import {
  applyImageSizeAttempt,
  buildFfmpegArgs,
  buildLoudnormApplyArgs,
  buildLoudnormMeasureArgs,
  buildLoudnormSinglePassArgs,
  buildTrimArgs,
  parseLoudnormJson,
  planImageSizeAttempts,
  targetSizeBytes,
  buildSubtitleExtractArgs,
  buildConcatCopyArgs,
  buildConcatListContent,
  buildVideoMergeFilterArgs,
  planVideoMerge,
  summarizeMergeInput,
  ffprobeJsonToSummary,
  listFfmpegCapabilities,
  probeFfmpegVersion,
  runFfprobeJson,
  runFfmpegJob
} from "@lfc/ffmpeg-core";
import {
  ipcFfmpegCapabilitiesRequestSchema,
  ipcGetFfmpegVersionRequestSchema,
  ipcMediaProbeRequestSchema,
  ipcOpenMediaDialogRequestSchema,
  ipcRunConvertJobRequestSchema,
  ipcSaveOutputDialogRequestSchema,
  ipcSettingsSetRequestSchema,
  ipcReadPreviewRequestSchema,
  ipcShowInFolderRequestSchema,
  ipcAudioMergeRequestSchema,
  ipcVideoMergeRequestSchema,
  ipcFrameExtractRequestSchema,
  ipcGifConvertRequestSchema,
  ipcApngConvertRequestSchema,
  ipcPdfConvertRequestSchema,
  ipcSubtitleProbeRequestSchema,
  ipcSubtitleExtractRequestSchema,
  ipcVideoTrimRequestSchema,
  ipcAudioNormalizeRequestSchema,
  ipcWatermarkRequestSchema,
  ipcMetadataReadRequestSchema,
  ipcMetadataWriteRequestSchema,
  ipcProfilesSaveRequestSchema,
  ipcProfilesDeleteRequestSchema,
  checkInputPath,
  checkInputPaths,
  checkOutputPath
} from "@lfc/validators";

import {
  APNG_CONVERT_CHANNEL,
  AUDIO_MERGE_CHANNEL,
  AUDIO_NORMALIZE_CHANNEL,
  CANCEL_CONVERT_CHANNEL,
  CAPABILITIES_CHANNEL,
  CHECK_UPDATE_CHANNEL,
  FRAME_EXTRACT_CHANNEL,
  GET_OUTPUT_DIR_CHANNEL,
  GIF_CONVERT_CHANNEL,
  METADATA_READ_CHANNEL,
  METADATA_WRITE_CHANNEL,
  OPEN_MEDIA_CHANNEL,
  PDF_CONVERT_CHANNEL,
  PROBE_CHANNEL,
  PROFILES_DELETE_CHANNEL,
  PROFILES_GET_CHANNEL,
  PROFILES_SAVE_CHANNEL,
  READ_PREVIEW_CHANNEL,
  RUN_CONVERT_CHANNEL,
  RUN_CONVERT_LOG_CHANNEL,
  RUN_CONVERT_PROGRESS_CHANNEL,
  SAVE_OUTPUT_CHANNEL,
  SETTINGS_GET_CHANNEL,
  SETTINGS_SET_CHANNEL,
  SHOW_IN_FOLDER_CHANNEL,
  SUBTITLE_EXTRACT_CHANNEL,
  SUBTITLE_PROBE_CHANNEL,
  VERSION_CHANNEL,
  VIDEO_MERGE_CHANNEL,
  VIDEO_TRIM_CHANNEL,
  WATERMARK_CHANNEL
} from "./channels";
import { resolveFfmpegExecutable, resolveFfprobeExecutable } from "./ffmpeg-resolve";

/**
 * Handler'ların pencereye bağlı olan tek ihtiyaçları.
 *
 * Enjekte ediliyor çünkü üçü de `mainWindow`/`tray` durumuna bakıyor; o durum
 * `main.ts`'te yaşıyor ve testte anlamı yok. Testler bunların yerine sayaç
 * tutan sahte fonksiyonlar veriyor — böylece "iş bitince bildirim gitti mi",
 * "ilerleme çubuğu sıfırlandı mı" gibi yan etkiler de doğrulanabiliyor.
 */
export interface IpcHost {
  setTaskbarProgress(progress: number | null): void;
  updateTrayMenu(statusLabel: string): void;
  notifyCompletion(title: string, body: string): void;
}

/** Güncelleme kontrolünün sorguladığı depo. `package.json` `repository` alanıyla aynı olmalı. */
const UPDATE_REPO = "Sergeant61/local-privacy-converter";

/**
 * Filtergraph içinde bir dosya yolu için kaçırma (`textfile=`, `fontfile=`).
 * Yalnızca ters bölü ve iki nokta — filtre seçenek ayracı bunlar.
 */
function escapeFilterPath(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/:/g, "\\:");
}

/** Tek kare görüntü çıktısı mı? Boyut limiti bunlarda kademeli sıkıştırmayla uygulanır. */
const STILL_IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "avif", "bmp", "tif", "tiff"]);

function isStillImagePath(outputPath: string): boolean {
  const ext = outputPath.split(".").pop()?.toLowerCase();
  return ext !== undefined && STILL_IMAGE_EXTS.has(ext);
}

async function fileSize(filePath: string): Promise<number | null> {
  try {
    return (await fs.promises.stat(filePath)).size;
  } catch {
    return null;
  }
}

type GuardFailure = { ok: false; message: string };

function guardFail(message: string): GuardFailure {
  return { ok: false, message };
}

interface LpcSettings {
  outputDir?: string;
  ffmpegBinary?: string;
  defaultQuality?: "high" | "compatible" | "balanced" | "small" | "very_small";
}

let lpcSettings: LpcSettings = {};

function settingsFilePath(): string {
  return path.join(app.getPath("userData"), "lpc-settings.json");
}

export function loadSettings(): void {
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

function pickVersionLine(stdout: string): string {
  const line = stdout
    .split("\n")
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate.toLowerCase().startsWith("ffmpeg version"));
  return line ?? stdout.split("\n").find(Boolean) ?? stdout.trim();
}

export function wireIpcHandlers(host: IpcHost): void {
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
        executable = resolveFfmpegExecutable(lpcSettings.ffmpegBinary);
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
        ffprobeExe = resolveFfprobeExecutable(lpcSettings.ffmpegBinary);
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
        executable = resolveFfmpegExecutable(lpcSettings.ffmpegBinary);
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
        executable = resolveFfmpegExecutable(lpcSettings.ffmpegBinary);
      } catch (error: unknown) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : String(error)
        };
      }

      // Kaynak ölçülerini spec'e taşı: hedef boyut bitrate'e ancak süreyle
      // çevrilebiliyor, donanım kodlayıcılarının bitrate'i de kare alanına
      // bağlı (DENETIM.md D-04, D-17). Süre yoksa build-args boyut kısıtını
      // hiç uygulamaz — kırpmaktansa tam dosya yeğdir.
      const spec = parsed.data.spec;
      const needsSourceInfo =
        spec.videoHints?.targetSizeMb != null ||
        (spec.videoEncoder ?? "").endsWith("_videotoolbox");

      let durationSec = parsed.data.inputDurationSec ?? null;
      let sourceWidth: number | undefined;
      let sourceHeight: number | undefined;
      if (needsSourceInfo) {
        try {
          const probe = await runFfprobeJson(
            resolveFfprobeExecutable(lpcSettings.ffmpegBinary),
            spec.inputPath
          );
          if (probe.ok) {
            const video = probe.json.streams?.find((st) => st.codec_type === "video");
            if (typeof video?.width === "number" && video.width > 0) sourceWidth = video.width;
            if (typeof video?.height === "number" && video.height > 0) sourceHeight = video.height;
            const probed = Number(probe.json.format?.duration);
            if (durationSec == null && Number.isFinite(probed) && probed > 0) durationSec = probed;
          }
        } catch {
          // Ölçü alınamazsa build-args ilgili kısıtı uygulamaz; iş yine de koşar.
        }
      }

      const extraHints = {
        ...(durationSec != null ? { sourceDurationSec: durationSec } : {}),
        ...(sourceWidth != null ? { sourceWidth } : {}),
        ...(sourceHeight != null ? { sourceHeight } : {})
      };
      const specForArgs =
        Object.keys(extraHints).length > 0
          ? { ...spec, videoHints: { ...spec.videoHints, ...extraHints } }
          : spec;

      const ac = new AbortController();
      currentConvertAbort = ac;

      const runOnce = (jobSpec: typeof specForArgs) =>
        runFfmpegJob(executable, buildFfmpegArgs(jobSpec), {
          inputDurationSec: parsed.data.inputDurationSec ?? null,
          signal: ac.signal,
          onProgress: (percent) => {
            if (event.sender.isDestroyed()) return;
            event.sender.send(RUN_CONVERT_PROGRESS_CHANNEL, { percent });
            host.setTaskbarProgress(percent);
          },
          onLog: (line) => {
            if (event.sender.isDestroyed()) return;
            event.sender.send(RUN_CONVERT_LOG_CHANNEL, { line });
          }
        });

      let run = await runOnce(specForArgs);

      // Görüntü çıktısında boyut hedefi bitrate'e çevrilemez — süre yok. Ölç ve
      // daralt: kalite kademesi düşürülür, tükenirse kare küçültülür
      // (DENETIM.md D-09). Video/ses tarafı zaten bitrate bütçesiyle hallediliyor.
      const sizeLimit = targetSizeBytes(specForArgs);
      if (run.ok && sizeLimit != null && isStillImagePath(specForArgs.outputPath)) {
        const attempts = planImageSizeAttempts({
          qualityPreset: specForArgs.videoHints?.qualityPreset,
          width: specForArgs.videoHints?.width ?? sourceWidth,
          height: specForArgs.videoHints?.height ?? sourceHeight
        });
        let size = await fileSize(specForArgs.outputPath);
        // İlk deneme zaten koşuldu; sıradakilerden devam et.
        for (let i = 1; i < attempts.length && size != null && size > sizeLimit; i++) {
          if (ac.signal.aborted) break;
          const attempt = attempts[i];
          if (attempt === undefined) break;
          const next = await runOnce(applyImageSizeAttempt(specForArgs, attempt));
          if (!next.ok) break;
          run = next;
          size = await fileSize(specForArgs.outputPath);
        }
        if (size != null && size > sizeLimit) {
          currentConvertAbort = null;
          const mb = (n: number) => (n / (1024 * 1024)).toFixed(2);
          return {
            ok: false,
            message:
              `Dosya ${mb(sizeLimit)} MB sınırının altına indirilemedi. ` +
              `En küçük sonuç ${mb(size)} MB olarak kaydedildi.`
          };
        }
      }

      currentConvertAbort = null;
      if (run.ok) {
        const outName = parsed.data.spec.outputPath.split(/[/\\]/).pop() ?? "dosya";
        host.notifyCompletion("Dönüşüm Tamamlandı", outName);
        return { ok: true };
      }

      if (!ac.signal.aborted) {
        host.notifyCompletion("Dönüşüm Başarısız", "Bir hata oluştu.");
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
      const parsed = ipcReadPreviewRequestSchema.safeParse(payload ?? {});
      if (!parsed.success) return guardFail("Geçersiz önizleme isteği.");
      const guard = checkInputPath(parsed.data.filePath, "Dosya yolu");
      if (!guard.ok) return guardFail(guard.reason);
      const filePath = guard.path;
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
    const parsed = ipcShowInFolderRequestSchema.safeParse(payload ?? {});
    if (!parsed.success) return;
    const guard = checkInputPath(parsed.data.filePath, "Dosya yolu");
    if (!guard.ok) return;
    shell.showItemInFolder(guard.path);
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
      const parsed = ipcSettingsSetRequestSchema.safeParse(payload ?? {});
      if (!parsed.success) {
        return { ok: false, message: "Geçersiz ayar paketi." };
      }
      const p = parsed.data;

      // GÜVENLİK: klasör ve ikili yolları renderer'dan ham string olarak KABUL EDİLMEZ.
      // Yalnızca ana süreçteki dosya diyaloğu bir yol üretebilir (DENETIM.md D-01).
      if (p.pickOutputDir) {
        const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
        if (result.canceled || !result.filePaths[0]) {
          return { ok: false, message: "İptal edildi." };
        }
        saveSettings({ outputDir: result.filePaths[0] });
        return { ok: true };
      }

      if (p.pickFfmpegBinary) {
        const result = await dialog.showOpenDialog({
          title: "FFmpeg ikilisini seçin",
          properties: ["openFile"]
        });
        if (result.canceled || !result.filePaths[0]) {
          return { ok: false, message: "İptal edildi." };
        }
        const chosen = result.filePaths[0];
        try {
          // Seçim anında doğrula: kullanıcı rastgele bir dosya seçmiş olabilir.
          resolveFfmpegExecutable(chosen);
        } catch (e) {
          return { ok: false, message: e instanceof Error ? e.message : String(e) };
        }
        saveSettings({ ffmpegBinary: chosen });
        return { ok: true };
      }

      if (p.clearOutputDir) {
        lpcSettings = { ...lpcSettings, outputDir: undefined };
        saveSettings({});
        return { ok: true };
      }

      if (p.clearFfmpegBinary) {
        lpcSettings = { ...lpcSettings, ffmpegBinary: undefined };
        saveSettings({});
        return { ok: true };
      }

      const patch: Partial<LpcSettings> = {};
      if (p.defaultQuality !== undefined) patch.defaultQuality = p.defaultQuality;
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
      const parsed = ipcProfilesSaveRequestSchema.safeParse(payload ?? {});
      if (!parsed.success) {
        return guardFail(parsed.error.issues[0]?.message ?? "Geçersiz profil.");
      }
      const p = parsed.data;
      const profiles = loadProfiles();
      const id = p.id ?? `profile-${Date.now()}`;
      const existing = profiles.findIndex((pr) => pr.id === id);
      const entry: UserProfile = {
        id,
        name: p.name.trim(),
        targetProfileId: p.targetProfileId,
        qualityPreset: p.qualityPreset,
        resolutionPreset: p.resolutionPreset,
        audioChannels: p.audioChannels,
        extraFfmpegArgs: p.extraFfmpegArgs,
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
      const parsed = ipcProfilesDeleteRequestSchema.safeParse(payload ?? {});
      if (!parsed.success) return guardFail("ID gerekli.");
      const id = parsed.data.id;
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
        const options = {
          hostname: "api.github.com",
          // Eski adres (`recepozen/file-converter-api`) HTTP 404 dönüyordu:
          // özellik üretimde tamamen ölüydü (DENETIM.md D-18).
          path: `/repos/${UPDATE_REPO}/releases/latest`,
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
              // String eşitsizliği değil sürüm karşılaştırması: uzaktaki etiket
              // ESKİ olsa bile eskisi "güncelleme var" diyordu (DENETIM.md D-18).
              const hasUpdate = isNewerVersion(tag, currentVersion);
              resolve({
                ok: true,
                currentVersion,
                latestVersion: tag,
                hasUpdate,
                releaseUrl: json.html_url ?? `https://github.com/${UPDATE_REPO}/releases`
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
      const parsed = ipcPdfConvertRequestSchema.safeParse(payload ?? {});
      if (!parsed.success) return guardFail("Geçersiz PDF isteği.");
      const guard = checkInputPath(parsed.data.inputPath, "PDF dosyası");
      if (!guard.ok) return guardFail(guard.reason);
      const inputPath = guard.path;
      // `format` enum: `-${format}` pdftoppm'e bayrak olarak geçiyor.
      const { format, dpi } = parsed.data;

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
      const parsed = ipcAudioMergeRequestSchema.safeParse(payload ?? {});
      if (!parsed.success) return guardFail("En az 2 ses dosyası ve geçerli bir çıktı yolu gerekli.");
      const inGuard = checkInputPaths(parsed.data.inputPaths, "Ses dosyası");
      if (!inGuard.ok) return guardFail(inGuard.reason);
      const outGuard = checkOutputPath(parsed.data.outputPath);
      if (!outGuard.ok) return guardFail(outGuard.reason);
      const inputPaths = inGuard.paths;
      const outputPath = outGuard.path;
      const mode = parsed.data.mode;
      const encoder = parsed.data.outputEncoder;

      let executable: string;
      try {
        executable = resolveFfmpegExecutable(lpcSettings.ffmpegBinary);
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }

      const inputs: string[] = [];
      for (const p of inputPaths) {
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
      host.updateTrayMenu("Dönüştürülüyor…");
      const run = await runFfmpegJob(executable, args, {
        signal: ac.signal,
        onProgress: (percent) => {
          if (event.sender.isDestroyed()) return;
          event.sender.send(RUN_CONVERT_PROGRESS_CHANNEL, { percent });
          host.setTaskbarProgress(percent);
        }
      });
      currentConvertAbort = null;
      host.setTaskbarProgress(null);
      if (run.ok) {
        host.updateTrayMenu("Hazır");
        host.notifyCompletion("Ses Birleştirme Tamamlandı", "Dosyalar başarıyla birleştirildi.");
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
      const parsed = ipcVideoMergeRequestSchema.safeParse(payload ?? {});
      if (!parsed.success) return guardFail("En az 2 video dosyası ve geçerli bir çıktı yolu gerekli.");
      const inGuard = checkInputPaths(parsed.data.inputPaths, "Video dosyası");
      if (!inGuard.ok) return guardFail(inGuard.reason);
      const outGuard = checkOutputPath(parsed.data.outputPath);
      if (!outGuard.ok) return guardFail(outGuard.reason);
      const inputPaths = inGuard.paths;
      const outputPath = outGuard.path;

      let executable: string;
      try {
        executable = resolveFfmpegExecutable(lpcSettings.ffmpegBinary);
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }

      // Girdiler önce özetlenir: uyumsuz dosyaları concat demuxer'a vermek
      // sessizce bozuk çıktı üretiyordu — ffmpeg exit 0 dönüyor ama ikinci
      // klip yanlış çözünürlükte ve ses akışı düşmüş oluyordu (DENETIM.md D-05).
      let ffprobeExec: string;
      try {
        ffprobeExec = resolveFfprobeExecutable(lpcSettings.ffmpegBinary);
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }

      const summaries = [];
      for (const inputPath of inputPaths) {
        const probe = await runFfprobeJson(ffprobeExec, inputPath);
        if (!probe.ok) {
          return { ok: false, message: `${path.basename(inputPath)} okunamadı: ${probe.message}` };
        }
        summaries.push(summarizeMergeInput(inputPath, probe.json));
      }

      const withoutVideo = summaries.find((sum) => sum.width === null);
      if (withoutVideo) {
        return { ok: false, message: `${path.basename(withoutVideo.path)} video akışı içermiyor.` };
      }

      const plan = planVideoMerge(summaries);
      let listPath: string | null = null;
      let args: string[];
      if (plan.strategy === "copy") {
        listPath = outputPath + ".concat-list.txt";
        await fs.promises.writeFile(listPath, buildConcatListContent(inputPaths), "utf8");
        args = buildConcatCopyArgs(listPath, outputPath);
      } else {
        args = buildVideoMergeFilterArgs(summaries, plan.target, outputPath);
      }
      const ac = new AbortController();
      currentConvertAbort = ac;
      host.updateTrayMenu("Dönüştürülüyor…");
      const run = await runFfmpegJob(executable, args, {
        signal: ac.signal,
        onProgress: (percent) => {
          if (event.sender.isDestroyed()) return;
          event.sender.send(RUN_CONVERT_PROGRESS_CHANNEL, { percent });
          host.setTaskbarProgress(percent);
        }
      });
      currentConvertAbort = null;
      if (listPath) {
        fs.promises.unlink(listPath).catch(() => undefined);
      }
      if (run.ok) {
        host.notifyCompletion("Video Birleştirme Tamamlandı", "Dosyalar başarıyla birleştirildi.");
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
      const parsed = ipcFrameExtractRequestSchema.safeParse(payload ?? {});
      if (!parsed.success) return guardFail("Geçersiz kare çıkarma isteği.");
      const inGuard = checkInputPath(parsed.data.inputPath);
      if (!inGuard.ok) return guardFail(inGuard.reason);
      const outGuard = checkOutputPath(parsed.data.outputDir, "Çıktı klasörü");
      if (!outGuard.ok) return guardFail(outGuard.reason);
      const inputPath = inGuard.path;
      const outputDir = outGuard.path;
      const { intervalSec, format } = parsed.data;

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
      host.updateTrayMenu("Dönüştürülüyor…");
      const run = await runFfmpegJob(executable, args, {
        signal: ac.signal,
        onProgress: (percent) => {
          if (event.sender.isDestroyed()) return;
          event.sender.send(RUN_CONVERT_PROGRESS_CHANNEL, { percent });
          host.setTaskbarProgress(percent);
        }
      });
      currentConvertAbort = null;
      host.setTaskbarProgress(null);
      if (run.ok) {
        host.updateTrayMenu("Hazır");
        host.notifyCompletion("Kare Çıkarma Tamamlandı", `${outputDir.split(/[/\\]/).pop()} klasörüne kaydedildi.`);
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
      const parsed = ipcGifConvertRequestSchema.safeParse(payload ?? {});
      if (!parsed.success) return guardFail("Geçersiz GIF isteği.");
      const inGuard = checkInputPath(parsed.data.inputPath);
      if (!inGuard.ok) return guardFail(inGuard.reason);
      const outGuard = checkOutputPath(parsed.data.outputPath, "Çıktı dosyası");
      if (!outGuard.ok) return guardFail(outGuard.reason);
      const inputPath = inGuard.path;
      const outputPath = outGuard.path;
      const { fps, width, loop } = parsed.data;

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
      host.updateTrayMenu("Dönüştürülüyor…");
      const run = await runFfmpegJob(executable, args, {
        signal: ac.signal,
        onProgress: (percent) => {
          if (event.sender.isDestroyed()) return;
          event.sender.send(RUN_CONVERT_PROGRESS_CHANNEL, { percent });
          host.setTaskbarProgress(percent);
        }
      });
      currentConvertAbort = null;
      host.setTaskbarProgress(null);
      if (run.ok) {
        host.updateTrayMenu("Hazır");
        host.notifyCompletion("GIF Oluşturuldu", "GIF dosyası kaydedildi.");
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
      const parsed = ipcApngConvertRequestSchema.safeParse(payload ?? {});
      if (!parsed.success) return guardFail("Geçersiz APNG isteği.");
      const inGuard = checkInputPath(parsed.data.inputPath);
      if (!inGuard.ok) return guardFail(inGuard.reason);
      const outGuard = checkOutputPath(parsed.data.outputPath, "Çıktı dosyası");
      if (!outGuard.ok) return guardFail(outGuard.reason);
      const inputPath = inGuard.path;
      const outputPath = outGuard.path;
      const { fps, width, plays } = parsed.data;

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
      host.updateTrayMenu("Dönüştürülüyor…");
      const run = await runFfmpegJob(executable, args, {
        signal: ac.signal,
        onProgress: (percent) => {
          if (event.sender.isDestroyed()) return;
          event.sender.send(RUN_CONVERT_PROGRESS_CHANNEL, { percent });
          host.setTaskbarProgress(percent);
        }
      });
      currentConvertAbort = null;
      host.setTaskbarProgress(null);
      if (run.ok) {
        host.updateTrayMenu("Hazır");
        host.notifyCompletion("APNG Oluşturuldu", "APNG dosyası kaydedildi.");
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
      const parsed = ipcSubtitleProbeRequestSchema.safeParse(payload ?? {});
      if (!parsed.success) return guardFail("Giriş dosyası gerekli.");
      const inGuard = checkInputPath(parsed.data.inputPath);
      if (!inGuard.ok) return guardFail(inGuard.reason);
      const inputPath = inGuard.path;
      let ffprobeExec: string;
      try {
        ffprobeExec = resolveFfprobeExecutable(lpcSettings.ffmpegBinary);
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
      const parsed = ipcSubtitleExtractRequestSchema.safeParse(payload ?? {});
      if (!parsed.success) return guardFail("Geçersiz altyazı isteği.");
      const inGuard = checkInputPath(parsed.data.inputPath);
      if (!inGuard.ok) return guardFail(inGuard.reason);
      const outGuard = checkOutputPath(parsed.data.outputPath, "Çıktı dosyası");
      if (!outGuard.ok) return guardFail(outGuard.reason);
      const inputPath = inGuard.path;
      const outputPath = outGuard.path;
      const streamIndex = parsed.data.streamIndex;
      // Çıktı uzantısı formatı belirliyor; arayüz `format` göndermezse ondan türet.
      const extension = outputPath.split(".").pop()?.toLowerCase();
      const format =
        parsed.data.format ??
        (extension === "ass" || extension === "vtt" || extension === "srt" ? extension : "srt");

      let executable: string;
      try {
        executable = resolveFfmpegExecutable(lpcSettings.ffmpegBinary);
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }

      // Kaynak codec'i bilmeden hedef codec seçilemez: `-c:s copy` yalnızca
      // kaynakla hedef zaten aynıysa doğru, bitmap altyazıda ise hiçbir metin
      // formatı mümkün değil (DENETIM.md D-06).
      let sourceCodec: string | null = null;
      try {
        const probe = await runFfprobeJson(resolveFfprobeExecutable(lpcSettings.ffmpegBinary), inputPath);
        if (probe.ok) {
          sourceCodec = probe.json.streams?.[streamIndex]?.codec_name ?? null;
        }
      } catch {
        sourceCodec = null;
      }

      const built = buildSubtitleExtractArgs({
        inputPath,
        outputPath,
        streamIndex,
        format,
        sourceCodec
      });
      if (!built.ok) {
        return { ok: false, message: built.reason };
      }

      const result = await runFfmpegJob(executable, built.args, {});
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
      const parsed = ipcVideoTrimRequestSchema.safeParse(payload ?? {});
      if (!parsed.success) return guardFail("Geçersiz kırpma isteği.");
      const inGuard = checkInputPath(parsed.data.inputPath);
      if (!inGuard.ok) return guardFail(inGuard.reason);
      const outGuard = checkOutputPath(parsed.data.outputPath, "Çıktı dosyası");
      if (!outGuard.ok) return guardFail(outGuard.reason);
      const inputPath = inGuard.path;
      const outputPath = outGuard.path;
      const { startSec, endSec, streamCopy } = parsed.data;

      let executable: string;
      try {
        executable = resolveFfmpegExecutable(lpcSettings.ffmpegBinary);
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }

      const trim = buildTrimArgs({ inputPath, outputPath, startSec, endSec, streamCopy });
      if (!trim.ok) {
        return { ok: false, message: "Bitiş zamanı başlangıçtan büyük olmalı." };
      }
      const args = trim.args;

      const ac = new AbortController();
      currentConvertAbort = ac;
      host.updateTrayMenu("Dönüştürülüyor…");
      const run = await runFfmpegJob(executable, args, {
        signal: ac.signal,
        onProgress: (percent) => {
          if (event.sender.isDestroyed()) return;
          event.sender.send(RUN_CONVERT_PROGRESS_CHANNEL, { percent });
          host.setTaskbarProgress(percent);
        }
      });
      currentConvertAbort = null;
      host.setTaskbarProgress(null);
      if (run.ok) {
        host.updateTrayMenu("Hazır");
        host.notifyCompletion("Video Kırpma Tamamlandı", `${String(outputPath).split(/[/\\]/).pop()} kaydedildi.`);
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
      const parsed = ipcAudioNormalizeRequestSchema.safeParse(payload ?? {});
      if (!parsed.success) return guardFail("Geçersiz ses normalizasyon isteği.");
      const inGuard = checkInputPath(parsed.data.inputPath);
      if (!inGuard.ok) return guardFail(inGuard.reason);
      const outGuard = checkOutputPath(parsed.data.outputPath, "Çıktı dosyası");
      if (!outGuard.ok) return guardFail(outGuard.reason);
      const inputPath = inGuard.path;
      const outputPath = outGuard.path;
      const { targetLufs, truePeak, lra } = parsed.data;

      let executable: string;
      try {
        executable = resolveFfmpegExecutable(lpcSettings.ffmpegBinary);
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }

      // İki geçiş: önce ölç, sonra ölçülen değerlerle doğrusal düzelt. Tek
      // geçiş hedefi tahminle vuruyordu — −14 LUFS isteğinde ölçüm −14.5
      // veriyordu. Ölçüm alınamazsa (ör. tümüyle sessiz girdi) tek geçişe
      // düşülür; işi hiç yapmamaktansa yaklaşık yapmak yeğdir.
      const targets = { targetLufs, truePeak, lra };
      const ac = new AbortController();
      currentConvertAbort = ac;
      host.updateTrayMenu("Ölçülüyor…");
      // Ölçüm JSON'u BAŞARILI koşumun stderr'ine basılır; `runFfmpegJob` başarıda
      // stderr döndürmediği için satırları `onLog` ile topluyoruz.
      let measureLog = "";
      const measureRun = await runFfmpegJob(
        executable,
        buildLoudnormMeasureArgs(inputPath, targets),
        {
          signal: ac.signal,
          onLog: (line) => {
            measureLog += line + "\n";
          }
        }
      );
      const measurement = measureRun.ok ? parseLoudnormJson(measureLog) : null;
      const args =
        measurement != null
          ? buildLoudnormApplyArgs(inputPath, outputPath, targets, measurement)
          : buildLoudnormSinglePassArgs(inputPath, outputPath, targets);

      host.updateTrayMenu("Dönüştürülüyor…");
      const run = await runFfmpegJob(executable, args, {
        signal: ac.signal,
        onProgress: (percent) => {
          if (event.sender.isDestroyed()) return;
          event.sender.send(RUN_CONVERT_PROGRESS_CHANNEL, { percent });
          host.setTaskbarProgress(percent);
        }
      });
      currentConvertAbort = null;
      host.setTaskbarProgress(null);
      if (run.ok) {
        host.updateTrayMenu("Hazır");
        host.notifyCompletion("Ses Normalizasyonu Tamamlandı", `${String(outputPath).split(/[/\\]/).pop()} kaydedildi.`);
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
      const parsed = ipcWatermarkRequestSchema.safeParse(payload ?? {});
      if (!parsed.success) return guardFail("Geçersiz filigran isteği.");
      const inGuard = checkInputPath(parsed.data.inputPath);
      if (!inGuard.ok) return guardFail(inGuard.reason);
      const outGuard = checkOutputPath(parsed.data.outputPath, "Çıktı dosyası");
      if (!outGuard.ok) return guardFail(outGuard.reason);
      const inputPath = inGuard.path;
      const outputPath = outGuard.path;
      const { mode, text, position, opacity, fontSize, fontColor } = parsed.data;
      let imagePath: string | undefined;
      if (mode === "image") {
        const imgGuard = checkInputPath(parsed.data.imagePath, "Filigran görseli");
        if (!imgGuard.ok) return guardFail(imgGuard.reason);
        imagePath = imgGuard.path;
      }

      let executable: string;
      try {
        executable = resolveFfmpegExecutable(lpcSettings.ffmpegBinary);
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }

      // Konum ifadeleri filtreye göre AYRI yazılmak zorunda: `overlay` ile
      // `drawtext` aynı harfleri farklı anlamda kullanıyor.
      //
      //   overlay : W,H = ana video · w,h = bindirilen görsel
      //   drawtext: w,h = ANA VİDEO (W,H ile eş anlamlı) · metin kutusu text_w,text_h
      //
      // Her ikisi de overlay sözdizimiyle yazıldığı için metin filigranında
      // `(W-w)/2` = 0 ve `W-w-10` = −10 oluyordu: "Merkez", "Sağ Alt", "Sağ Üst"
      // ve "Sol Alt" seçenekleri metni sol üst köşeye (bir kısmını da kadrajın
      // dışına) basıyordu. Yalnızca "Sol Üst" doğru çalışıyordu.
      const MARGIN = 10;
      const overlayPosMap: Record<string, string> = {
        topleft:     `${MARGIN}:${MARGIN}`,
        topright:    `W-w-${MARGIN}:${MARGIN}`,
        bottomleft:  `${MARGIN}:H-h-${MARGIN}`,
        bottomright: `W-w-${MARGIN}:H-h-${MARGIN}`,
        center:      "(W-w)/2:(H-h)/2",
      };
      const textPosMap: Record<string, string> = {
        topleft:     `${MARGIN}:${MARGIN}`,
        topright:    `w-text_w-${MARGIN}:${MARGIN}`,
        bottomleft:  `${MARGIN}:h-text_h-${MARGIN}`,
        bottomright: `w-text_w-${MARGIN}:h-text_h-${MARGIN}`,
        center:      "(w-text_w)/2:(h-text_h)/2",
      };
      const posMap = mode === "image" ? overlayPosMap : textPosMap;
      const overlayPos = posMap[position] ?? posMap["bottomright"]!;

      let args: string[];
      let textFilePath: string | null = null;
      if (mode === "image" && imagePath) {
        args = [
          "-i", inputPath,
          "-i", imagePath,
          "-filter_complex",
          `[1:v]format=rgba,colorchannelmixer=aa=${opacity}[wm];[0:v][wm]overlay=${overlayPos}`,
          "-codec:a", "copy",
          "-y", outputPath
        ];
      } else {
        // Metin filtergraph'a GÖMÜLMÜYOR, `textfile=` ile geçiriliyor.
        //
        // Eski kod yalnızca `'` kaçırıyordu; içinde `:` geçen bir filigran
        // sessizce bozuluyordu — "12:34 100% it's" yazan bir filigran karede
        // tek bir "b" harfi olarak çıkıyordu (kare ile doğrulandı). drawtext'in
        // `text=` seçeneği için `:` ve `%` karakterlerinin güvenilir bir kaçırma
        // biçimi yok; `textfile=` + `expansion=none` metni harfi harfine
        // basıyor ve kaçırma sorununu tümüyle ortadan kaldırıyor (DENETIM.md D-07).
        textFilePath = `${outputPath}.watermark-text.txt`;
        await fs.promises.writeFile(textFilePath, text, "utf8");
        const drawtext = [
          `textfile=${escapeFilterPath(textFilePath)}`,
          "expansion=none",
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
      host.updateTrayMenu("Dönüştürülüyor…");
      const run = await runFfmpegJob(executable, args, {
        signal: ac.signal,
        onProgress: (percent) => {
          if (event.sender.isDestroyed()) return;
          event.sender.send(RUN_CONVERT_PROGRESS_CHANNEL, { percent });
          host.setTaskbarProgress(percent);
        }
      });
      currentConvertAbort = null;
      host.setTaskbarProgress(null);
      if (textFilePath) {
        await fs.promises.rm(textFilePath, { force: true }).catch(() => undefined);
      }
      if (run.ok) {
        host.updateTrayMenu("Hazır");
        host.notifyCompletion("Filigran Eklendi", `${String(outputPath).split(/[/\\]/).pop()} kaydedildi.`);
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
      const parsed = ipcMetadataReadRequestSchema.safeParse(payload ?? {});
      if (!parsed.success) return guardFail("Giriş dosyası gerekli.");
      const inGuard = checkInputPath(parsed.data.inputPath);
      if (!inGuard.ok) return guardFail(inGuard.reason);
      const inputPath = inGuard.path;
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
      const parsed = ipcMetadataWriteRequestSchema.safeParse(payload ?? {});
      if (!parsed.success) {
        return guardFail(parsed.error.issues[0]?.message ?? "Geçersiz etiket paketi.");
      }
      const inGuard = checkInputPath(parsed.data.inputPath);
      if (!inGuard.ok) return guardFail(inGuard.reason);
      const outGuard = checkOutputPath(parsed.data.outputPath, "Çıktı dosyası");
      if (!outGuard.ok) return guardFail(outGuard.reason);
      const inputPath = inGuard.path;
      const outputPath = outGuard.path;
      const tags = parsed.data.tags;

      let executable: string;
      try {
        executable = resolveFfmpegExecutable(lpcSettings.ffmpegBinary);
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }

      const args = ["-i", inputPath];
      for (const [k, v] of Object.entries(tags)) {
        args.push("-metadata", `${k}=${v}`);
      }
      args.push("-c", "copy", "-y", outputPath);

      const result = await runFfmpegJob(executable, args, {});
      if (result.ok) {
        host.notifyCompletion("Metadata Güncellendi", `${String(outputPath).split(/[/\\]/).pop()} kaydedildi.`);
        return { ok: true };
      }
      return { ok: false, message: result.stderr };
    }
  );
}
