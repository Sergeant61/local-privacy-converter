import { contextBridge, ipcRenderer, webUtils } from "electron";

import type {
  IpcConvertProgressEvent,
  IpcRunConvertJobRequest,
  IpcSaveOutputDialogRequest
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


contextBridge.exposeInMainWorld("lfc", {
  // GÜVENLİK: ikili yolu artık köprüden geçmiyor; ana süreç ayarlardaki
  // (yalnızca dosya diyaloğuyla yazılabilen) yolu kullanır — DENETIM.md D-01.
  getFfmpegVersion: () => ipcRenderer.invoke(VERSION_CHANNEL, {}),
  probeMedia: (args: { inputPath: string }) =>
    ipcRenderer.invoke(PROBE_CHANNEL, { inputPath: args.inputPath }),
  getFfmpegCapabilities: () => ipcRenderer.invoke(CAPABILITIES_CHANNEL, {}),
  showOpenMediaDialog: () => ipcRenderer.invoke(OPEN_MEDIA_CHANNEL, {}),
  showSaveOutputDialog: (req: IpcSaveOutputDialogRequest) =>
    ipcRenderer.invoke(SAVE_OUTPUT_CHANNEL, req),
  runConvertJob: (
    req: IpcRunConvertJobRequest,
    onProgress?: (percent: number | null) => void,
    onLog?: (line: string) => void
  ) => {
    const listener = (_e: unknown, payload: IpcConvertProgressEvent) => {
      onProgress?.(payload.percent);
    };
    const logListener = (_e: unknown, payload: { line: string }) => {
      onLog?.(payload.line);
    };
    if (onProgress) {
      ipcRenderer.on(RUN_CONVERT_PROGRESS_CHANNEL, listener);
    }
    if (onLog) {
      ipcRenderer.on(RUN_CONVERT_LOG_CHANNEL, logListener);
    }
    return ipcRenderer.invoke(RUN_CONVERT_CHANNEL, req).finally(() => {
      ipcRenderer.removeListener(RUN_CONVERT_PROGRESS_CHANNEL, listener);
      ipcRenderer.removeListener(RUN_CONVERT_LOG_CHANNEL, logListener);
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
    ipcRenderer.invoke(CANCEL_CONVERT_CHANNEL),
  audioMerge: (req: {
    inputPaths: string[];
    outputPath: string;
    mode: "mix" | "concat";
    outputEncoder: string;
  }, onProgress?: (percent: number | null) => void) => {
    const listener = (_e: unknown, payload: IpcConvertProgressEvent) => {
      onProgress?.(payload.percent);
    };
    if (onProgress) ipcRenderer.on(RUN_CONVERT_PROGRESS_CHANNEL, listener);
    return ipcRenderer.invoke(AUDIO_MERGE_CHANNEL, req).finally(() => {
      ipcRenderer.removeListener(RUN_CONVERT_PROGRESS_CHANNEL, listener);
    });
  },
  videoMerge: (req: {
    inputPaths: string[];
    outputPath: string;
  }, onProgress?: (percent: number | null) => void) => {
    const listener = (_e: unknown, payload: IpcConvertProgressEvent) => {
      onProgress?.(payload.percent);
    };
    if (onProgress) ipcRenderer.on(RUN_CONVERT_PROGRESS_CHANNEL, listener);
    return ipcRenderer.invoke(VIDEO_MERGE_CHANNEL, req).finally(() => {
      ipcRenderer.removeListener(RUN_CONVERT_PROGRESS_CHANNEL, listener);
    });
  },
  frameExtract: (req: {
    inputPath: string;
    outputDir: string;
    intervalSec: number;
    format: "png" | "jpg";
  }, onProgress?: (percent: number | null) => void) => {
    const listener = (_e: unknown, payload: IpcConvertProgressEvent) => {
      onProgress?.(payload.percent);
    };
    if (onProgress) ipcRenderer.on(RUN_CONVERT_PROGRESS_CHANNEL, listener);
    return ipcRenderer.invoke(FRAME_EXTRACT_CHANNEL, req).finally(() => {
      ipcRenderer.removeListener(RUN_CONVERT_PROGRESS_CHANNEL, listener);
    });
  },
  gifConvert: (req: {
    inputPath: string;
    outputPath: string;
    fps: number;
    width: number;
    loop: number;
  }, onProgress?: (percent: number | null) => void) => {
    const listener = (_e: unknown, payload: IpcConvertProgressEvent) => {
      onProgress?.(payload.percent);
    };
    if (onProgress) ipcRenderer.on(RUN_CONVERT_PROGRESS_CHANNEL, listener);
    return ipcRenderer.invoke(GIF_CONVERT_CHANNEL, req).finally(() => {
      ipcRenderer.removeListener(RUN_CONVERT_PROGRESS_CHANNEL, listener);
    });
  },
  apngConvert: (req: {
    inputPath: string;
    outputPath: string;
    fps: number;
    width: number;
    plays: number;
  }, onProgress?: (percent: number | null) => void) => {
    const listener = (_e: unknown, payload: IpcConvertProgressEvent) => {
      onProgress?.(payload.percent);
    };
    if (onProgress) ipcRenderer.on(RUN_CONVERT_PROGRESS_CHANNEL, listener);
    return ipcRenderer.invoke(APNG_CONVERT_CHANNEL, req).finally(() => {
      ipcRenderer.removeListener(RUN_CONVERT_PROGRESS_CHANNEL, listener);
    });
  },
  getSettings: () => ipcRenderer.invoke(SETTINGS_GET_CHANNEL),
  setSettings: (patch: {
    defaultQuality?: string;
    /** Klasör/ikili yolu yalnızca ana süreçteki diyalogla seçilir. */
    pickOutputDir?: boolean;
    clearOutputDir?: boolean;
    pickFfmpegBinary?: boolean;
    clearFfmpegBinary?: boolean;
  }) => ipcRenderer.invoke(SETTINGS_SET_CHANNEL, patch),
  subtitleProbe: (inputPath: string) =>
    ipcRenderer.invoke(SUBTITLE_PROBE_CHANNEL, { inputPath }),
  subtitleExtract: (req: { inputPath: string; streamIndex: number; outputPath: string; format?: "srt" | "ass" | "vtt" }) =>
    ipcRenderer.invoke(SUBTITLE_EXTRACT_CHANNEL, req),
  videoTrim: (req: {
    inputPath: string;
    outputPath: string;
    startSec: number;
    endSec: number | null;
    streamCopy: boolean;
  }, onProgress?: (percent: number | null) => void) => {
    const listener = (_e: unknown, payload: IpcConvertProgressEvent) => {
      onProgress?.(payload.percent);
    };
    if (onProgress) ipcRenderer.on(RUN_CONVERT_PROGRESS_CHANNEL, listener);
    return ipcRenderer.invoke(VIDEO_TRIM_CHANNEL, req).finally(() => {
      ipcRenderer.removeListener(RUN_CONVERT_PROGRESS_CHANNEL, listener);
    });
  },
  audioNormalize: (req: {
    inputPath: string;
    outputPath: string;
    targetLufs: number;
    truePeak: number;
    lra: number;
  }, onProgress?: (percent: number | null) => void) => {
    const listener = (_e: unknown, payload: IpcConvertProgressEvent) => {
      onProgress?.(payload.percent);
    };
    if (onProgress) ipcRenderer.on(RUN_CONVERT_PROGRESS_CHANNEL, listener);
    return ipcRenderer.invoke(AUDIO_NORMALIZE_CHANNEL, req).finally(() => {
      ipcRenderer.removeListener(RUN_CONVERT_PROGRESS_CHANNEL, listener);
    });
  },
  watermark: (req: {
    inputPath: string;
    outputPath: string;
    mode: "text" | "image";
    text?: string;
    imagePath?: string;
    position: string;
    opacity: number;
    fontSize?: number;
    fontColor?: string;
  }, onProgress?: (percent: number | null) => void) => {
    const listener = (_e: unknown, payload: IpcConvertProgressEvent) => {
      onProgress?.(payload.percent);
    };
    if (onProgress) ipcRenderer.on(RUN_CONVERT_PROGRESS_CHANNEL, listener);
    return ipcRenderer.invoke(WATERMARK_CHANNEL, req).finally(() => {
      ipcRenderer.removeListener(RUN_CONVERT_PROGRESS_CHANNEL, listener);
    });
  },
  metadataRead: (inputPath: string) =>
    ipcRenderer.invoke(METADATA_READ_CHANNEL, { inputPath }),
  metadataWrite: (req: { inputPath: string; outputPath: string; tags: Record<string, string> }) =>
    ipcRenderer.invoke(METADATA_WRITE_CHANNEL, req),
  pdfConvert: (req: { inputPath: string; format: "png" | "jpg" | "ppm"; dpi: number }) =>
    ipcRenderer.invoke(PDF_CONVERT_CHANNEL, req),
  checkUpdate: () => ipcRenderer.invoke(CHECK_UPDATE_CHANNEL),
  getProfiles: () => ipcRenderer.invoke(PROFILES_GET_CHANNEL),
  saveProfile: (profile: {
    id?: string;
    name: string;
    targetProfileId: string;
    qualityPreset?: string;
    resolutionPreset?: string;
    audioChannels?: number;
    extraFfmpegArgs?: string;
  }) => ipcRenderer.invoke(PROFILES_SAVE_CHANNEL, profile),
  deleteProfile: (id: string) => ipcRenderer.invoke(PROFILES_DELETE_CHANNEL, { id })
});
