import type { AudioEncoderChoice, ConversionMode, VideoEncoderChoice } from "@lfc/types";

import type { TargetProfileId } from "./target-profiles";

export interface ConvertJobHints {
  mode: ConversionMode;
  audioOnlyOutput: boolean;
  videoEncoder?: VideoEncoderChoice;
  audioEncoder?: AudioEncoderChoice;
  /** mp4 | webm | mkv | mp3 | wav | m4a | png */
  outputContainer: string;
}

/**
 * Seçilen hedef profile göre `ConvertJobSpec` doldurma ipuçları.
 */
export function targetProfileToJobHints(id: TargetProfileId): ConvertJobHints {
  switch (id) {
    case "mp4-h264-aac":
      return {
        mode: "transcode",
        audioOnlyOutput: false,
        videoEncoder: "libx264",
        audioEncoder: "aac",
        outputContainer: "mp4"
      };
    case "mp4-h265-aac":
      return {
        mode: "transcode",
        audioOnlyOutput: false,
        videoEncoder: "libx265",
        audioEncoder: "aac",
        outputContainer: "mp4"
      };
    case "mp4-av1-aac":
      return {
        mode: "transcode",
        audioOnlyOutput: false,
        videoEncoder: "libsvtav1",
        audioEncoder: "aac",
        outputContainer: "mp4"
      };
    case "webm-vp9-opus":
      return {
        mode: "transcode",
        audioOnlyOutput: false,
        videoEncoder: "libvpx-vp9",
        audioEncoder: "libopus",
        outputContainer: "webm"
      };
    case "mkv-h264-aac":
      return {
        mode: "transcode",
        audioOnlyOutput: false,
        videoEncoder: "libx264",
        audioEncoder: "aac",
        outputContainer: "mkv"
      };
    case "audio-mp3":
      return {
        mode: "transcode",
        audioOnlyOutput: true,
        audioEncoder: "libmp3lame",
        outputContainer: "mp3"
      };
    case "audio-wav":
      return {
        mode: "transcode",
        audioOnlyOutput: true,
        audioEncoder: "pcm_s16le",
        outputContainer: "wav"
      };
    case "audio-m4a-aac":
      return {
        mode: "transcode",
        audioOnlyOutput: true,
        audioEncoder: "aac",
        outputContainer: "m4a"
      };
    case "audio-flac":
      return {
        mode: "transcode",
        audioOnlyOutput: true,
        audioEncoder: "flac",
        outputContainer: "flac"
      };
    case "audio-opus":
      return {
        mode: "transcode",
        audioOnlyOutput: true,
        audioEncoder: "libopus",
        outputContainer: "opus"
      };
    case "remux-copy":
      return {
        mode: "copy",
        audioOnlyOutput: false,
        outputContainer: "mkv"
      };
    case "image-png":
      return {
        mode: "transcode",
        audioOnlyOutput: false,
        videoEncoder: "png",
        outputContainer: "png"
      };
    case "image-jpeg":
      return {
        mode: "transcode",
        audioOnlyOutput: false,
        videoEncoder: "mjpeg",
        outputContainer: "jpg"
      };
    case "image-webp":
      return {
        mode: "transcode",
        audioOnlyOutput: false,
        videoEncoder: "libwebp",
        outputContainer: "webp"
      };

    case "image-avif":
      return {
        mode: "transcode",
        audioOnlyOutput: false,
        videoEncoder: "libsvtav1",
        outputContainer: "avif"
      };

    // ── Sosyal medya presetleri ───────────────────────────────────────────────
    case "social-wp-video":
    case "social-ig-feed":
    case "social-ig-stories":
    case "social-msg-video":
    case "social-tg-video":
    case "social-yt-1080":
    case "social-yt-4k":
    case "social-tt-video":
    case "social-li-video":
    case "social-x-video":
    case "social-dc-video":
      return {
        mode: "transcode",
        audioOnlyOutput: false,
        videoEncoder: "libx264",
        audioEncoder: "aac",
        outputContainer: "mp4"
      };
    case "social-wp-image":
    case "social-ig-image":
    case "social-msg-image":
    case "social-tg-image":
      return {
        mode: "transcode",
        audioOnlyOutput: false,
        videoEncoder: "mjpeg",
        outputContainer: "jpg"
      };
    case "social-wp-audio":
      return {
        mode: "transcode",
        audioOnlyOutput: true,
        audioEncoder: "aac",
        outputContainer: "m4a"
      };
    case "social-tg-audio":
      return {
        mode: "transcode",
        audioOnlyOutput: true,
        audioEncoder: "libmp3lame",
        outputContainer: "mp3"
      };

    default: {
      const _x: never = id;
      return _x;
    }
  }
}
