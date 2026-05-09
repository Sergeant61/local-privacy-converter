import type { IpcFfmpegVersionResponse } from "@lfc/validators";

declare global {
  interface Window {
    lfc: {
      getFfmpegVersion: (executable?: string) => Promise<IpcFfmpegVersionResponse>;
    };
  }
}

export {};
