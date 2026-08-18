import type { MediaKind } from "@lfc/types";

const IMAGE_CODECS = new Set([
  "png",
  "mjpeg",
  "bmp",
  "webp",
  "gif",
  "tiff",
  "jpeg2000",
  "jpegls"
]);

export interface ProbeStreamSummary {
  hasVideo: boolean;
  hasAudio: boolean;
  videoCodec: string | null;
  audioCodec: string | null;
}

/**
 * ffprobe özetinden UI `MediaKind` türetir.
 *
 * Kapak resmi (album art) bir görüntü akışı olarak görünür: kapaklı MP3'te hem
 * `mjpeg` video akışı hem `mp3` ses akışı vardır. Eskiden image-only dalı
 * `!hasAudio` şartına bağlıydı, bu yüzden böyle bir MP3 "video" sınıflanıyor,
 * arayüz 24 video hedefi sunuyor ve dönüşüm 0 baytla çöküyordu (DENETIM.md D-11).
 * Doğru ayrım "ses var mı" değil, görüntü akışının **gerçek video mu yoksa
 * gömülü kapak mı** olduğudur.
 */
export function mediaKindFromProbe(summary: ProbeStreamSummary): MediaKind {
  const { hasVideo, hasAudio, videoCodec } = summary;
  const codec = videoCodec?.toLowerCase() ?? null;
  const videoStreamIsImage = codec !== null && IMAGE_CODECS.has(codec);

  if (hasVideo && videoStreamIsImage) {
    // Sesi de varsa bu bir kapak resimli ses dosyasıdır, görüntü değil.
    return hasAudio ? "audio" : "image-only";
  }

  if (hasVideo) {
    return "video";
  }

  if (hasAudio) {
    return "audio";
  }

  // Hiçbir akış okunamadı. Eskiden varsayılan "video"ydu: bozuk ya da
  // desteklenmeyen dosya, kullanıcıya çalışmayacak 24 video hedefi olarak
  // sunuluyordu. "audio" en dar hedef kümesini verir ve yanlışlığı erken
  // görünür kılar.
  return "audio";
}
