import type { ConvertJobSpec, VideoTranscodeHints } from "@lfc/types";

import {
  balancedAacAudio,
  copyStreams,
  fastNvencCompatibleH264
} from "@lfc/ffmpeg-presets";

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

function vfScale(width?: number, height?: number, fps?: number, aspectRatio?: string): string[] {
  const segments: string[] = [];

  if (aspectRatio) {
    const cropF = aspectRatioCropFilter(aspectRatio);
    if (cropF) segments.push(cropF);
  }

  if (width ?? height) {
    const w = width ?? -2;
    const h = height ?? -2;
    segments.push(`scale=${w}:${h}`);
  } else if (aspectRatio) {
    // Ensure even dimensions required by most encoders after crop
    segments.push("scale=trunc(iw/2)*2:trunc(ih/2)*2");
  }

  if (fps) {
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

function videoArgsForEncoder(
  encoder: NonNullable<ConvertJobSpec["videoEncoder"]>,
  q: QualityTier
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
      return ["-c:v", "h264_videotoolbox", "-b:v", crf(["12M", "8M", "5M", "2M", "1M"], q)];
    case "hevc_videotoolbox":
      return ["-c:v", "hevc_videotoolbox", "-b:v", crf(["10M", "6M", "4M", "2M", "800k"], q)];

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

  args.push("-i", spec.inputPath);

  const extra = spec.extraFfmpegArgs?.filter((a) => a.trim().length > 0) ?? [];
  const acArgs = spec.audioChannels != null ? ["-ac", String(spec.audioChannels)] : [];

  if (spec.mode === "copy") {
    args.push(...copyStreams());
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
    args.push(...extra, spec.outputPath);
    return args;
  }

  // Görüntü çıktısında boyut bütçesi anlamsız — tek kare zaten süreye bağlı değil.
  if (
    spec.videoEncoder === "png" ||
    spec.videoEncoder === "mjpeg" ||
    spec.videoEncoder === "libwebp"
  ) {
    args.push(...vfScale(spec.videoHints?.width, spec.videoHints?.height, spec.videoHints?.fps, spec.videoHints?.aspectRatio));
    args.push(...videoArgsForEncoder(spec.videoEncoder, q));
    args.push("-an");
    args.push(...extra, spec.outputPath);
    return args;
  }

  const videoEncoder = spec.videoEncoder ?? "libx264";
  const videoBudgetBps = targetVideoBitrateBps(spec, q);

  args.push(...vfScale(spec.videoHints?.width, spec.videoHints?.height, spec.videoHints?.fps, spec.videoHints?.aspectRatio));
  args.push(
    ...(videoBudgetBps != null
      ? videoArgsForTargetBitrate(videoEncoder, videoBudgetBps)
      : videoArgsForEncoder(videoEncoder, q))
  );
  args.push(...pickAudioEncoderArgs(spec.audioEncoder, q));
  args.push(...acArgs);
  args.push(...extra, spec.outputPath);
  return args;
}
