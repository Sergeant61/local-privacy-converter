import type { ConversionMode, MediaKind } from "@lfc/types";

export type TargetProfileId =
  | "mp4-h264-aac"
  | "mp4-h265-aac"
  | "mp4-av1-aac"
  | "webm-vp9-opus"
  | "mkv-h264-aac"
  | "audio-mp3"
  | "audio-wav"
  | "audio-m4a-aac"
  | "audio-flac"
  | "audio-opus"
  | "remux-copy"
  | "image-png"
  | "image-jpeg"
  | "image-webp"
  | "image-avif"
  // Sosyal medya presetleri
  | "social-wp-video"
  | "social-wp-image"
  | "social-wp-audio"
  | "social-ig-feed"
  | "social-ig-stories"
  | "social-ig-image"
  | "social-msg-video"
  | "social-msg-image"
  | "social-tg-video"
  | "social-tg-image"
  | "social-tg-audio"
  | "social-yt-1080"
  | "social-yt-4k"
  | "social-tt-video"
  | "social-li-video"
  | "social-x-video"
  | "social-dc-video";

export interface SocialMeta {
  platform: "whatsapp" | "instagram" | "messenger" | "telegram" | "youtube" | "tiktok" | "linkedin" | "x" | "discord";
  /** UI’da `<optgroup>` başlığı */
  platformLabelTr: string;
  /** Platform dosya boyutu sınırı (MB) — video/ses için `-fs` ile uygulanır */
  maxFileSizeMb: number;
  /** Otomatik ölçekleme genişliği (px); tanımlanmamışsa orijinal boyut korunur */
  forcedWidth?: number;
  forcedHeight?: number;
  /** Kalite ön ayarı yerine gösterilecek sabit bilgi metni */
  infoTr: string;
}

export interface TargetProfile {
  id: TargetProfileId;
  labelTr: string;
  descriptionTr: string;
  outputExtension: string;
  mode: ConversionMode;
  allowedInputKinds: readonly MediaKind[];
  /** `ffmpeg -encoders` içinde görünen kısaltmalar (ör. libx264). Boş: kopya modu. */
  requiredEncoders: readonly string[];
  /** Giriş codec’i için; genelde boş — isteğe bağlı sıkılaştırma. */
  requiredDecoders: readonly string[];
  hasVideoOut: boolean;
  /** Tanımlanmışsa bu profil bir sosyal medya presetidir */
  socialMeta?: SocialMeta;
}

const NON_IMAGE: readonly MediaKind[] = ["video", "audio"];
const VIDEO_AUDIO: readonly MediaKind[] = ["video", "audio"];

