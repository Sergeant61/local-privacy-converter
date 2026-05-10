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
  // Crop to center: compare iw*ah vs ih*aw to detect if source is wider than target
  const wider = `gt(iw*${ah},ih*${aw})`;
  return `crop=if(${wider},ih*${aw}/${ah},iw):if(${wider},ih,iw*${ah}/${aw})`;
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

function pickAudioEncoderArgs(
  encoder: ConvertJobSpec["audioEncoder"],
  q: QualityTier
): string[] {
  switch (encoder ?? "aac") {
    case "copy":
      return ["-c:a", "copy"];
    case "libmp3lame":
      return ["-c:a", "libmp3lame", "-b:a", crf(["320k", "256k", "192k", "128k", "96k"], q)];
    case "libopus":
      return ["-c:a", "libopus", "-b:a", crf(["256k", "192k", "128k", "96k", "64k"], q)];
    case "pcm_s16le":
      return ["-c:a", "pcm_s16le"];
    case "flac":
      return ["-c:a", "flac"];
    case "aac":
    default:
      return ["-c:a", "aac", "-b:a", crf(["256k", "224k", "160k", "128k", "96k"], q)];
  }
}

function targetSizeArgs(spec: ConvertJobSpec): string[] {
  const mb = spec.videoHints?.targetSizeMb;
  if (mb == null || mb <= 0) return [];
  return ["-fs", String(Math.round(mb * 1024 * 1024))];
}

/** Yüksek seviye iş tanımından `spawn` uyumlu argüman dizisi üretir (saf; Node API’si yok). */
export function buildFfmpegArgs(spec: ConvertJobSpec): string[] {
  const args = ["-hide_banner", "-nostdin", "-y"];

  args.push("-i", spec.inputPath);

  if (spec.mode === "copy") {
    args.push(...copyStreams());
    args.push(spec.outputPath);
    return args;
  }

  const q = pickQualityTier(spec);
  const fsA = targetSizeArgs(spec);
  const audioOnlyOutput =
    spec.audioOnlyOutput === true || (spec.videoHints?.stripVideo ?? false) === true;

  if (audioOnlyOutput) {
    args.push("-vn");
    args.push(...pickAudioEncoderArgs(spec.audioEncoder, q));
    args.push(...fsA, spec.outputPath);
    return args;
  }

  if (
    spec.videoEncoder === "png" ||
    spec.videoEncoder === "mjpeg" ||
    spec.videoEncoder === "libwebp"
  ) {
    args.push(...vfScale(spec.videoHints?.width, spec.videoHints?.height, spec.videoHints?.fps, spec.videoHints?.aspectRatio));
    args.push(...videoArgsForEncoder(spec.videoEncoder, q));
    args.push("-an");
    args.push(...fsA, spec.outputPath);
    return args;
  }

  args.push(...vfScale(spec.videoHints?.width, spec.videoHints?.height, spec.videoHints?.fps, spec.videoHints?.aspectRatio));
  args.push(...videoArgsForEncoder(spec.videoEncoder ?? "libx264", q));
  args.push(...pickAudioEncoderArgs(spec.audioEncoder, q));
  args.push(...fsA, spec.outputPath);
  return args;
}
