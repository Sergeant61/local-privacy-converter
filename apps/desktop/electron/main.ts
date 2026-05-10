import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";

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

// Must be set before app.whenReady() so menu bar and dock show the correct name
app.setName("Local Privacy Converter");

let currentConvertAbort: AbortController | null = null;

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

      const args = buildFfmpegArgs(parsed.data.spec);
      const ac = new AbortController();
      currentConvertAbort = ac;
      const run = await runFfmpegJob(executable, args, {
        inputDurationSec: parsed.data.inputDurationSec ?? null,
        signal: ac.signal,
        onProgress: (percent) => {
          if (event.sender.isDestroyed()) return;
          event.sender.send(RUN_CONVERT_PROGRESS_CHANNEL, { percent });
        }
      });
      currentConvertAbort = null;
      if (run.ok) {
        return { ok: true };
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
        const dir = path.join(app.getPath("documents"), "LPC");
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

  window.once("ready-to-show", () => window.show());

  if (devUrl.length > 0) {
    await window.loadURL(devUrl);
    window.webContents.openDevTools({ mode: "detach" });
  } else {
    await window.loadFile(path.join(__dirname, "..", "build", "index.html"), {
      hash: "/"
    });
  }
}

async function bootstrap(): Promise<void> {
  await app.whenReady();
  wireIpcHandlers();
  await createWindow();

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
