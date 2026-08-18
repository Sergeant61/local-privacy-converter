import { describe, expect, it } from "vitest";

import { compareVersions, isNewerVersion, parseVersion } from "./semver";

// ── D-18 ────────────────────────────────────────────────────────────────────
// `hasUpdate = tag !== currentVersion` string eşitsizliğiydi: uzaktaki etiket
// ESKİ olsa bile "güncelleme var" diyordu.
describe("D-18: sürüm karşılaştırması", () => {
  it("eski uzak sürümü güncelleme sanmaz", () => {
    expect(isNewerVersion("1.1.2", "1.1.3")).toBe(false);
    expect(isNewerVersion("1.0.0", "2.0.0")).toBe(false);
    expect(isNewerVersion("1.2.9", "1.3.0")).toBe(false);
  });

  it("aynı sürümde güncelleme yok", () => {
    expect(isNewerVersion("1.1.3", "1.1.3")).toBe(false);
    expect(isNewerVersion("v1.1.3", "1.1.3")).toBe(false);
  });

  it("gerçekten yeni sürümü yakalar", () => {
    expect(isNewerVersion("1.1.4", "1.1.3")).toBe(true);
    expect(isNewerVersion("1.2.0", "1.1.9")).toBe(true);
    expect(isNewerVersion("2.0.0", "1.99.99")).toBe(true);
  });

  it("sayısal karşılaştırma yapar — string sıralaması değil", () => {
    // "1.10.0" < "1.9.0" string olarak; sayısal olarak tersi.
    expect(isNewerVersion("1.10.0", "1.9.0")).toBe(true);
    expect(isNewerVersion("1.9.0", "1.10.0")).toBe(false);
  });

  it("kararlı sürüm ön sürümden yenidir", () => {
    expect(isNewerVersion("1.2.0", "1.2.0-beta.1")).toBe(true);
    expect(isNewerVersion("1.2.0-beta.1", "1.2.0")).toBe(false);
  });

  it("ön sürümleri kendi aralarında sıralar", () => {
    expect(isNewerVersion("1.2.0-beta.2", "1.2.0-beta.1")).toBe(true);
    expect(isNewerVersion("1.2.0-beta", "1.2.0-alpha")).toBe(true);
    expect(isNewerVersion("1.2.0-alpha.10", "1.2.0-alpha.9")).toBe(true);
  });

  it("eksik parçaları sıfır sayar", () => {
    expect(parseVersion("2")).toMatchObject({ major: 2, minor: 0, patch: 0 });
    expect(compareVersions("2", "2.0.0")).toBe(0);
  });

  it("ayrıştırılamayan sürümde güncelleme iddia etmez", () => {
    expect(isNewerVersion("latest", "1.1.3")).toBe(false);
    expect(isNewerVersion(null, "1.1.3")).toBe(false);
    expect(isNewerVersion("1.1.4", undefined)).toBe(false);
    expect(parseVersion("")).toBeNull();
  });
});
