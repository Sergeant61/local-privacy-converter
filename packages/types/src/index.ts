/** Örnek FFmpeg donanım hızlandırma adları (-hwaccel). Encoder adlarıyla karıştırılmamalı. */
export type FfmpegHwAccelName =
  | "cuda"
  | "nvdec"
  | "qsv"
  | "vaapi"
  | "amf"
  | "videotoolbox";

/** FFmpeg video encoder seçenekleri (CPU + yaygın donanım). */
export type VideoEncoderChoice =
  | "libx264"
  | "libx265"
  | "libsvtav1"
  | "h264_nvenc"
  | "hevc_nvenc"
  | "av1_nvenc"
  | "h264_qsv"
  | "hevc_qsv"
  | "av1_qsv"
  | "h264_amf"
  | "hevc_amf"
  | "av1_amf"
  | "h264_videotoolbox"
  | "hevc_videotoolbox"
  | "h264_vaapi"
  | "hevc_vaapi";

export type AudioEncoderChoice = "aac" | "libmp3lame" | "libopus" | "copy";

export type MediaKind = "video" | "audio" | "image-only";

/** Yüksek seviye dönüşüm modu — UI ve komut seçiminde kullanılır. */
export type ConversionMode = "copy" | "transcode";

export interface PathsInput {
  inputPath: string;
  outputPath: string;
}

export interface VideoTranscodeHints {
  width?: number;
  height?: number;
  fps?: number;
  /** Videoyu çıkarmadan sadece ses kopyala / transcode. */
  stripVideo?: boolean;
}

export interface ConvertJobSpec extends PathsInput {
  mode: ConversionMode;
  container?: string;
  videoEncoder?: VideoEncoderChoice;
  audioEncoder?: AudioEncoderChoice;
  videoHints?: VideoTranscodeHints;
  /** Remux sırasında tüm akışların kopyalanması (mode copy). */
  copyAllStreams?: boolean;
}

/** IPC / UI iş kuyruğu için iskelet. */
export interface MediaJob {
  id: string;
  kind: MediaKind;
  label: string;
  spec: ConvertJobSpec;
  createdAt: string;
}

export interface FfmpegProbeSuccess {
  ok: true;
  stdout: string;
}

export interface FfmpegProbeFailure {
  ok: false;
  code: number | null;
  stderr: string;
}

export type FfmpegProbeResult = FfmpegProbeSuccess | FfmpegProbeFailure;
