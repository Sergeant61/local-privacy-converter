/**
 * FFmpeg varsayılan argüman parçaları — raporda önerilen 21.x satırlarıyla hizalı.
 * Tam komut sırasını `buildFfmpegArgs` oluşturur; burada üretilen parçalar sadece rehber.
 */

export type Cpu264PresetTier = "compatibility-balanced" | "high-quality-remux-ish";

/** Rapor §21.1 — uyumluluk ve güvenilir CPU encode (örtük örnek kırılımı). */
export function cpuCompatibleH264Preset(): readonly string[] {
  return ["-c:v", "libx264", "-crf", "23", "-preset", "medium"];
}

/** Rapor §21.2 — NVIDIA için hız odaklı (NVENC CQ). Donanım yoksa bu preset düşmez; UI encoder seçmeli. */
export function fastNvencCompatibleH264(): readonly string[] {
  return ["-c:v", "h264_nvenc", "-cq", "23", "-preset", "p5"];
}

export function balancedAacAudio(): readonly string[] {
  return ["-c:a", "aac", "-b:a", "160k"];
}

export function copyStreams(): readonly string[] {
  return ["-c", "copy"];
}
