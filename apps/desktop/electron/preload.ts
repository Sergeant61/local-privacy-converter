import { contextBridge, ipcRenderer } from "electron";

const CHANNEL = "lfc/ffmpeg/get-version";

contextBridge.exposeInMainWorld("lfc", {
  getFfmpegVersion: (executable?: string) =>
    ipcRenderer.invoke(CHANNEL, executable !== undefined ? { executable } : {})
});
