import type { ConvertJobSpec } from "@lfc/types";

/**
 * Görüntü çıktısında dosya boyutu limitine inme planı (DENETIM.md D-09).
 *
 * Video/ses tarafında boyut hedefi bitrate bütçesine çevrilebiliyor: süre
 * biliniyor, bit/saniye hesabı doğrudan. Tek karede süre yok — çıktı boyutu
 * yalnızca kalite ve piksel sayısının fonksiyonu ve ikisi de kodlayıcıya göre
 * doğrusal değil. Bu yüzden tek hesap yerine **ölç ve daralt**: kalite kademesi
 * sırayla düşürülür, tükenirse kare küçültülür.
 *
 * Eskiden `mjpeg`/`png`/`libwebp` boyut kısıtından tümüyle muaftı; WhatsApp
 * 5 MB, Instagram 8 MB, Telegram 10 MB alanları yalnızca arayüzde metindi.
 */

export type QualityTier = NonNullable<
  NonNullable<ConvertJobSpec["videoHints"]>["qualityPreset"]
>;

/** En iyiden en agresife kalite kademeleri. */
const TIERS: readonly QualityTier[] = ["high", "compatible", "balanced", "small", "very_small"];

/** Kalite tükendiğinde uygulanan kare küçültme çarpanları. */
const SCALE_STEPS: readonly number[] = [0.75, 0.5, 0.35];

export interface ImageSizeAttempt {
  qualityPreset: QualityTier;
  /** Hedef genişlik; kaynak ölçüsü bilinmiyorsa undefined (küçültme atlanır). */
  width?: number;
  height?: number;
}

export interface ImageSizePlanInput {
  /** Kullanıcının/presetin istediği başlangıç kalitesi. */
  qualityPreset?: QualityTier;
  /** Bilinen hedef ya da kaynak ölçüsü; yoksa yalnızca kalite kademeleri denenir. */
  width?: number;
  height?: number;
}

function even(n: number): number {
  const v = Math.round(n);
  return v % 2 === 0 ? v : v + 1;
}

/**
 * Denenecek ayarları sırayla üretir: önce başlangıç kalitesinden aşağı, sonra
 * en agresif kalitede kareyi küçülterek. İlk eleman her zaman istenen ayardır —
 * yani limit zaten sağlanıyorsa hiçbir şey feda edilmez.
 */
export function planImageSizeAttempts(input: ImageSizePlanInput): ImageSizeAttempt[] {
  const start = TIERS.indexOf(input.qualityPreset ?? "balanced");
  const tiers = TIERS.slice(start === -1 ? 2 : start);

  const attempts: ImageSizeAttempt[] = tiers.map((qualityPreset) => ({ qualityPreset }));

  const w = input.width;
  const h = input.height;
  if (typeof w === "number" && w > 0) {
    const last = tiers[tiers.length - 1] ?? "very_small";
    for (const factor of SCALE_STEPS) {
      attempts.push({
        qualityPreset: last,
        width: Math.max(16, even(w * factor)),
        ...(typeof h === "number" && h > 0 ? { height: Math.max(16, even(h * factor)) } : {})
      });
    }
  }

  return attempts;
}

/** Bir denemeyi spec'e uygular. Ölçü verilmemişse mevcut ölçü korunur. */
export function applyImageSizeAttempt(
  spec: ConvertJobSpec,
  attempt: ImageSizeAttempt
): ConvertJobSpec {
  return {
    ...spec,
    videoHints: {
      ...spec.videoHints,
      qualityPreset: attempt.qualityPreset,
      ...(attempt.width != null ? { width: attempt.width } : {}),
      ...(attempt.height != null ? { height: attempt.height } : {})
    }
  };
}

/** `targetSizeMb` bayta çevrilir; verilmemişse null. */
export function targetSizeBytes(spec: ConvertJobSpec): number | null {
  const mb = spec.videoHints?.targetSizeMb;
  if (mb == null || !Number.isFinite(mb) || mb <= 0) return null;
  return Math.floor(mb * 1024 * 1024);
}
