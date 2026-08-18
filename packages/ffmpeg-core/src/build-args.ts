import type { ConvertJobSpec, VideoTranscodeHints } from "@lfc/types";

import { copyStreams } from "@lfc/ffmpeg-presets";

function aspectRatioCropFilter(ratio: string): string | null {
  const parts = ratio.split(":");
  if (parts.length !== 2) return null;
  const aw = Number(parts[0]);
  const ah = Number(parts[1]);
  if (!Number.isFinite(aw) || !Number.isFinite(ah) || aw <= 0 || ah <= 0) return null;
  // Crop to center: compare iw*ah vs ih*aw to detect if source is wider than target.
  // Virgüller `\,` ile kaçırılmalı: filtergraph içinde çıplak virgül filtre ayracıdır ve
  // if() ifadesini ortadan bölerek "No such filter" hatasına yol açar.
  const wider = `gt(iw*${ah}\\,ih*${aw})`;
  return `crop=if(${wider}\\,ih*${aw}/${ah}\\,iw):if(${wider}\\,ih\\,iw*${ah}/${aw})`;
}

/** Yalnızca pozitif sonlu sayı bir ölçü sayılır — `0` ölçü değil, "verilmedi" de değil. */
function usable(n: number | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

function vfScale(hints: VideoTranscodeHints | undefined): string[] {
  const segments: string[] = [];
  const width = usable(hints?.width) ? hints.width : undefined;
  const height = usable(hints?.height) ? hints.height : undefined;
  const fps = usable(hints?.fps) ? hints.fps : undefined;
  const aspectRatio = hints?.aspectRatio;

  if (aspectRatio) {
    const cropF = aspectRatioCropFilter(aspectRatio);
    if (cropF) segments.push(cropF);
  }

  if (width !== undefined && height !== undefined) {
    // Her iki boyut da verildiğinde çıplak `scale=W:H` görüntüyü esnetir. Dikey
    // sosyal presetler tam olarak bu yüzden 1080×1920 piksel ölçüsünü tutturup
    // içeriği eziyordu (DENETIM.md D-08). Varsayılan artık "doldur ve kırp".
    const fit = hints?.fit ?? "cover";
    if (fit === "stretch") {
      segments.push(`scale=${width}:${height}`);
    } else if (fit === "contain") {
      segments.push(
        `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`
      );
    } else {
      segments.push(
        `scale=${width}:${height}:force_original_aspect_ratio=increase`,
        `crop=${width}:${height}`
      );
    }
    // Örnek en-boy oranı 1'e sabitlenmezse oynatıcı kareyi yine yamuk gösterir.
    segments.push("setsar=1");
  } else if (width !== undefined || height !== undefined) {
    // Tek boyut verildiğinde diğeri oranı koruyacak şekilde türetilir.
    segments.push(`scale=${width ?? -2}:${height ?? -2}`, "setsar=1");
  } else if (aspectRatio) {
    // Kırpma sonrası çift boyut şartı — çoğu kodlayıcı tek boyut kabul etmez.
    segments.push("scale=trunc(iw/2)*2:trunc(ih/2)*2", "setsar=1");
  }

  if (fps !== undefined) {
    segments.push(`fps=${fps}`);
  }

  if (!segments.length) {
    return [];
  }
  return ["-vf", segments.join(",")];
}

type QualityTier = NonNullable<VideoTranscodeHints["qualityPreset"]>;

function pickQualityTier(spec: ConvertJobSpec): QualityTier {
  return spec.videoHints?.qualityPreset ?? "balanced";
}

// CRF/QP değer tabloları — (high | compatible | balanced | small | very_small)
function crf(map: [string, string, string, string, string], q: QualityTier): string {
  const idx: Record<QualityTier, number> = { high: 0, compatible: 1, balanced: 2, small: 3, very_small: 4 };
  return map[idx[q]] ?? map[2];
}

/** Tek kare görüntü üreten çıktı uzantıları. */
const STILL_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "avif", "bmp", "tif", "tiff"]);
/** Yalnızca görüntü kodlayan encoder'lar. */
const IMAGE_ENCODERS = new Set(["png", "mjpeg", "libwebp"]);

