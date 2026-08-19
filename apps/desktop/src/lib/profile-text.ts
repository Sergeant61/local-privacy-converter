import type { SocialMeta, TargetProfile } from "@lfc/media-formats";

/** Profil metinleri i18n JSON'unda değil, katalogla birlikte `@lfc/media-formats`
 * içinde duruyor: etiketler codec/konteyner adlarıyla iç içe ve katalog değiştikçe
 * ikisinin ayrı dosyalarda senkron tutulması hataya açık. Bu yüzden burada
 * yalnızca dile göre alan seçiliyor. Çağrılarda `$locale` verilmeli ki dil
 * değişince markup yeniden değerlensin. */
function isEn(loc: string | null | undefined): boolean {
  return (loc ?? "tr").toLowerCase().startsWith("en");
}

export function profileLabel(profile: TargetProfile, loc: string | null | undefined): string {
  return isEn(loc) ? profile.labelEn : profile.labelTr;
}

export function profileDescription(
  profile: TargetProfile,
  loc: string | null | undefined
): string {
  return isEn(loc) ? profile.descriptionEn : profile.descriptionTr;
}

export function socialInfo(meta: SocialMeta, loc: string | null | undefined): string {
  return isEn(loc) ? meta.infoEn : meta.infoTr;
}
