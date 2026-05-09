import { z } from "zod";

/** Tek dosya seçimi için temel doğrulama (renderer → IPC). */
export const filePathSchema = z.string().trim().min(1);

/** Ana süreçte kullanıcıdan gelen FFmpeg yolu (bilinçli olarak gevşek; shell ile çalıştırılmaz). */
export const ffmpegExecutableSchema = z.string().trim().min(1);

/** executable yoksa ana süreç gömülü ikiliyi seçer (PATH varsayılanı yok). */
export const ipcGetFfmpegVersionRequestSchema = z.object({
  executable: ffmpegExecutableSchema.optional()
});

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
