import type { AudioEncoderChoice, ConvertJobSpec, VideoEncoderChoice } from "@lfc/types";

import { targetProfileToJobHints } from "./job-hints";
import { getTargetById, type TargetProfileId } from "./target-profiles";

/**
 * Hedef profilden `ConvertJobSpec` üretir (DENETIM.md D-10).
 *
 * Sosyal preset meta verisi yalnızca `HomeConverter.svelte` içinde okunuyordu;
 * toplu dönüştürme ve çoklu çıktı ekranları zorunlu çözünürlüğü ve dosya boyutu
 * limitini tamamen yok sayıyordu. Aynı preset, seçildiği ekrana göre farklı
 * çıktı veriyordu. Kural artık tek yerde.
 */

export type QualityPreset = NonNullable<
  NonNullable<ConvertJobSpec["videoHints"]>["qualityPreset"]
>;

export interface ProfileJobSpecOptions {
  inputPath: string;
  outputPath: string;
  /** Sosyal presetlerde yok sayılır: preset kendi kalite seviyesini dayatır. */
  qualityPreset?: QualityPreset;
  /** Kullanıcının el ile verdiği ölçü. Presetin zorunlu ölçüsü bunu ezer. */
  width?: number;
  height?: number;
  fps?: number;
  /** Sosyal presetlerde yok sayılır: zorunlu ölçü + `cover` zaten çerçeveyi kuruyor. */
  aspectRatio?: string;
  /** Kullanıcının el ile verdiği boyut hedefi. Presetin limiti bunu ezer. */
  targetSizeMb?: number;
  /** Arayüzdeki kodlayıcı seçimi; verilmezse profilinki. */
  videoEncoderOverride?: VideoEncoderChoice;
  audioEncoderOverride?: AudioEncoderChoice;
  audioChannels?: 1 | 2;
  extraFfmpegArgs?: string[];
}

/**
 * Uzantısı olmayan çıktı yolu için ffmpeg konteyner adı.
 *
 * Çıktı formatı yalnızca dosya uzantısından çıkarıldığı için uzantısız yolda
 * dönüşüm hata veriyordu (DENETIM.md D-16). Uzantı adı ile ffmpeg'in muxer adı
 * her zaman aynı değil — `mkv` matroska, `m4a` ipod, görüntüler image2.
 */
const CONTAINER_MUXER: Record<string, string> = {
  mp4: "mp4",
  webm: "webm",
  mkv: "matroska",
  mp3: "mp3",
  wav: "wav",
  m4a: "ipod",
  flac: "flac",
  opus: "opus",
  png: "image2",
  jpg: "image2",
  webp: "image2",
  avif: "image2"
};

function hasExtension(outputPath: string): boolean {
  const base = outputPath.split(/[/\\]/).pop() ?? "";
  return base.lastIndexOf(".") > 0;
}

function positive(n: number | undefined): number | undefined {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : undefined;
}

export function buildProfileJobSpec(
  id: TargetProfileId,
  opts: ProfileJobSpecOptions
): ConvertJobSpec {
  const hints = targetProfileToJobHints(id);
  const social = getTargetById(id)?.socialMeta;

  // Presetin zorunlu ölçüsü kullanıcı seçimini ezer — presetin varlık sebebi bu.
  const width = social?.forcedWidth ?? positive(opts.width);
  const height = social?.forcedHeight ?? positive(opts.height);

  // Sosyal presetlerde boyut limiti artık görüntü hedeflerinde de uygulanıyor
  // (DENETIM.md D-09); ana süreç kalite kademesini düşürerek limite iniyor.
  const targetSizeMb = social?.maxFileSizeMb ?? positive(opts.targetSizeMb);

  const videoHints: NonNullable<ConvertJobSpec["videoHints"]> = {
    qualityPreset: social ? "balanced" : (opts.qualityPreset ?? "balanced"),
    ...(width != null ? { width } : {}),
    ...(height != null ? { height } : {}),
    ...(positive(opts.fps) != null ? { fps: opts.fps } : {}),
    ...(targetSizeMb != null ? { targetSizeMb } : {}),
    // Zorunlu ölçü verildiğinde çerçeveye oturtma `cover` ile yapılır; ayrıca
    // en-boy oranı istemek çift kırpma olurdu.
    ...(social == null && opts.aspectRatio ? { aspectRatio: opts.aspectRatio } : {})
  };

  const container = hasExtension(opts.outputPath)
    ? undefined
    : CONTAINER_MUXER[hints.outputContainer];

  return {
    inputPath: opts.inputPath,
    outputPath: opts.outputPath,
    mode: hints.mode,
    audioOnlyOutput: hints.audioOnlyOutput,
    videoEncoder: opts.videoEncoderOverride ?? hints.videoEncoder,
    audioEncoder: opts.audioEncoderOverride ?? hints.audioEncoder,
    videoHints,
    ...(container != null ? { container } : {}),
    ...(opts.audioChannels != null ? { audioChannels: opts.audioChannels } : {}),
    ...(opts.extraFfmpegArgs != null && opts.extraFfmpegArgs.length > 0
      ? { extraFfmpegArgs: opts.extraFfmpegArgs }
      : {})
  };
}
