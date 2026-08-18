/**
 * Altyazı çıkarma argümanları (DENETIM.md D-06).
 *
 * Eski davranış: handler sabit `-c:s copy` kullanıyor ve payload'daki `format`
 * alanını hiç okumuyordu. Arayüz SRT / ASS / VTT sunuyor ama hiçbirine dönüşüm
 * yapılmıyordu. MP4'ün standart altyazı codec'i olan `mov_text` ile üç format da
 * boş dosya ve `Could not write header` veriyordu — yani en yaygın durum
 * çalışmıyordu.
 *
 * Yeni davranış: hedef format açıkça istenen codec'e çevrilir. Kaynak zaten
 * hedef codec ise `copy` kullanılır (kayıpsız ve hızlı). Bitmap altyazılar
 * metne çevrilemez; sessizce bozuk dosya üretmek yerine anlaşılır bir hata
 * dönülür.
 */

export type SubtitleFormat = "srt" | "ass" | "vtt";

/** Hedef formatın ffmpeg codec adı. */
const FORMAT_CODEC: Record<SubtitleFormat, string> = {
  srt: "srt",
  ass: "ass",
  vtt: "webvtt"
};

/** Aynı formatın ffprobe'da görülebilen codec adları. */
const FORMAT_ALIASES: Record<SubtitleFormat, string[]> = {
  srt: ["srt", "subrip"],
  ass: ["ass", "ssa"],
  vtt: ["webvtt", "vtt"]
};

/**
 * Görüntü tabanlı altyazılar. Metne çevirmek OCR gerektirir; ffmpeg bunu
 * yapamaz ve `-c:s srt` ile "Subtitle encoding currently only possible from
 * text to text or bitmap to bitmap" hatası verir.
 */
const BITMAP_CODECS = new Set([
  "dvd_subtitle",
  "dvdsub",
  "hdmv_pgs_subtitle",
  "pgssub",
  "dvb_subtitle",
  "dvbsub",
  "xsub"
]);

export interface SubtitleExtractInput {
  inputPath: string;
  outputPath: string;
  /** Kaynak dosyadaki genel akış indeksi. */
  streamIndex: number;
  format: SubtitleFormat;
  /** ffprobe'dan gelen kaynak codec adı; bilinmiyorsa null. */
  sourceCodec: string | null;
}

export type SubtitleExtractResult =
  | { ok: true; args: string[]; codec: string }
  | { ok: false; reason: string };

export function buildSubtitleExtractArgs(input: SubtitleExtractInput): SubtitleExtractResult {
  const source = input.sourceCodec?.toLowerCase() ?? null;

  if (source !== null && BITMAP_CODECS.has(source)) {
    return {
      ok: false,
      reason: `Bu altyazı görüntü tabanlı (${source}); metin formatına çevrilemez. PGS/VobSub altyazılar için OCR gerekir.`
    };
  }

  // Kaynak zaten hedef formatsa yeniden kodlamaya gerek yok.
  const isAlreadyTarget = source !== null && FORMAT_ALIASES[input.format].includes(source);
  const codec = isAlreadyTarget ? "copy" : FORMAT_CODEC[input.format];

  return {
    ok: true,
    codec,
    args: [
      "-i",
      input.inputPath,
      "-map",
      `0:${input.streamIndex}`,
      "-c:s",
      codec,
      "-y",
      input.outputPath
    ]
  };
}

/** Çıktı dosyasının uzantısı hedef formatla eşleşmezse ffmpeg konteyneri yanlış seçer. */
export function subtitleExtensionFor(format: SubtitleFormat): string {
  return format === "vtt" ? "vtt" : format;
}
