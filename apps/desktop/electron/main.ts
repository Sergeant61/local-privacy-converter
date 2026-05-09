import path from "node:path";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, ipcMain } from "electron";

import { probeFfmpegVersion } from "@lfc/ffmpeg-core";
import { ipcGetFfmpegVersionRequestSchema } from "@lfc/validators";

import { resolveFfmpegExecutable } from "./ffmpeg-resolve";

const CHANNEL = "lfc/ffmpeg/get-version";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function pickVersionLine(stdout: string): string {
  const line = stdout
    .split("\n")
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate.toLowerCase().startsWith("ffmpeg version"));
  return line ?? stdout.split("\n").find(Boolean) ?? stdout.trim();
}

function wireIpcHandlers() {
  ipcMain.removeHandler(CHANNEL);
  ipcMain.handle(
    CHANNEL,
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
}

async function createWindow(): Promise<void> {
  const devUrl = process.env.VITE_DEV_SERVER_URL?.trim() ?? "";

  const window = new BrowserWindow({
    width: 980,
    height: 660,
    minWidth: 920,
    minHeight: 600,
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
    await window.loadFile(path.join(__dirname, "..", "build", "index.html"));
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