export const TARGET_PROFILES: readonly TargetProfile[] = [
  {
    id: "mp4-h264-aac",
    labelTr: "MP4 (H.264 + AAC)",
    descriptionTr: "Yaygın uyumluluk; çoğu cihazda sorunsuz oynatılır.",
    outputExtension: "mp4",
    mode: "transcode",
    allowedInputKinds: NON_IMAGE,
    requiredEncoders: ["libx264", "aac"],
    requiredDecoders: [],
    hasVideoOut: true
  },
  {
    id: "mp4-h265-aac",
    labelTr: "MP4 (H.265 / HEVC + AAC)",
    descriptionTr: "H.264'e kıyasla ~%50 daha küçük dosya; Apple ve modern cihazlarda desteklenir.",
    outputExtension: "mp4",
    mode: "transcode",
    allowedInputKinds: NON_IMAGE,
    requiredEncoders: ["libx265", "aac"],
    requiredDecoders: [],
    hasVideoOut: true
  },
  {
    id: "mp4-av1-aac",
    labelTr: "MP4 (AV1 + AAC)",
    descriptionTr: "Açık kaynak, en verimli sıkıştırma; Netflix ve YouTube standartlarında kullanılır.",
    outputExtension: "mp4",
    mode: "transcode",
    allowedInputKinds: NON_IMAGE,
    requiredEncoders: ["libsvtav1", "aac"],
    requiredDecoders: [],
    hasVideoOut: true
  },
  {
    id: "webm-vp9-opus",
    labelTr: "WebM (VP9 + Opus)",
    descriptionTr: "Web ve sıkıştırma odaklı; tarayıcı uyumu iyi.",
    outputExtension: "webm",
    mode: "transcode",
    allowedInputKinds: NON_IMAGE,
    requiredEncoders: ["libvpx-vp9", "libopus"],
    requiredDecoders: [],
    hasVideoOut: true
  },
  {
    id: "mkv-h264-aac",
    labelTr: "MKV (H.264 + AAC)",
    descriptionTr: "Esnek konteyner; altyazı ve çoklu akış için uygun.",
    outputExtension: "mkv",
    mode: "transcode",
    allowedInputKinds: NON_IMAGE,
    requiredEncoders: ["libx264", "aac"],
    requiredDecoders: [],
    hasVideoOut: true
  },
  {
    id: "audio-mp3",
    labelTr: "MP3 (yalın ses)",
    descriptionTr: "Yalnızca ses çıktısı; video şeridi olmaz.",
    outputExtension: "mp3",
    mode: "transcode",
    allowedInputKinds: VIDEO_AUDIO,
    requiredEncoders: ["libmp3lame"],
    requiredDecoders: [],
    hasVideoOut: false
  },
  {
    id: "audio-wav",
    labelTr: "WAV (PCM)",
    descriptionTr: "Sıkıştırmasız veya hafif PCM; düzenleme için uygun.",
    outputExtension: "wav",
    mode: "transcode",
    allowedInputKinds: VIDEO_AUDIO,
    requiredEncoders: ["pcm_s16le"],
    requiredDecoders: [],
    hasVideoOut: false
  },
  {
    id: "audio-m4a-aac",
    labelTr: "M4A (AAC)",
    descriptionTr: "AAC ses; Apple ekosisteminde yaygın.",
    outputExtension: "m4a",
    mode: "transcode",
    allowedInputKinds: VIDEO_AUDIO,
    requiredEncoders: ["aac"],
    requiredDecoders: [],
    hasVideoOut: false
  },
  {
    id: "audio-flac",
    labelTr: "FLAC (kayıpsız ses)",
    descriptionTr: "Kayıpsız sıkıştırma; arşiv ve düzenleme için uygun.",
    outputExtension: "flac",
    mode: "transcode",
    allowedInputKinds: VIDEO_AUDIO,
    requiredEncoders: ["flac"],
    requiredDecoders: [],
    hasVideoOut: false
  },
  {
    id: "audio-opus",
    labelTr: "Opus (Ogg)",
    descriptionTr: "Düşük bit hızında verimli ses (libopus).",
    outputExtension: "opus",
    mode: "transcode",
    allowedInputKinds: VIDEO_AUDIO,
    requiredEncoders: ["libopus"],
    requiredDecoders: [],
    hasVideoOut: false
  },
  {
    id: "remux-copy",
    labelTr: "Akışları kopyala (hızlı)",
    descriptionTr: "Yeniden kodlama yok — aynı codec’ler yeni kabukta.",
    outputExtension: "mkv",
    mode: "copy",
    allowedInputKinds: VIDEO_AUDIO,
    requiredEncoders: [],
    requiredDecoders: [],
    hasVideoOut: true
  },
  {
    id: "image-png",
    labelTr: "PNG (görüntü)",
    descriptionTr: "Kayıpsız görüntü çıktısı.",
    outputExtension: "png",
    mode: "transcode",
    allowedInputKinds: ["image-only"],
    requiredEncoders: ["png"],
    requiredDecoders: [],
    hasVideoOut: true
  },
  {
    id: "image-jpeg",
    labelTr: "JPEG (görüntü)",
    descriptionTr: "Kayıplı sıkıştırma; fotoğraf paylaşımı için uygun.",
    outputExtension: "jpg",
    mode: "transcode",
    allowedInputKinds: ["image-only"],
    requiredEncoders: ["mjpeg"],
    requiredDecoders: [],
    hasVideoOut: true
  },
  {
    id: "image-webp",
    labelTr: "WebP (görüntü)",
    descriptionTr: "Web için sıkıştırılmış görüntü (libwebp).",
    outputExtension: "webp",
    mode: "transcode",
    allowedInputKinds: ["image-only"],
    requiredEncoders: ["libwebp"],
    requiredDecoders: [],
    hasVideoOut: true
  },
  {
    id: "image-avif",
    labelTr: "AVIF (görüntü)",
    descriptionTr: "Modern web formatı; AV1 tabanlı yüksek sıkıştırma (libsvtav1).",
    outputExtension: "avif",
    mode: "transcode",
    allowedInputKinds: ["image-only"],
    requiredEncoders: ["libsvtav1"],
    requiredDecoders: [],
    hasVideoOut: true
  },

  // ── WhatsApp Business ─────────────────────────────────────────────────────
  {
    id: "social-wp-video",
    labelTr: "Video (1280×720, maks. 16 MB)",
    descriptionTr: "WhatsApp Business: MP4 H.264, 1280×720, maks. 16 MB.",
    outputExtension: "mp4",
    mode: "transcode",
    allowedInputKinds: ["video"],
    requiredEncoders: ["libx264", "aac"],
    requiredDecoders: [],
    hasVideoOut: true,
    socialMeta: {
      platform: "whatsapp",
      platformLabelTr: "WhatsApp Business",
      maxFileSizeMb: 16,
      forcedWidth: 1280,
      forcedHeight: 720,
      infoTr: "MP4 H.264 + AAC · 1280×720 · Maks. 16 MB"
    }
  },
  {
    id: "social-wp-image",
    labelTr: "Görüntü (JPEG, maks. 5 MB)",
    descriptionTr: "WhatsApp Business: JPEG, maks. 5 MB.",
    outputExtension: "jpg",
    mode: "transcode",
    allowedInputKinds: ["image-only"],
    requiredEncoders: ["mjpeg"],
    requiredDecoders: [],
    hasVideoOut: true,
    socialMeta: {
      platform: "whatsapp",
      platformLabelTr: "WhatsApp Business",
      maxFileSizeMb: 5,
      infoTr: "JPEG · Maks. 5 MB"
    }
  },
  {
    id: "social-wp-audio",
    labelTr: "Ses (AAC/M4A, maks. 16 MB)",
    descriptionTr: "WhatsApp Business: AAC ses, maks. 16 MB.",
    outputExtension: "m4a",
    mode: "transcode",
    allowedInputKinds: ["video", "audio"],
    requiredEncoders: ["aac"],
    requiredDecoders: [],
    hasVideoOut: false,
    socialMeta: {
      platform: "whatsapp",
      platformLabelTr: "WhatsApp Business",
      maxFileSizeMb: 16,
      infoTr: "AAC · M4A · Maks. 16 MB"
    }
  },

  // ── Instagram Business ────────────────────────────────────────────────────
  {
    id: "social-ig-feed",
    labelTr: "Feed Videosu (1080×1080, maks. 100 MB)",
    descriptionTr: "Instagram Business feed: kare format, MP4 H.264.",
    outputExtension: "mp4",
    mode: "transcode",
    allowedInputKinds: ["video"],
    requiredEncoders: ["libx264", "aac"],
    requiredDecoders: [],
    hasVideoOut: true,
    socialMeta: {
      platform: "instagram",
      platformLabelTr: "Instagram Business",
      maxFileSizeMb: 100,
      forcedWidth: 1080,
      forcedHeight: 1080,
      infoTr: "MP4 H.264 + AAC · 1080×1080 (kare) · Maks. 100 MB"
    }
  },
  {
    id: "social-ig-stories",
    labelTr: "Reels / Stories (1080×1920, maks. 100 MB)",
    descriptionTr: "Instagram Reels ve Stories: dikey format, MP4 H.264.",
    outputExtension: "mp4",
    mode: "transcode",
    allowedInputKinds: ["video"],
    requiredEncoders: ["libx264", "aac"],
    requiredDecoders: [],
    hasVideoOut: true,
    socialMeta: {
      platform: "instagram",
      platformLabelTr: "Instagram Business",
      maxFileSizeMb: 100,
      forcedWidth: 1080,
      forcedHeight: 1920,
      infoTr: "MP4 H.264 + AAC · 1080×1920 (dikey 9:16) · Maks. 100 MB"
    }
  },
  {
    id: "social-ig-image",
    labelTr: "Görüntü (1080×1080, maks. 8 MB)",
    descriptionTr: "Instagram Business: kare JPEG, maks. 8 MB.",
    outputExtension: "jpg",
    mode: "transcode",
    allowedInputKinds: ["image-only"],
    requiredEncoders: ["mjpeg"],
    requiredDecoders: [],
    hasVideoOut: true,
    socialMeta: {
      platform: "instagram",
      platformLabelTr: "Instagram Business",
      maxFileSizeMb: 8,
      forcedWidth: 1080,
      forcedHeight: 1080,
      infoTr: "JPEG · 1080×1080 (kare) · Maks. 8 MB"
    }
  },

  // ── Messenger Business ────────────────────────────────────────────────────
  {
    id: "social-msg-video",
    labelTr: "Video (1280×720, maks. 25 MB)",
    descriptionTr: "Messenger Business: MP4 H.264, maks. 25 MB.",
    outputExtension: "mp4",
    mode: "transcode",
    allowedInputKinds: ["video"],
    requiredEncoders: ["libx264", "aac"],
    requiredDecoders: [],
    hasVideoOut: true,
    socialMeta: {
      platform: "messenger",
      platformLabelTr: "Messenger Business",
      maxFileSizeMb: 25,
      forcedWidth: 1280,
      forcedHeight: 720,
      infoTr: "MP4 H.264 + AAC · 1280×720 · Maks. 25 MB"
    }
  },
  {
    id: "social-msg-image",
    labelTr: "Görüntü (JPEG, maks. 25 MB)",
    descriptionTr: "Messenger Business: JPEG, maks. 25 MB.",
    outputExtension: "jpg",
    mode: "transcode",
    allowedInputKinds: ["image-only"],
    requiredEncoders: ["mjpeg"],
    requiredDecoders: [],
    hasVideoOut: true,
    socialMeta: {
      platform: "messenger",
      platformLabelTr: "Messenger Business",
      maxFileSizeMb: 25,
      infoTr: "JPEG · Maks. 25 MB"
    }
  },

  // ── Telegram Business ─────────────────────────────────────────────────────
  {
    id: "social-tg-video",
    labelTr: "Video (1280×720, maks. 2 GB)",
    descriptionTr: "Telegram Business: MP4 H.264, maks. 2 GB.",
    outputExtension: "mp4",
    mode: "transcode",
    allowedInputKinds: ["video"],
    requiredEncoders: ["libx264", "aac"],
    requiredDecoders: [],
    hasVideoOut: true,
    socialMeta: {
      platform: "telegram",
      platformLabelTr: "Telegram Business",
      maxFileSizeMb: 2000,
      forcedWidth: 1280,
      forcedHeight: 720,
      infoTr: "MP4 H.264 + AAC · 1280×720 · Maks. 2 GB"
    }
  },
  {
    id: "social-tg-image",
    labelTr: "Görüntü (JPEG, maks. 10 MB)",
    descriptionTr: "Telegram Business: fotoğraf olarak gönderim, JPEG, maks. 10 MB.",
    outputExtension: "jpg",
    mode: "transcode",
    allowedInputKinds: ["image-only"],
    requiredEncoders: ["mjpeg"],
    requiredDecoders: [],
    hasVideoOut: true,
    socialMeta: {
      platform: "telegram",
      platformLabelTr: "Telegram Business",
      maxFileSizeMb: 10,
      infoTr: "JPEG (fotoğraf modu) · Maks. 10 MB"
    }
  },
  {
    id: "social-tg-audio",
    labelTr: "Ses (MP3, maks. 2 GB)",
    descriptionTr: "Telegram Business: MP3 ses dosyası, maks. 2 GB.",
    outputExtension: "mp3",
    mode: "transcode",
    allowedInputKinds: ["video", "audio"],
    requiredEncoders: ["libmp3lame"],
    requiredDecoders: [],
    hasVideoOut: false,
    socialMeta: {
      platform: "telegram",
      platformLabelTr: "Telegram Business",
      maxFileSizeMb: 2000,
      infoTr: "MP3 · Maks. 2 GB"
    }
  },

  // ── YouTube ───────────────────────────────────────────────────────────────
  {
    id: "social-yt-1080",
    labelTr: "1080p HD (1920×1080, H.264)",
    descriptionTr: "YouTube: 1080p HD, MP4 H.264 + AAC, 16:9.",
    outputExtension: "mp4",
    mode: "transcode",
    allowedInputKinds: ["video"],
    requiredEncoders: ["libx264", "aac"],
    requiredDecoders: [],
    hasVideoOut: true,
    socialMeta: {
      platform: "youtube",
      platformLabelTr: "YouTube",
      maxFileSizeMb: 128000,
      forcedWidth: 1920,
      forcedHeight: 1080,
      infoTr: "MP4 H.264 + AAC · 1920×1080 (16:9) · Maks. 128 GB"
    }
  },
  {
    id: "social-yt-4k",
    labelTr: "4K UHD (3840×2160, H.264)",
    descriptionTr: "YouTube: 4K UHD, MP4 H.264 + AAC, 16:9.",
    outputExtension: "mp4",
    mode: "transcode",
    allowedInputKinds: ["video"],
    requiredEncoders: ["libx264", "aac"],
    requiredDecoders: [],
    hasVideoOut: true,
    socialMeta: {
      platform: "youtube",
      platformLabelTr: "YouTube",
      maxFileSizeMb: 128000,
      forcedWidth: 3840,
      forcedHeight: 2160,
      infoTr: "MP4 H.264 + AAC · 3840×2160 (4K) · Maks. 128 GB"
    }
  },

  // ── TikTok ────────────────────────────────────────────────────────────────
  {
    id: "social-tt-video",
    labelTr: "Video (1080×1920, 9:16 dikey)",
    descriptionTr: "TikTok: dikey format, MP4 H.264 + AAC, maks. 287 MB.",
    outputExtension: "mp4",
    mode: "transcode",
    allowedInputKinds: ["video"],
    requiredEncoders: ["libx264", "aac"],
    requiredDecoders: [],
    hasVideoOut: true,
    socialMeta: {
      platform: "tiktok",
      platformLabelTr: "TikTok",
      maxFileSizeMb: 287,
      forcedWidth: 1080,
      forcedHeight: 1920,
      infoTr: "MP4 H.264 + AAC · 1080×1920 (9:16 dikey) · Maks. 287 MB"
    }
  },

  // ── LinkedIn ──────────────────────────────────────────────────────────────
  {
    id: "social-li-video",
    labelTr: "Video (1920×1080, 16:9, maks. 5 GB)",
    descriptionTr: "LinkedIn: yatay format, MP4 H.264 + AAC.",
    outputExtension: "mp4",
    mode: "transcode",
    allowedInputKinds: ["video"],
    requiredEncoders: ["libx264", "aac"],
    requiredDecoders: [],
    hasVideoOut: true,
    socialMeta: {
      platform: "linkedin",
      platformLabelTr: "LinkedIn",
      maxFileSizeMb: 5000,
      forcedWidth: 1920,
      forcedHeight: 1080,
      infoTr: "MP4 H.264 + AAC · 1920×1080 (16:9) · Maks. 5 GB"
    }
  },

  // ── X (Twitter) ───────────────────────────────────────────────────────────
  {
    id: "social-x-video",
    labelTr: "Video (1920×1080, maks. 512 MB)",
    descriptionTr: "X (Twitter): MP4 H.264 + AAC, maks. 512 MB, maks. 140 sn.",
    outputExtension: "mp4",
    mode: "transcode",
    allowedInputKinds: ["video"],
    requiredEncoders: ["libx264", "aac"],
    requiredDecoders: [],
    hasVideoOut: true,
    socialMeta: {
      platform: "x",
      platformLabelTr: "X (Twitter)",
      maxFileSizeMb: 512,
      forcedWidth: 1920,
      forcedHeight: 1080,
      infoTr: "MP4 H.264 + AAC · 1920×1080 · Maks. 512 MB · Maks. 140 sn"
    }
  },

  // ── Discord ───────────────────────────────────────────────────────────────
  {
    id: "social-dc-video",
    labelTr: "Video (1920×1080, maks. 10 MB)",
    descriptionTr: "Discord: Nitro olmadan maks. 10 MB, MP4 H.264 + AAC.",
    outputExtension: "mp4",
    mode: "transcode",
    allowedInputKinds: ["video"],
    requiredEncoders: ["libx264", "aac"],
    requiredDecoders: [],
    hasVideoOut: true,
    socialMeta: {
      platform: "discord",
      platformLabelTr: "Discord",
      maxFileSizeMb: 10,
      forcedWidth: 1920,
      forcedHeight: 1080,
      infoTr: "MP4 H.264 + AAC · 1920×1080 · Maks. 10 MB (Nitro'suz)"
    }
  }
];

export function getTargetById(id: TargetProfileId): TargetProfile | undefined {
  return TARGET_PROFILES.find((p) => p.id === id);
}

export function filterTargetsByEncoders(
  profiles: TargetProfile[],
  availableEncoders: ReadonlySet<string>
): { profile: TargetProfile; ok: boolean; missing: string[] }[] {
  return profiles.map((profile) => {
    if (profile.mode === "copy") {
      return { profile, ok: true, missing: [] };
    }
    const missing = profile.requiredEncoders.filter((e) => !availableEncoders.has(e));
    return { profile, ok: missing.length === 0, missing };
  });
}
