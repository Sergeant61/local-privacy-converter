/**
 * Giriş türü → izin verilen hedef profilleri.
 *
 * FFmpeg pratiği: demuxer neredeyse her konteyneri okuyup çoğu muxer’a aktarabilir;
 * asıl kısıt **codec** (decoder/encoder) ve lisanslı codec paketleridir. Bu tablo,
 * ürün politikası olarak “anlamlı çıktı” ve mevcut `TargetProfileId` kümesiyle
 * sınırlıdır — tüm 370+ libavformat demuxer’i tek tek listelemez.
 *
 * Referanslar:
 * - FFmpeg mux/demux ve format listesi: https://ffmpeg.org/ffmpeg-formats.html
 * - Proje içi ffprobe özeti (`MediaKind`) ile birleştirilir; uzantı ipuçları isteğe bağlı ince ayar içindir.
 */

import type { MediaKind } from "@lfc/types";

import type { TargetProfile, TargetProfileId } from "./target-profiles";
import { getTargetById, TARGET_PROFILES } from "./target-profiles";

/** Video girişi için önerilen tüm hedef profil kimlikleri (video çıktı + ses çıkartma + remux). */
export const TARGET_IDS_FOR_VIDEO_INPUT: readonly TargetProfileId[] = [
  "mp4-h264-aac",
  "webm-vp9-opus",
  "mkv-h264-aac",
  "remux-copy",
  "audio-mp3",
  "audio-wav",
  "audio-m4a-aac",
  "audio-flac",
  "audio-opus",
  "social-wp-video",
  "social-wp-audio",
  "social-ig-feed",
  "social-ig-stories",
  "social-msg-video",
  "social-tg-video",
  "social-tg-audio"
] as const;

/** Yalnız ses girişi: çok konteynerde kopya (remux) + yaygın ses kodlamaları. */
export const TARGET_IDS_FOR_AUDIO_INPUT: readonly TargetProfileId[] = [
  "audio-mp3",
  "audio-wav",
  "audio-m4a-aac",
  "audio-flac",
  "audio-opus",
  "remux-copy",
  "social-wp-audio",
  "social-tg-audio"
] as const;

/** Durağan görüntü: çıktı yine görüntü biçimleri (tek akış). */
export const TARGET_IDS_FOR_IMAGE_INPUT: readonly TargetProfileId[] = [
  "image-png",
  "image-jpeg",
  "image-webp",
  "social-wp-image",
  "social-ig-image",
  "social-msg-image",
  "social-tg-image"
] as const;

const BY_KIND: Record<MediaKind, readonly TargetProfileId[]> = {
  video: TARGET_IDS_FOR_VIDEO_INPUT,
  audio: TARGET_IDS_FOR_AUDIO_INPUT,
  "image-only": TARGET_IDS_FOR_IMAGE_INPUT
};

/**
 * Uzantıya göre hedef listesi override (çoğu tür için boş — `MediaKind` yeter).
 * Politika: nadir durumlarda alt küme veya ekstra kısıt tanımlanır.
 */
export const TARGET_IDS_BY_SOURCE_EXTENSION: Readonly<
  Partial<Record<string, readonly TargetProfileId[]>>
> = {
  /* Örnek: ileride “yalnız ses” uzantılarında video çıktıyı gizle gibi kurallar */
};

function uniqueOrdered(ids: readonly TargetProfileId[]): TargetProfileId[] {
  const seen = new Set<TargetProfileId>();
  const out: TargetProfileId[] = [];
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** ffprobe `MediaKind` + isteğe bağlı kaynak uzantısı → hedef profil id listesi. */
export function targetIdsForSource(normalizedExt: string, kind: MediaKind): TargetProfileId[] {
  const ext = normalizedExt.trim().toLowerCase();
  const fromExt = ext.length > 0 ? TARGET_IDS_BY_SOURCE_EXTENSION[ext] : undefined;
  const base = fromExt ?? BY_KIND[kind];
  return uniqueOrdered(base);
}

/** `allowedInputKinds` yerine matris + isteğe bağlı uzantı kuralı (katalog sırası korunur). */
export function getTargetsForSource(normalizedExt: string, kind: MediaKind): TargetProfile[] {
  const want = new Set(targetIdsForSource(normalizedExt, kind));
  return TARGET_PROFILES.filter((p) => want.has(p.id));
}

/** Uzantı bilinmiyorsa boş dize verin; yalnızca `MediaKind` tablosu uygulanır. */
export function getTargetsForKind(kind: MediaKind): TargetProfile[] {
  return getTargetsForSource("", kind);
}

/** Programatik rapor — gelişmiş ekran veya dokümantasyon üretimi için. */
export function describeConversionMatrixTr(): string {
  const lines: string[] = [
    "Dönüşüm matrisi (LPC kataloğu)",
    "",
    "Kaynak: FFmpeg; konteyner ve codec ayrı kavramlardır. Gerçek uyumluluk kurulu decoder/encoder ve dosya içeriğine bağlıdır.",
    ""
  ];
  const kinds: MediaKind[] = ["video", "audio", "image-only"];
  for (const k of kinds) {
    lines.push(`## ${k}`);
    const labels = BY_KIND[k]
      .map((id) => getTargetById(id)?.labelTr ?? id)
      .join(" · ");
    lines.push(labels);
    lines.push("");
  }
  lines.push("### Uzantıya özel override");
  lines.push(
    Object.keys(TARGET_IDS_BY_SOURCE_EXTENSION).length === 0
      ? "(tanımlı değil — tüm türler yalnızca MediaKind tablosuna göre)"
      : JSON.stringify(TARGET_IDS_BY_SOURCE_EXTENSION, null, 2)
  );
  return lines.join("\n");
}
