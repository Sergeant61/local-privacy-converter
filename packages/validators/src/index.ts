import { z } from "zod";

/** Tek dosya seçimi için temel doğrulama (renderer → IPC). */
export const filePathSchema = z.string().trim().min(1);

/** Ana süreçte kullanıcıdan gelen FFmpeg yolu (bilinçli olarak gevşek; shell ile çalıştırılmaz). */
export const ffmpegExecutableSchema = z.string().trim().min(1);

/** executable yoksa ana süreç gömülü ikiliyi seçer (PATH varsayılanı yok). */
export const ipcGetFfmpegVersionRequestSchema = z.object({
  executable: ffmpegExecutableSchema.optional()
});

export const ipcMediaProbeRequestSchema = z.object({
  inputPath: filePathSchema,
  ffprobeExecutable: ffmpegExecutableSchema.optional()
});

export const mediaProbeSummarySchema = z.object({
  formatName: z.string(),
  durationSec: z.number().nullable(),
  hasVideo: z.boolean(),
  hasAudio: z.boolean(),
  videoCodec: z.string().nullable(),
  audioCodec: z.string().nullable(),
  inferredKind: z.enum(["video", "audio", "image-only"])
});

export const ipcFfmpegCapabilitiesRequestSchema = z.object({
  ffmpegExecutable: ffmpegExecutableSchema.optional()
});

export const ffmpegCapabilitiesSchema = z.object({
  encoders: z.array(z.string()),
  decoders: z.array(z.string()),
  hwaccels: z.array(z.string())
});

export const ipcOpenMediaDialogRequestSchema = z.object({}).strict();

export const ipcMediaProbeResponseSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    summary: mediaProbeSummarySchema
  }),
  z.object({
    ok: z.literal(false),
    message: z.string()
  })
]);

export const ipcFfmpegCapabilitiesResponseSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    value: ffmpegCapabilitiesSchema
  }),
  z.object({
    ok: z.literal(false),
    message: z.string()
  })
]);

export const ipcOpenMediaDialogResponseSchema = z.discriminatedUnion("canceled", [
  z.object({ canceled: z.literal(true) }),
  z.object({
    canceled: z.literal(false),
    filePath: filePathSchema
  })
]);

const conversionModeSchema = z.enum(["copy", "transcode"]);

const videoEncoderChoiceSchema = z.enum([
  "libx264",
  "libx265",
  "libsvtav1",
  "h264_nvenc",
  "hevc_nvenc",
  "av1_nvenc",
  "h264_qsv",
  "hevc_qsv",
  "av1_qsv",
  "h264_amf",
  "hevc_amf",
  "av1_amf",
  "h264_videotoolbox",
  "hevc_videotoolbox",
  "h264_vaapi",
  "hevc_vaapi",
  "libvpx-vp9",
  "png",
  "mjpeg",
  "libwebp"
]);

const audioEncoderChoiceSchema = z.enum(["aac", "libmp3lame", "libopus", "pcm_s16le", "flac", "copy"]);

const videoTranscodeHintsSchema = z.object({
  width: z.number().optional(),
  height: z.number().optional(),
  fps: z.number().optional(),
  stripVideo: z.boolean().optional(),
  qualityPreset: z.enum(["high", "compatible", "balanced", "small", "very_small"]).optional(),
  targetSizeMb: z.number().positive().optional(),
  aspectRatio: z.string().optional()
});

/** IPC / depolama kökenli `null` veya string sayıları tolere eder. */
const positiveFiniteSecondsSchema = z.preprocess((v) => {
  if (v === undefined || v === null) {
    return undefined;
  }
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) {
    return undefined;
  }
  return n;
}, z.number().positive().finite().optional());

