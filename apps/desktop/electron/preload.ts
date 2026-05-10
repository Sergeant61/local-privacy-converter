import { contextBridge, ipcRenderer, webUtils } from "electron";

import type {
  IpcConvertProgressEvent,
  IpcRunConvertJobRequest,
  IpcSaveOutputDialogRequest
} from "@lfc/validators";

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

contextBridge.exposeInMainWorld("lfc", {
  getFfmpegVersion: (executable?: string) =>
    ipcRenderer.invoke(VERSION_CHANNEL, executable !== undefined ? { executable } : {}),
  probeMedia: (args: { inputPath: string; ffprobeExecutable?: string }) =>
    ipcRenderer.invoke(PROBE_CHANNEL, args),
  getFfmpegCapabilities: (args?: { ffmpegExecutable?: string }) =>
    ipcRenderer.invoke(CAPABILITIES_CHANNEL, args ?? {}),
  showOpenMediaDialog: () => ipcRenderer.invoke(OPEN_MEDIA_CHANNEL, {}),
  showSaveOutputDialog: (req: IpcSaveOutputDialogRequest) =>
    ipcRenderer.invoke(SAVE_OUTPUT_CHANNEL, req),
  runConvertJob: (
    req: IpcRunConvertJobRequest,
    onProgress?: (percent: number | null) => void
  ) => {
    const listener = (_e: unknown, payload: IpcConvertProgressEvent) => {
      onProgress?.(payload.percent);
    };
    if (onProgress) {
      ipcRenderer.on(RUN_CONVERT_PROGRESS_CHANNEL, listener);
    }
    return ipcRenderer.invoke(RUN_CONVERT_CHANNEL, req).finally(() => {
      ipcRenderer.removeListener(RUN_CONVERT_PROGRESS_CHANNEL, listener);
    });
  },
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  readFilePreview: (filePath: string) =>
    ipcRenderer.invoke(READ_PREVIEW_CHANNEL, { filePath }),
  getOutputDir: () =>
    ipcRenderer.invoke(GET_OUTPUT_DIR_CHANNEL),
  showInFolder: (filePath: string) =>
    ipcRenderer.invoke(SHOW_IN_FOLDER_CHANNEL, { filePath }),
  cancelConvert: () =>
    ipcRenderer.invoke(CANCEL_CONVERT_CHANNEL)
});
