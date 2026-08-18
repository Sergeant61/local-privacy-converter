export {
  checkPath,
  checkInputPath,
  checkInputPaths,
  checkOutputPath
} from "./path-guard";
export type { PathGuardResult } from "./path-guard";

import { z } from "zod";

/** Tek dosya seçimi için temel doğrulama (renderer → IPC). */
export const filePathSchema = z.string().trim().min(1);

/**
 * GÜVENLİK: renderer artık çalıştırılacak ikilinin yolunu BELİRLEYEMEZ.
 *
 * Bu alanlar eskiden renderer'dan ham string olarak geliyor, hiçbir kontrolden
 * geçmeden `spawn` ediliyordu ve `settings/set` üzerinden diske kalıcı yazılabiliyordu —
 * tek bir doğrulanmamış IPC çağrısı kalıcı arka kapıya dönüşüyordu (DENETIM.md D-01).
 * Özel ikili yolu artık yalnızca ana süreçteki dosya diyaloğundan gelir ve kullanım
 * anında varlık/dosya/çalıştırılabilirlik kontrolünden geçer.
 */
export const ipcGetFfmpegVersionRequestSchema = z.object({});

export const ipcMediaProbeRequestSchema = z.object({
  inputPath: filePathSchema
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

export const ipcFfmpegCapabilitiesRequestSchema = z.object({});

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

/**
 * Ölçü alanları pozitif ve sınırlı olmak zorunda (DENETIM.md D-13).
 * Önceden yalnızca `z.number()` vardı: `width: 0` şemadan geçiyor, sonra
 * `if (width ?? height)` içinde falsy olduğu için scale filtresi hiç
 * eklenmiyordu — kullanıcı 360p isteyip orijinal çözünürlükte çıktı alıyordu.
 * `fps: 1000` de geçerli sayılıyordu.
 */
const videoTranscodeHintsSchema = z.object({
  width: z.number().int().positive().max(16384).optional(),
  height: z.number().int().positive().max(16384).optional(),
  fps: z.number().positive().max(480).optional(),
  stripVideo: z.boolean().optional(),
  qualityPreset: z.enum(["high", "compatible", "balanced", "small", "very_small"]).optional(),
  targetSizeMb: z.number().positive().max(1_000_000).optional(),
  sourceDurationSec: z.number().positive().finite().optional(),
  aspectRatio: z.string().max(32).optional(),
  fit: z.enum(["cover", "contain", "stretch"]).optional(),
  sourceWidth: z.number().int().positive().max(16384).optional(),
  sourceHeight: z.number().int().positive().max(16384).optional()
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

/**
 * Ayar yazma paketi.
 *
 * GÜVENLİK: `outputDir` ve `ffmpegBinary` bilerek YOKTUR — yol üretebilen tek
 * yer ana süreçteki dosya diyaloğudur. Renderer yalnızca "diyaloğu aç" veya
 * "temizle" niyeti gönderebilir (DENETIM.md D-01). `.strict()`, eski
 * sürümlerden kalan ham yol alanlarını sessizce yutmak yerine reddeder.
 */
export const ipcSettingsSetRequestSchema = z
  .object({
    defaultQuality: z.enum(["high", "compatible", "balanced", "small", "very_small"]).optional(),
    pickOutputDir: z.boolean().optional(),
    clearOutputDir: z.boolean().optional(),
    pickFfmpegBinary: z.boolean().optional(),
    clearFfmpegBinary: z.boolean().optional()
  })
  .strict();

export const lpcSettingsSchema = z.object({
  outputDir: z.string().optional(),
  ffmpegBinary: z.string().optional(),
  defaultQuality: z.enum(["high", "compatible", "balanced", "small", "very_small"]).optional()
});

// ─── Doğrulanmamış kanallar (DENETIM.md D-07) ────────────────────────────────
//
// 29 IPC kanalının 23'ü daha önce `payload as { ... }` ile ham okunuyordu:
// `typeof x === "string"` dışında hiçbir kontrol yoktu, sayısal alanlar
// NaN/Infinity kabul ediyordu ve `format` / `position` / `fontColor` gibi
// serbest string'ler doğrudan ffmpeg argümanına ya da filtergraph'a
// yapıştırılıyordu. Kabuk enjeksiyonu yok (`spawn` her yerde `shell: false`),
// ama argüman ve filtre enjeksiyonu vardı — `-${format}` tek başına
// pdftoppm'e rastgele bayrak geçirmeye yetiyordu.
//
// Kural: dışarıdan gelen her serbest string ya `z.enum` ya da sınırlı bir
// desen; her sayı sonlu ve aralıklı; her nesne `.strict()` — bilinmeyen alan
// sessizce yutulmak yerine reddedilir.

/** Sonlu, aralıklı sayı. IPC'den gelen string sayıları da tolere eder. */
const boundedNumber = (min: number, max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v),
    z.number().finite().min(min).max(max)
  );

export const ipcReadPreviewRequestSchema = z.object({ filePath: filePathSchema }).strict();
export const ipcShowInFolderRequestSchema = z.object({ filePath: filePathSchema }).strict();

/** En az iki girdi: birleştirme tek dosyayla anlamsız. */
const mergeInputsSchema = z.array(filePathSchema).min(2).max(200);

export const ipcAudioMergeRequestSchema = z
  .object({
    inputPaths: mergeInputsSchema,
    outputPath: filePathSchema,
    mode: z.enum(["mix", "concat"]).default("concat"),
    outputEncoder: z.enum(["libmp3lame", "aac", "libopus", "flac", "pcm_s16le"]).default("libmp3lame")
  })
  .strict();

export const ipcVideoMergeRequestSchema = z
  .object({
    inputPaths: mergeInputsSchema,
    outputPath: filePathSchema
  })
  .strict();

export const ipcFrameExtractRequestSchema = z
  .object({
    inputPath: filePathSchema,
    outputDir: filePathSchema,
    /** 0.01 sn altı aralık dosya sistemini boğar; 1 saat üstü anlamsız. */
    intervalSec: boundedNumber(0.01, 3600).default(1),
    format: z.enum(["png", "jpg"]).default("png")
  })
  .strict();

export const ipcGifConvertRequestSchema = z
  .object({
    inputPath: filePathSchema,
    outputPath: filePathSchema,
    fps: boundedNumber(1, 60).default(10),
    width: boundedNumber(16, 7680).default(480),
    /** -1 = döngü yok, 0 = sonsuz. */
    loop: boundedNumber(-1, 65535).default(0)
  })
  .strict();

export const ipcApngConvertRequestSchema = z
  .object({
    inputPath: filePathSchema,
    outputPath: filePathSchema,
    fps: boundedNumber(1, 60).default(15),
    width: boundedNumber(16, 7680).default(480),
    plays: boundedNumber(0, 65535).default(0)
  })
  .strict();

export const ipcPdfConvertRequestSchema = z
  .object({
    inputPath: filePathSchema,
    /**
     * pdftoppm'e `-${format}` olarak geçiyor: enum olmazsa renderer buradan
     * rastgele komut satırı bayrağı enjekte edebilir.
     */
    format: z.enum(["png", "jpeg", "tiff"]).default("png"),
    dpi: boundedNumber(36, 1200).default(150)
  })
  .strict();

export const ipcSubtitleProbeRequestSchema = z.object({ inputPath: filePathSchema }).strict();

export const ipcSubtitleExtractRequestSchema = z
  .object({
    inputPath: filePathSchema,
    outputPath: filePathSchema,
    streamIndex: boundedNumber(0, 999).default(0),
    /** Renderer gönderiyor ama ana süreç kullanmıyor; şema uğruna kabul edilir. */
    format: z.enum(["srt", "ass", "vtt"]).optional()
  })
  .strict();

export const ipcVideoTrimRequestSchema = z
  .object({
    inputPath: filePathSchema,
    outputPath: filePathSchema,
    startSec: boundedNumber(0, 86400).default(0),
    endSec: z.preprocess(
      (v) => (v === null || v === undefined ? null : v),
      z.union([boundedNumber(0, 86400), z.null()])
    ),
    streamCopy: z.boolean().default(true)
  })
  .strict();

export const ipcAudioNormalizeRequestSchema = z
  .object({
    inputPath: filePathSchema,
    outputPath: filePathSchema,
    /** loudnorm sınırları: I ∈ [-70,-5], TP ∈ [-9,0], LRA ∈ [1,50]. */
    targetLufs: boundedNumber(-70, -5).default(-14),
    truePeak: boundedNumber(-9, 0).default(-1),
    lra: boundedNumber(1, 50).default(11)
  })
  .strict();

/** drawtext `fontcolor=` değeri: ffmpeg renk adı veya #RRGGBB[AA]. */
const fontColorSchema = z
  .string()
  .trim()
  .regex(/^(#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?|[a-zA-Z]{3,20})$/, "Geçersiz renk");

export const ipcWatermarkRequestSchema = z
  .object({
    inputPath: filePathSchema,
    outputPath: filePathSchema,
    mode: z.enum(["text", "image"]).default("text"),
    /** Filtergraph'a gömülür — uzunluk sınırlı, kaçırma ana süreçte yapılır. */
    text: z.string().max(500).default("Filigran"),
    imagePath: filePathSchema.optional(),
    position: z.enum(["topleft", "topright", "bottomleft", "bottomright", "center"]).default("bottomright"),
    opacity: boundedNumber(0, 1).default(0.5),
    fontSize: boundedNumber(6, 512).default(36),
    fontColor: fontColorSchema.default("white")
  })
  .strict()
  .refine((v) => v.mode !== "image" || (v.imagePath != null && v.imagePath.length > 0), {
    message: "Görsel filigran için imagePath gerekli",
    path: ["imagePath"]
  });

export const ipcMetadataReadRequestSchema = z.object({ inputPath: filePathSchema }).strict();

export const ipcMetadataWriteRequestSchema = z
  .object({
    inputPath: filePathSchema,
    outputPath: filePathSchema,
    /** `-metadata k=v` olarak geçer; anahtar ffmpeg'in kabul ettiği sadeliğe indirilir. */
    tags: z.record(
      z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "Geçersiz etiket adı"),
      z.string().max(2000)
    )
  })
  .strict();

export const userProfileSchema = z.object({
  id: z.string().max(200).optional(),
  name: z.string().trim().min(1).max(200),
  targetProfileId: z.string().trim().min(1).max(200),
  qualityPreset: z.string().max(64).optional(),
  resolutionPreset: z.string().max(64).optional(),
  audioChannels: z.union([z.literal(1), z.literal(2)]).optional(),
  extraFfmpegArgs: z.string().max(2000).optional(),
  createdAt: z.number().finite().optional()
});

export const ipcProfilesSaveRequestSchema = userProfileSchema.strict();
export const ipcProfilesDeleteRequestSchema = z.object({ id: z.string().min(1).max(200) }).strict();

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
export type IpcSettingsSetRequest = z.infer<typeof ipcSettingsSetRequestSchema>;
export type LpcSettingsPayload = z.infer<typeof lpcSettingsSchema>;
export type IpcAudioMergeRequest = z.infer<typeof ipcAudioMergeRequestSchema>;
export type IpcVideoMergeRequest = z.infer<typeof ipcVideoMergeRequestSchema>;
export type IpcFrameExtractRequest = z.infer<typeof ipcFrameExtractRequestSchema>;
export type IpcGifConvertRequest = z.infer<typeof ipcGifConvertRequestSchema>;
export type IpcApngConvertRequest = z.infer<typeof ipcApngConvertRequestSchema>;
export type IpcPdfConvertRequest = z.infer<typeof ipcPdfConvertRequestSchema>;
export type IpcSubtitleExtractRequest = z.infer<typeof ipcSubtitleExtractRequestSchema>;
export type IpcVideoTrimRequest = z.infer<typeof ipcVideoTrimRequestSchema>;
export type IpcAudioNormalizeRequest = z.infer<typeof ipcAudioNormalizeRequestSchema>;
export type IpcWatermarkRequest = z.infer<typeof ipcWatermarkRequestSchema>;
export type IpcMetadataWriteRequest = z.infer<typeof ipcMetadataWriteRequestSchema>;
export type UserProfilePayload = z.infer<typeof userProfileSchema>;
