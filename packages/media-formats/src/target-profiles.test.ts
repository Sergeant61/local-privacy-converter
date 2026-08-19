import { describe, expect, it } from "vitest";
import { TARGET_PROFILES } from "./target-profiles";

/** Katalog etiketleri i18n JSON'unda değil burada duruyor (ISTEMCI-TEST-RAPORU.md
 * H-03). Bu yüzden iki dilin eksiksizliğini derleyici değil test koruyor. */
describe("hedef profil çevirileri", () => {
  const TURKISH = /[çğıöşüÇĞİÖŞÜ]/;

  it.each(TARGET_PROFILES.map((p) => [p.id, p] as const))(
    "%s hem Türkçe hem İngilizce etiket taşıyor",
    (_id, profile) => {
      expect(profile.labelTr.trim()).not.toBe("");
      expect(profile.labelEn.trim()).not.toBe("");
      expect(profile.descriptionTr.trim()).not.toBe("");
      expect(profile.descriptionEn.trim()).not.toBe("");
    }
  );

  it.each(TARGET_PROFILES.map((p) => [p.id, p] as const))(
    "%s İngilizce alanlarında Türkçe karakter kalmamış",
    (_id, profile) => {
      expect(profile.labelEn).not.toMatch(TURKISH);
      expect(profile.descriptionEn).not.toMatch(TURKISH);
      if (profile.socialMeta) {
        expect(profile.socialMeta.infoEn).not.toMatch(TURKISH);
      }
    }
  );

  it("sosyal presetlerin tamamında infoEn dolu", () => {
    const social = TARGET_PROFILES.filter((p) => p.socialMeta);
    expect(social.length).toBeGreaterThan(0);
    for (const p of social) {
      expect(p.socialMeta!.infoEn.trim()).not.toBe("");
      expect(p.socialMeta!.infoTr.trim()).not.toBe("");
    }
  });
});