/**
 * Çıktı tek kare görüntü mü?
 *
 * Yalnızca encoder'a bakmak yetmiyordu: AVIF `libsvtav1` ile kodlanıyor ve
 * libsvtav1 aynı zamanda geçerli bir video kodlayıcısı. Sesli MP4'ten AVIF
 * üretildiğinde iş video dalına düşüyor, `-c:a aac` ekleniyor, `-an`
 * eklenmiyordu — sonuç durağan görüntü değil, iki AV1 akışlı animasyonlu
 * dosyaydı (DENETIM.md D-15). Uzantı bu ayrımı güvenilir biçimde taşıyor.
 */
function isStillImageOutput(spec: ConvertJobSpec): boolean {
  if (spec.videoEncoder != null && IMAGE_ENCODERS.has(spec.videoEncoder)) return true;
  const ext = spec.outputPath.split(".").pop()?.toLowerCase();
  return ext !== undefined && STILL_IMAGE_EXTENSIONS.has(ext);
}

/**
 * Donanım kodlayıcısı seçildiğinde çözme tarafını da hızlandır (DENETIM.md D-17).
 *
 * `capabilities.ts` VideoToolbox'ı doğru tespit ediyordu ama `-hwaccel` hiçbir
 * zaman argümanlara yansımıyordu; hızlandırma yalnızca yarım bağlıydı. Çıktı
 * biçimi belirtilmiyor: kareler sistem belleğine indiriliyor, böylece `-vf`
 * zinciri çalışmaya devam ediyor ve desteklenmeyen girdide ffmpeg yazılım
 * çözmeye kendiliğinden düşüyor.
 */
function hwaccelArgs(encoder: ConvertJobSpec["videoEncoder"]): string[] {
  if (encoder == null) return [];
  if (encoder.endsWith("_videotoolbox")) return ["-hwaccel", "videotoolbox"];
  if (encoder.endsWith("_nvenc")) return ["-hwaccel", "cuda"];
  if (encoder.endsWith("_qsv")) return ["-hwaccel", "qsv"];
  if (encoder.endsWith("_vaapi")) return ["-hwaccel", "vaapi"];
  return [];
}

/** Kalite katmanı başına piksel başına bit — çözünürlüğe duyarlı bitrate için. */
const BITS_PER_PIXEL: Record<QualityTier, number> = {
  high: 0.15,
  compatible: 0.1,
  balanced: 0.07,
  small: 0.035,
  very_small: 0.02
};

/**
 * VideoToolbox `-b:v` değeri. Sabit değer 320×240 için savurgan, 4K için
 * yetersizdi (DENETIM.md D-17); hedef ya da kaynak ölçüsü biliniyorsa bitrate
 * kare alanına göre hesaplanır. Ölçü bilinmiyorsa katman varsayılanı korunur.
 */
function videotoolboxBitrate(spec: ConvertJobSpec, q: QualityTier, fallback: string): string {
  const h = spec.videoHints;
  const width = usable(h?.width) ? h.width : usable(h?.sourceWidth) ? h.sourceWidth : undefined;
  const height = usable(h?.height) ? h.height : usable(h?.sourceHeight) ? h.sourceHeight : undefined;
  if (width === undefined || height === undefined) return fallback;
  const fps = usable(h?.fps) ? h.fps : 30;
  const bps = Math.round(width * height * fps * BITS_PER_PIXEL[q]);
  // 300 kbps altı izlenemez, 60 Mbps üstü hiçbir kullanım için gerekmiyor.
  return String(Math.min(60_000_000, Math.max(300_000, bps)));
}

