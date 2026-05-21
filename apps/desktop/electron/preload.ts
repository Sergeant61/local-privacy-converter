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
    outputDir?: string;
    ffmpegBinary?: string;
    defaultQuality?: string;
    pickOutputDir?: boolean;
  }) => ipcRenderer.invoke(SETTINGS_SET_CHANNEL, patch),
  subtitleProbe: (inputPath: string) =>
    ipcRenderer.invoke(SUBTITLE_PROBE_CHANNEL, { inputPath }),
  subtitleExtract: (req: { inputPath: string; streamIndex: number; outputPath: string }) =>
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
