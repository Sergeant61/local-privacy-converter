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

/** ffprobe özetinden UI `MediaKind` türetir. */
export function mediaKindFromProbe(summary: ProbeStreamSummary): MediaKind {
  const { hasVideo, hasAudio, videoCodec } = summary;

  if (hasVideo && !hasAudio && videoCodec && IMAGE_CODECS.has(videoCodec.toLowerCase())) {
    return "image-only";
  }

  if (hasVideo) {
    return "video";
  }

  if (hasAudio) {
    return "audio";
  }

  return "video";
}
