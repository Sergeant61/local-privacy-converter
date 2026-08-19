import type { VideoEncoderChoice } from "@lfc/types";

import { targetProfileToJobHints } from "./job-hints";
import type { TargetProfileId } from "./target-profiles";

/**
 * Hedef profilin YAZILIM kodlayıcısına karşılık gelen donanım kodlayıcıları,
 * öncelik sırasıyla.
 *
 * ── Neden kodek ailesine bağlı (ISTEMCI-TEST-RAPORU.md H-01) ───────────────
 *
 * Bu eşleme önceden Dönüştür ekranının içinde, kodek ailesinden bağımsız düz
 * bir liste olarak duruyordu: `["h264_videotoolbox", "h264_nvenc", …]` — yani
 * yalnızca H.264 kodlayıcıları. Dosya seçilir seçilmez bu listeden ilk bulunan
 * kodlayıcı seçiliyor ve hedef profilin kendi kodlayıcısını EZİYORDU. Mac'te
 * ölçülen sonuç:
 *
 *   • "MP4 (H.265 / HEVC)" seçildi → çıktı `codec_name=h264` (sessizce yanlış)
 *   • "WebM (VP9 + Opus)" seçildi → `Only VP8 or VP9 or AV1 video … supported
 *     for WebM` → dosya hiç yazılmadı
 *
 * Artık her hedef yalnızca KENDİ kodek ailesinden bir donanım kodlayıcısına
 * düşebiliyor; ailesi olmayan hedefler (VP9) yazılım kodlayıcısında kalıyor.
 */
export const GPU_ENCODERS_BY_FAMILY: Partial<
  Record<VideoEncoderChoice, readonly VideoEncoderChoice[]>
> = {
  libx264: ["h264_videotoolbox", "h264_nvenc", "h264_qsv", "h264_amf", "h264_vaapi"],
  libx265: ["hevc_videotoolbox", "hevc_nvenc", "hevc_qsv", "hevc_amf", "hevc_vaapi"],
  libsvtav1: ["av1_nvenc", "av1_qsv", "av1_amf"]
  // libvpx-vp9: FFmpeg'de yaygın bir donanım VP9 kodlayıcısı yok — yazılımda kalır.
};

/** Herhangi bir ailede geçen tüm donanım kodlayıcıları (arayüz rozeti için). */
export const GPU_ENCODERS: ReadonlySet<string> = new Set(
  Object.values(GPU_ENCODERS_BY_FAMILY).flat()
);

/**
 * Bu hedef profil için kullanılabilir donanım kodlayıcısı.
 *
 * @param available Sistemde bulunan kodlayıcı adları (`ffmpeg -encoders`).
 * @returns Kullanılacak kodlayıcı, ya da uygun donanım kodlayıcısı yoksa `""`
 *          — bu durumda profilin kendi yazılım kodlayıcısı kullanılır.
 */
export function gpuEncoderForProfile(
  profileId: TargetProfileId,
  available: ReadonlySet<string>
): VideoEncoderChoice | "" {
  const softwareEncoder = targetProfileToJobHints(profileId).videoEncoder;
  if (!softwareEncoder) return "";
  const candidates = GPU_ENCODERS_BY_FAMILY[softwareEncoder] ?? [];
  return candidates.find((enc) => available.has(enc)) ?? "";
}