export const convertJobSpecSchema = z.object({
  inputPath: filePathSchema,
  outputPath: filePathSchema,
  mode: conversionModeSchema,
  container: z.string().optional(),
  /** Boş string / null IPC artefaktı olabilir. */
  videoEncoder: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    videoEncoderChoiceSchema.optional()
  ),
  audioEncoder: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    audioEncoderChoiceSchema.optional()
  ),
  videoHints: z.preprocess(
    (v) => (v === null ? undefined : v),
    videoTranscodeHintsSchema.optional()
  ),
  copyAllStreams: z.boolean().optional(),
  audioOnlyOutput: z.boolean().optional(),
  extraFfmpegArgs: z.array(z.string()).optional(),
  audioChannels: z.union([z.literal(1), z.literal(2)]).optional()
});

export const ipcRunConvertJobRequestSchema = z.object({
  spec: convertJobSpecSchema,
  ffmpegExecutable: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    ffmpegExecutableSchema.optional()
  ),
  /** ffprobe; ilerleme — string sayı veya null güvenli. */
  inputDurationSec: positiveFiniteSecondsSchema
});

export const ipcConvertProgressEventSchema = z.object({
  percent: z.number().min(0).max(100).nullable()
});

export const ipcRunConvertJobResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true) }),
  z.object({
    ok: z.literal(false),
    message: z.string(),
    code: z.number().nullable().optional()
  })
]);

export const dialogFileFilterSchema = z.object({
  name: z.string(),
  extensions: z.array(z.string())
});

export const ipcSaveOutputDialogRequestSchema = z
  .object({
    defaultPath: filePathSchema,
    filters: z.array(dialogFileFilterSchema).optional(),
    title: z.string().optional()
  })
  .strict();

export const ipcSaveOutputDialogResponseSchema = z.discriminatedUnion("canceled", [
  z.object({ canceled: z.literal(true) }),
  z.object({
    canceled: z.literal(false),
    filePath: filePathSchema
  })
]);

export const ipcFfmpegVersionSuccessSchema = z.object({
  ok: z.literal(true),
  versionLine: z.string()
});

export const ipcFfmpegVersionErrorSchema = z.object({
  ok: z.literal(false),
  message: z.string()
});

export const ipcFfmpegVersionResponseSchema = z.discriminatedUnion("ok", [
  ipcFfmpegVersionSuccessSchema,
  ipcFfmpegVersionErrorSchema
]);

export type IpcGetFfmpegVersionRequest = z.infer<typeof ipcGetFfmpegVersionRequestSchema>;
export type IpcFfmpegVersionResponse = z.infer<typeof ipcFfmpegVersionResponseSchema>;
export type IpcMediaProbeRequest = z.infer<typeof ipcMediaProbeRequestSchema>;
export type MediaProbeSummaryPayload = z.infer<typeof mediaProbeSummarySchema>;
export type IpcFfmpegCapabilitiesRequest = z.infer<typeof ipcFfmpegCapabilitiesRequestSchema>;
export type FfmpegCapabilitiesPayload = z.infer<typeof ffmpegCapabilitiesSchema>;
export type IpcMediaProbeResponse = z.infer<typeof ipcMediaProbeResponseSchema>;
export type IpcFfmpegCapabilitiesResponse = z.infer<typeof ipcFfmpegCapabilitiesResponseSchema>;
export type IpcOpenMediaDialogResponse = z.infer<typeof ipcOpenMediaDialogResponseSchema>;
export type ConvertJobSpecPayload = z.infer<typeof convertJobSpecSchema>;
export type IpcRunConvertJobRequest = z.infer<typeof ipcRunConvertJobRequestSchema>;
export type IpcConvertProgressEvent = z.infer<typeof ipcConvertProgressEventSchema>;
export type IpcRunConvertJobResponse = z.infer<typeof ipcRunConvertJobResponseSchema>;
export type IpcSaveOutputDialogRequest = z.infer<typeof ipcSaveOutputDialogRequestSchema>;
export type IpcSaveOutputDialogResponse = z.infer<typeof ipcSaveOutputDialogResponseSchema>;
