import type { TargetProfileId } from "./target-profiles";

export type SimpleFieldKey = "quality_preset" | "resolution_preset";

export type AdvancedFieldKey =
  | "ffmpeg_version"
  | "encoder_availability"
  | "hwaccel_list"
  | "override_video_encoder";

const SIMPLE_BY_PROFILE: Record<TargetProfileId, SimpleFieldKey[]> = {
  "mp4-h264-aac": ["quality_preset", "resolution_preset"],
  "webm-vp9-opus": ["quality_preset", "resolution_preset"],
  "mkv-h264-aac": ["quality_preset", "resolution_preset"],
  "audio-mp3": ["quality_preset"],
  "audio-wav": [],
  "audio-m4a-aac": ["quality_preset"],
  "audio-flac": ["quality_preset"],
  "audio-opus": ["quality_preset"],
  "remux-copy": [],
  "image-png": ["quality_preset"],
  "image-jpeg": ["quality_preset"],
  "image-webp": ["quality_preset"],
  // Sosyal medya presetleri — kalite/çözünürlük ayarı yok
  "social-wp-video": [],
  "social-wp-image": [],
  "social-wp-audio": [],
  "social-ig-feed": [],
  "social-ig-stories": [],
  "social-ig-image": [],
  "social-msg-video": [],
  "social-msg-image": [],
  "social-tg-video": [],
  "social-tg-image": [],
  "social-tg-audio": []
};

const ADVANCED_BY_PROFILE: Record<TargetProfileId, AdvancedFieldKey[]> = {
  "mp4-h264-aac": ["ffmpeg_version", "encoder_availability", "hwaccel_list", "override_video_encoder"],
  "webm-vp9-opus": ["ffmpeg_version", "encoder_availability", "override_video_encoder"],
  "mkv-h264-aac": ["ffmpeg_version", "encoder_availability", "hwaccel_list", "override_video_encoder"],
  "audio-mp3": ["ffmpeg_version", "encoder_availability"],
  "audio-wav": ["ffmpeg_version", "encoder_availability"],
  "audio-m4a-aac": ["ffmpeg_version", "encoder_availability"],
  "audio-flac": ["ffmpeg_version", "encoder_availability"],
  "audio-opus": ["ffmpeg_version", "encoder_availability"],
  "remux-copy": ["ffmpeg_version"],
  "image-png": ["ffmpeg_version", "encoder_availability"],
  "image-jpeg": ["ffmpeg_version", "encoder_availability"],
  "image-webp": ["ffmpeg_version", "encoder_availability"],
  // Sosyal medya presetleri
  "social-wp-video": ["ffmpeg_version", "encoder_availability"],
  "social-wp-image": ["ffmpeg_version", "encoder_availability"],
  "social-wp-audio": ["ffmpeg_version", "encoder_availability"],
  "social-ig-feed": ["ffmpeg_version", "encoder_availability"],
  "social-ig-stories": ["ffmpeg_version", "encoder_availability"],
  "social-ig-image": ["ffmpeg_version", "encoder_availability"],
  "social-msg-video": ["ffmpeg_version", "encoder_availability"],
  "social-msg-image": ["ffmpeg_version", "encoder_availability"],
  "social-tg-video": ["ffmpeg_version", "encoder_availability"],
  "social-tg-image": ["ffmpeg_version", "encoder_availability"],
  "social-tg-audio": ["ffmpeg_version", "encoder_availability"]
};

export function getSimpleFieldsForProfile(id: TargetProfileId): SimpleFieldKey[] {
  return [...SIMPLE_BY_PROFILE[id]];
}

export function getAdvancedFieldsForProfile(id: TargetProfileId): AdvancedFieldKey[] {
  return [...ADVANCED_BY_PROFILE[id]];
}