function videoArgsForEncoder(
  encoder: NonNullable<ConvertJobSpec["videoEncoder"]>,
  q: QualityTier,
  spec?: ConvertJobSpec
): string[] {
  switch (encoder) {
    case "libx264":
      return ["-c:v", "libx264", "-crf", crf(["18", "20", "23", "28", "35"], q), "-preset", "medium"];
    case "libx265":
      return ["-c:v", "libx265", "-crf", crf(["22", "24", "28", "32", "38"], q), "-preset", "medium"];
    case "libsvtav1":
      return ["-c:v", "libsvtav1", "-crf", crf(["26", "28", "30", "36", "42"], q), "-preset", "8"];
    case "libvpx-vp9":
      return ["-c:v", "libvpx-vp9", "-crf", crf(["26", "28", "30", "36", "42"], q), "-b:v", "0"];
    case "png":
      return ["-c:v", "png"];
    case "mjpeg":
      return ["-c:v", "mjpeg", "-q:v", crf(["1", "2", "5", "10", "15"], q)];
    case "libwebp":
      return ["-c:v", "libwebp", "-quality", crf(["95", "92", "80", "65", "50"], q)];

    // NVIDIA nvenc
    case "h264_nvenc":
      return ["-c:v", "h264_nvenc", "-cq", crf(["18", "20", "23", "28", "35"], q), "-preset", "p5"];
    case "hevc_nvenc":
      return ["-c:v", "hevc_nvenc", "-cq", crf(["22", "24", "28", "32", "38"], q), "-preset", "p5"];
    case "av1_nvenc":
      return ["-c:v", "av1_nvenc", "-cq", crf(["26", "28", "30", "36", "42"], q), "-preset", "p5"];

    // Intel QSV
    case "h264_qsv":
      return ["-c:v", "h264_qsv", "-global_quality", crf(["18", "20", "23", "28", "35"], q)];
    case "hevc_qsv":
      return ["-c:v", "hevc_qsv", "-global_quality", crf(["22", "24", "28", "30", "36"], q)];
    case "av1_qsv":
      return ["-c:v", "av1_qsv", "-global_quality", crf(["24", "26", "30", "34", "40"], q)];

    // AMD AMF
    case "h264_amf":
      return ["-c:v", "h264_amf", "-quality", "quality", "-rc", "cqp", "-qp_i", crf(["18", "20", "22", "30", "38"], q)];
    case "hevc_amf":
      return ["-c:v", "hevc_amf", "-quality", "quality", "-rc", "cqp", "-qp_i", crf(["20", "22", "24", "32", "40"], q)];
    case "av1_amf":
      return ["-c:v", "av1_amf", "-quality", "quality", "-rc", "cqp", "-qp_i", crf(["22", "24", "26", "34", "42"], q)];

    // Apple VideoToolbox
    case "h264_videotoolbox":
      return [
        "-c:v",
        "h264_videotoolbox",
        "-b:v",
        spec ? videotoolboxBitrate(spec, q, crf(["12M", "8M", "5M", "2M", "1M"], q)) : crf(["12M", "8M", "5M", "2M", "1M"], q)
      ];
    case "hevc_videotoolbox":
      return [
        "-c:v",
        "hevc_videotoolbox",
        "-b:v",
        spec ? videotoolboxBitrate(spec, q, crf(["10M", "6M", "4M", "2M", "800k"], q)) : crf(["10M", "6M", "4M", "2M", "800k"], q)
      ];

    // VAAPI
    case "h264_vaapi":
      return ["-c:v", "h264_vaapi", "-global_quality", crf(["18", "20", "22", "28", "35"], q)];
    case "hevc_vaapi":
      return ["-c:v", "hevc_vaapi", "-global_quality", crf(["20", "22", "24", "30", "36"], q)];

    default: {
      const _exhaustive: never = encoder;
      return _exhaustive;
    }
  }
}

/** Kalite ön ayarının ses bitrate etiketi. Kayıpsız/kopya kodlayıcılarda null. */
function audioBitrateLabel(
  encoder: ConvertJobSpec["audioEncoder"],
  q: QualityTier
): string | null {
  switch (encoder ?? "aac") {
    case "copy":
      return null;
    case "libmp3lame":
      return crf(["320k", "256k", "192k", "128k", "96k"], q);
    case "libopus":
      return crf(["256k", "192k", "128k", "96k", "64k"], q);
    case "pcm_s16le":
      return null;
    case "flac":
      return null;
    case "aac":
    default:
      return crf(["256k", "224k", "160k", "128k", "96k"], q);
  }
}

/** `-b:a` destekleyen (kayıplı) kodlayıcılar — boyut bütçesi bunlarda ayarlanabilir. */
function supportsAudioBitrate(encoder: ConvertJobSpec["audioEncoder"]): boolean {
  const e = encoder ?? "aac";
  return e === "aac" || e === "libmp3lame" || e === "libopus";
}

