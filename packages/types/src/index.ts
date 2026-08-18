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
  | "hevc_vaapi"
  | "libvpx-vp9"
  /** Tek kare / görüntü çıktısı (-c:v png). */
  | "png"
  /** JPEG çıktısı (-c:v mjpeg, görüntü yolu). */
  | "mjpeg"
  /** WebP çıktısı (-c:v libwebp). */
  | "libwebp";

export type AudioEncoderChoice = "aac" | "libmp3lame" | "libopus" | "pcm_s16le" | "flac" | "copy";

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
  /** UI kalite ön ayarı — transcode bitrate/CRF seçimine yansır. */
  qualityPreset?: "high" | "compatible" | "balanced" | "small" | "very_small";
  /**
   * Hedef çıktı boyutu (MB). `sourceDurationSec` ile birlikte hedef bitrate'e çevrilir.
   * Süre bilinmiyorsa kısıt uygulanmaz — dosyayı kırpmaktansa sınırı aşmak yeğdir.
   */
  targetSizeMb?: number;
  /**
   * Kaynak medyanın saniye cinsinden süresi (ffprobe'dan). `targetSizeMb` verildiğinde
   * bitrate bütçesini hesaplamak için kullanılır; main process IPC'deki değerden doldurur.
   */
  sourceDurationSec?: number;
  /** Hedef en-boy oranı "W:H" formatında (ör. "16:9"). Crop filter ile uygulanır. */
  aspectRatio?: string;
  /**
   * Hem `width` hem `height` verildiğinde kareye nasıl oturulacağı.
   *
   * - `cover` (varsayılan): kareyi doldur, taşan kenarları ortadan kırp. Sosyal
   *   medya presetlerinin beklediği davranış.
   * - `contain`: tamamını sığdır, kalan alanı siyahla doldur.
   * - `stretch`: eski davranış — oranı bozarak esnet. Yalnızca açıkça istenirse.
   *
   * Öncesinde koşulsuz `stretch` uygulanıyordu: 1080×1920 dikey presetler piksel
   * ölçüsünü tutturuyor ama görüntüyü eziyordu (DENETIM.md D-08).
   */
  fit?: "cover" | "contain" | "stretch";
  /**
   * Kaynak karesinin piksel ölçüsü (ffprobe'dan). Hedef çözünürlük verilmediğinde
   * bitrate hesabı buna dayanır; main process doldurur.
   */
  sourceWidth?: number;
  sourceHeight?: number;
}

export interface ConvertJobSpec extends PathsInput {
  mode: ConversionMode;
  container?: string;
  videoEncoder?: VideoEncoderChoice;
  audioEncoder?: AudioEncoderChoice;
  videoHints?: VideoTranscodeHints;
  /** Remux sırasında tüm akışların kopyalanması (mode copy). */
  copyAllStreams?: boolean;
  /**
   * Çıktıda yalnızca ses (ör. mp3, wav, m4a). Video akışı yazılmaz (-vn).
   */
  audioOnlyOutput?: boolean;
  /** İleri düzey kullanıcılar için çıktı yolundan önce eklenen serbest FFmpeg argümanları. */
  extraFfmpegArgs?: string[];
  /** Çıktı ses kanalı sayısı: 1 (mono), 2 (stereo). Belirtilmezse kaynak korunur. */
  audioChannels?: 1 | 2;
}

/** ffprobe IPC özeti — renderer hedef listesini süzer. */
export interface MediaProbeSummary {
  formatName: string;
  durationSec: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
  videoCodec: string | null;
  audioCodec: string | null;
  inferredKind: MediaKind;
}

/** `ffmpeg -encoders` / `-decoders` / `-hwaccels` ayrıştırılmış sonuç. */
export interface FfmpegCapabilities {
  encoders: string[];
  decoders: string[];
  hwaccels: string[];
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
