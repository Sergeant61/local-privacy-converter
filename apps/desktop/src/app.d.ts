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
      getFfmpegVersion: () => Promise<IpcFfmpegVersionResponse>;
      probeMedia: (args: { inputPath: string }) => Promise<IpcMediaProbeResponse>;
      getFfmpegCapabilities: () => Promise<IpcFfmpegCapabilitiesResponse>;
      showOpenMediaDialog: () => Promise<IpcOpenMediaDialogResponse>;
      showSaveOutputDialog: (req: IpcSaveOutputDialogRequest) => Promise<IpcSaveOutputDialogResponse>;
      runConvertJob: (
        req: IpcRunConvertJobRequest,
        onProgress?: (percent: number | null) => void,
        onLog?: (line: string) => void
      ) => Promise<IpcRunConvertJobResponse>;
      getPathForFile: (file: File) => string;
      readFilePreview: (filePath: string) => Promise<{ ok: true; dataUrl: string } | { ok: false; message: string }>;
      getOutputDir: () => Promise<{ ok: true; dir: string } | { ok: false; message: string }>;
      showInFolder: (filePath: string) => Promise<void>;
      cancelConvert: () => Promise<void>;
      audioMerge: (
        req: {
          inputPaths: string[];
          outputPath: string;
          mode: "mix" | "concat";
          outputEncoder: string;
        },
        onProgress?: (percent: number | null) => void
      ) => Promise<{ ok: true } | { ok: false; message: string }>;
      videoMerge: (
        req: { inputPaths: string[]; outputPath: string },
        onProgress?: (percent: number | null) => void
      ) => Promise<{ ok: true } | { ok: false; message: string }>;
      frameExtract: (
        req: { inputPath: string; outputDir: string; intervalSec: number; format: "png" | "jpg" },
        onProgress?: (percent: number | null) => void
      ) => Promise<{ ok: true; outputDir: string } | { ok: false; message: string }>;
      gifConvert: (
        req: { inputPath: string; outputPath: string; fps: number; width: number; loop: number },
        onProgress?: (percent: number | null) => void
      ) => Promise<{ ok: true } | { ok: false; message: string }>;
      apngConvert: (
        req: { inputPath: string; outputPath: string; fps: number; width: number; plays: number },
        onProgress?: (percent: number | null) => void
      ) => Promise<{ ok: true } | { ok: false; message: string }>;
      getSettings: () => Promise<{
        outputDir?: string;
        ffmpegBinary?: string;
        defaultQuality?: string;
      }>;
      setSettings: (patch: {
        defaultQuality?: string;
        pickOutputDir?: boolean;
        clearOutputDir?: boolean;
        pickFfmpegBinary?: boolean;
        clearFfmpegBinary?: boolean;
      }) => Promise<{ ok: true } | { ok: false; message: string }>;
      subtitleProbe: (inputPath: string) => Promise<
        | { ok: true; streams: { index: number; codecName: string; title: string; language: string }[] }
        | { ok: false; message: string }
      >;
      subtitleExtract: (req: {
        inputPath: string;
        streamIndex: number;
        outputPath: string;
      }) => Promise<{ ok: true } | { ok: false; message: string }>;
      videoTrim: (
        req: {
          inputPath: string;
          outputPath: string;
          startSec: number;
          endSec: number | null;
          streamCopy: boolean;
        },
        onProgress?: (percent: number | null) => void
      ) => Promise<{ ok: true } | { ok: false; message: string }>;
      audioNormalize: (
        req: {
          inputPath: string;
          outputPath: string;
          targetLufs: number;
          truePeak: number;
          lra: number;
        },
        onProgress?: (percent: number | null) => void
      ) => Promise<{ ok: true } | { ok: false; message: string }>;
      watermark: (
        req: {
          inputPath: string;
          outputPath: string;
          mode: "text" | "image";
          text?: string;
          imagePath?: string;
          position: string;
          opacity: number;
          fontSize?: number;
          fontColor?: string;
        },
        onProgress?: (percent: number | null) => void
      ) => Promise<{ ok: true } | { ok: false; message: string }>;
      metadataRead: (inputPath: string) => Promise<
        { ok: true; tags: Record<string, string> } | { ok: false; message: string }
      >;
      metadataWrite: (req: {
        inputPath: string;
        outputPath: string;
        tags: Record<string, string>;
      }) => Promise<{ ok: true } | { ok: false; message: string }>;
      pdfConvert: (req: { inputPath: string; format: "png" | "jpg" | "ppm"; dpi: number }) => Promise<
        { ok: true; outputDir: string } | { ok: false; message: string }
      >;
      checkUpdate: () => Promise<
        | { ok: true; currentVersion: string; latestVersion: string; hasUpdate: boolean; releaseUrl: string }
        | { ok: false; message: string }
      >;
      getProfiles: () => Promise<Array<{
        id: string;
        name: string;
        targetProfileId: string;
        qualityPreset?: string;
        resolutionPreset?: string;
        audioChannels?: number;
        extraFfmpegArgs?: string;
        createdAt: number;
      }>>;
      saveProfile: (profile: {
        id?: string;
        name: string;
        targetProfileId: string;
        qualityPreset?: string;
        resolutionPreset?: string;
        audioChannels?: number;
        extraFfmpegArgs?: string;
      }) => Promise<{ ok: true } | { ok: false; message: string }>;
      deleteProfile: (id: string) => Promise<{ ok: true } | { ok: false; message: string }>;
    };
  }
}

export {};