function labelToBps(label: string | null, fallbackBps: number): number {
  if (label == null) return fallbackBps;
  const m = /^(\d+)k$/.exec(label);
  return m ? Number(m[1]) * 1000 : fallbackBps;
}

/** Kayıpsız/kopya ses için bütçeden düşülecek temkinli tahmin (bit/sn). */
const LOSSLESS_AUDIO_ESTIMATE_BPS = 1_000_000;
/** Konteyner başlıkları ve muxing payı için ayrılan oran. */
const CONTAINER_OVERHEAD_RATIO = 0.97;
/** Bunun altına inersek çıktı zaten izlenemez; sınırı aşmayı göze alıp burada duruyoruz. */
const MIN_VIDEO_BPS = 100_000;
const MIN_AUDIO_BPS = 32_000;

function audioBitrateBps(encoder: ConvertJobSpec["audioEncoder"], q: QualityTier): number {
  return labelToBps(audioBitrateLabel(encoder, q), LOSSLESS_AUDIO_ESTIMATE_BPS);
}

function pickAudioEncoderArgs(
  encoder: ConvertJobSpec["audioEncoder"],
  q: QualityTier,
  overrideBps?: number
): string[] {
  const e = encoder ?? "aac";
  if (e === "copy") return ["-c:a", "copy"];
  if (e === "pcm_s16le") return ["-c:a", "pcm_s16le"];
  if (e === "flac") return ["-c:a", "flac"];

  const label = audioBitrateLabel(e, q);
  const bitrate =
    overrideBps != null && supportsAudioBitrate(e)
      ? String(Math.max(MIN_AUDIO_BPS, Math.min(overrideBps, labelToBps(label, overrideBps))))
      : (label ?? "160k");
  return ["-c:a", e, "-b:a", bitrate];
}

/**
 * Hedef dosya boyutunun toplam bit bütçesi. Süre bilinmiyorsa null.
 *
 * `-fs` bilinçli olarak KULLANILMIYOR: o bayrak sınıra ulaşınca yazmayı keser, yani videoyu
 * sessizce kırpar (30 sn kaynak → 3 sn çıktı, exit 0) ve moov atomu sonradan yazıldığı için
 * dosya yine sınırın üstünde kalır. Yani hem içeriği bozar hem amacına ulaşmaz.
 */
function totalBitBudget(spec: ConvertJobSpec): number | null {
  const mb = spec.videoHints?.targetSizeMb;
  const dur = spec.videoHints?.sourceDurationSec;
  if (mb == null || mb <= 0) return null;
  if (dur == null || !Number.isFinite(dur) || dur <= 0) return null;
  return mb * 1024 * 1024 * 8 * CONTAINER_OVERHEAD_RATIO;
}

/** Boyut bütçesinden video bitrate'i (bit/sn). Hesaplanamıyorsa null. */
function targetVideoBitrateBps(spec: ConvertJobSpec, q: QualityTier): number | null {
  const budget = totalBitBudget(spec);
  const dur = spec.videoHints?.sourceDurationSec;
  if (budget == null || dur == null) return null;
  const videoBps = Math.floor(budget / dur - audioBitrateBps(spec.audioEncoder, q));
  return Math.max(MIN_VIDEO_BPS, videoBps);
}

/** Yalnızca ses çıktısında boyut bütçesinden ses bitrate'i (bit/sn). */
function targetAudioBitrateBps(spec: ConvertJobSpec): number | null {
  const budget = totalBitBudget(spec);
  const dur = spec.videoHints?.sourceDurationSec;
  if (budget == null || dur == null) return null;
  return Math.floor(budget / dur);
}

