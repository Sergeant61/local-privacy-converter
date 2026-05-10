import type {
  IpcFfmpegCapabilitiesResponse,
  IpcFfmpegVersionResponse,
  IpcMediaProbeResponse,
  IpcOpenMediaDialogResponse,
  IpcRunConvertJobRequest,
  IpcRunConvertJobResponse,
  IpcSaveOutputDialogRequest,
  IpcSaveOutputDialogResponse
} from "@lfc/validators";

declare global {
  interface Window {
    lfc: {
      getFfmpegVersion: (executable?: string) => Promise<IpcFfmpegVersionResponse>;
      probeMedia: (args: { inputPath: string; ffprobeExecutable?: string }) => Promise<IpcMediaProbeResponse>;
      getFfmpegCapabilities: (
        args?: { ffmpegExecutable?: string }
      ) => Promise<IpcFfmpegCapabilitiesResponse>;
      showOpenMediaDialog: () => Promise<IpcOpenMediaDialogResponse>;
      showSaveOutputDialog: (req: IpcSaveOutputDialogRequest) => Promise<IpcSaveOutputDialogResponse>;
      runConvertJob: (
        req: IpcRunConvertJobRequest,
        onProgress?: (percent: number | null) => void
      ) => Promise<IpcRunConvertJobResponse>;
      getPathForFile: (file: File) => string;
      readFilePreview: (filePath: string) => Promise<{ ok: true; dataUrl: string } | { ok: false; message: string }>;
      getOutputDir: () => Promise<{ ok: true; dir: string } | { ok: false; message: string }>;
      showInFolder: (filePath: string) => Promise<void>;
      cancelConvert: () => Promise<void>;
    };
  }
}

export {};
