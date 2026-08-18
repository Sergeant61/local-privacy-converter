/**
 * Video kırpma argümanları — saf fonksiyon (Node API'si yok), test edilebilir.
 *
 * `-ss` girdi tarafında hızlı aramayı sağlar, ancak zaman damgalarını sıfırlar.
 * Bu yüzden bitiş noktası `-to` ile verilemez: arama sonrası `-to` bitiş değil
 * **süre** anlamına gelir ve 3-7 sn aralığı isteyen kullanıcı 7 sn'lik çıktı alır.
 * Doğrusu süreyi `-t` ile vermektir.
 */
export interface TrimArgsInput {
  inputPath: string;
  outputPath: string;
  /** Başlangıç saniyesi. 0 veya negatifse arama yapılmaz. */
  startSec?: number;
  /** Bitiş saniyesi. null/undefined ise kaynağın sonuna kadar kırpılır. */
  endSec?: number | null;
  /** Yeniden kodlamadan kopyala (hızlı; kesme noktası keyframe'e kayabilir). */
  streamCopy?: boolean;
}

export type TrimArgsResult =
  | { ok: true; args: string[] }
  | { ok: false; reason: "invalid-range" };

export function buildTrimArgs(input: TrimArgsInput): TrimArgsResult {
  const start = typeof input.startSec === "number" && input.startSec > 0 ? input.startSec : 0;
  const end = typeof input.endSec === "number" ? input.endSec : null;

  if (end !== null && end <= start) {
    return { ok: false, reason: "invalid-range" };
  }

  const args: string[] = [];
  if (start > 0) args.push("-ss", String(start));
  args.push("-i", input.inputPath);
  if (end !== null) args.push("-t", String(end - start));
  if (input.streamCopy !== false) args.push("-c", "copy");
  args.push("-y", input.outputPath);

  return { ok: true, args };
}