/** Sabit bitrate hedefiyle kodlama argümanları — CRF yerine geçer, onunla birlikte kullanılmaz. */
function videoArgsForTargetBitrate(
  encoder: NonNullable<ConvertJobSpec["videoEncoder"]>,
  bps: number
): string[] {
  const b = String(bps);
  const maxrate = String(Math.floor(bps * 1.45));
  const bufsize = String(Math.floor(bps * 2));

  switch (encoder) {
    case "libx264":
    case "libx265":
      return ["-c:v", encoder, "-b:v", b, "-maxrate", maxrate, "-bufsize", bufsize, "-preset", "medium"];
    case "libsvtav1":
      return ["-c:v", "libsvtav1", "-b:v", b, "-preset", "8"];
    case "libvpx-vp9":
      return ["-c:v", "libvpx-vp9", "-b:v", b, "-maxrate", maxrate, "-bufsize", bufsize];
    // VideoToolbox -maxrate/-bufsize kabul etmiyor; yalnız hedef bitrate verilir.
    case "h264_videotoolbox":
    case "hevc_videotoolbox":
      return ["-c:v", encoder, "-b:v", b];
    default:
      return ["-c:v", encoder, "-b:v", b, "-maxrate", maxrate, "-bufsize", bufsize];
  }
}

/** Yüksek seviye iş tanımından `spawn` uyumlu argüman dizisi üretir (saf; Node API’si yok). */
export function buildFfmpegArgs(spec: ConvertJobSpec): string[] {
  const args = ["-hide_banner", "-nostdin", "-y"];

  // `-hwaccel` girdiden ÖNCE gelmek zorunda; çözme tarafını da hızlandırır.
  if (spec.mode !== "copy") {
    args.push(...hwaccelArgs(spec.videoEncoder));
  }

  args.push("-i", spec.inputPath);

  const extra = spec.extraFfmpegArgs?.filter((a) => a.trim().length > 0) ?? [];
  const acArgs = spec.audioChannels != null ? ["-ac", String(spec.audioChannels)] : [];
  // `container` sözleşmede vardı ama hiçbir yerde okunmuyordu; uzantısız çıktı
  // yolunda dönüşüm bu yüzden hata veriyordu (DENETIM.md D-16).
  const formatArgs = spec.container ? ["-f", spec.container] : [];

  if (spec.mode === "copy") {
    // `copyAllStreams` de ölü bir alandı: `@lfc/types` onu "tüm akışların
    // kopyalanması" diye tanımlıyor, ama remux `-map 0` içermediği için ek ses
    // ve altyazı izlerini sessizce düşürüyordu (DENETIM.md D-16).
    if (spec.copyAllStreams === true) {
      args.push("-map", "0");
    }
    args.push(...copyStreams());
    args.push(...formatArgs);
    args.push(...extra, spec.outputPath);
    return args;
  }

  const q = pickQualityTier(spec);
  const audioOnlyOutput =
    spec.audioOnlyOutput === true || (spec.videoHints?.stripVideo ?? false) === true;

  if (audioOnlyOutput) {
    const audioBudgetBps = targetAudioBitrateBps(spec);
    args.push("-vn");
    args.push(...pickAudioEncoderArgs(spec.audioEncoder, q, audioBudgetBps ?? undefined));
    args.push(...acArgs);
    args.push(...formatArgs);
    args.push(...extra, spec.outputPath);
    return args;
  }

  // Görüntü çıktısında boyut bütçesi anlamsız — tek kare zaten süreye bağlı değil.
  if (isStillImageOutput(spec)) {
    args.push(...vfScale(spec.videoHints));
    // `-frames:v 1` olmadan PNG/JPEG hedefleri ilk kareyi yazıp ikincide exit 234
    // ile düşüyor, ama diskte geçerli görünen kısmi bir dosya bırakıyordu; aynı
    // girdiyle libwebp animasyon üretiyordu — üç görüntü hedefi, üç ayrı
    // davranış (DENETIM.md D-14, D-15).
    args.push("-frames:v", "1");
    args.push(...videoArgsForEncoder(spec.videoEncoder ?? "mjpeg", q, spec));
    args.push("-an");
    args.push(...formatArgs);
    args.push(...extra, spec.outputPath);
    return args;
  }

  const videoEncoder = spec.videoEncoder ?? "libx264";
  const videoBudgetBps = targetVideoBitrateBps(spec, q);

  args.push(...vfScale(spec.videoHints));
  args.push(
    ...(videoBudgetBps != null
      ? videoArgsForTargetBitrate(videoEncoder, videoBudgetBps)
      : videoArgsForEncoder(videoEncoder, q, spec))
  );
  args.push(...pickAudioEncoderArgs(spec.audioEncoder, q));
  args.push(...acArgs);
  args.push(...formatArgs);
  args.push(...extra, spec.outputPath);
  return args;
}
