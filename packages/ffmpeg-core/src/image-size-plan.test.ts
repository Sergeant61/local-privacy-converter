import { describe, expect, it } from "vitest";

import type { ConvertJobSpec } from "@lfc/types";

import { applyImageSizeAttempt, planImageSizeAttempts, targetSizeBytes } from "./image-size-plan";

// ── D-09 ────────────────────────────────────────────────────────────────────
// mjpeg/png/libwebp boyut kısıtından tümüyle muaftı; platform limitleri yalnızca
// arayüzde metindi. Tek karede süre olmadığı için bitrate bütçesi kurulamaz —
// ölç ve daralt gerekiyor.
describe("D-09: görüntü boyut planı", () => {
  it("ilk deneme her zaman istenen ayardır — limit sağlanıyorsa hiçbir şey feda edilmez", () => {
    const [first] = planImageSizeAttempts({ qualityPreset: "high", width: 4000, height: 3000 });
    expect(first).toEqual({ qualityPreset: "high" });
  });

  it("başlangıç kademesinden aşağı iner, yukarı çıkmaz", () => {
    const tiers = planImageSizeAttempts({ qualityPreset: "balanced" }).map((a) => a.qualityPreset);
    expect(tiers).toEqual(["balanced", "small", "very_small"]);
  });

  it("kalite tükendiğinde kareyi küçültür", () => {
    const attempts = planImageSizeAttempts({ qualityPreset: "very_small", width: 4000, height: 3000 });
    const scaled = attempts.filter((a) => a.width != null);
    expect(scaled).toHaveLength(3);
    expect(scaled.map((a) => a.width)).toEqual([3000, 2000, 1400]);
    // Küçültme sırasında en agresif kalite korunur.
    expect(scaled.every((a) => a.qualityPreset === "very_small")).toBe(true);
  });

  it("her adım bir öncekinden küçüktür", () => {
    const widths = planImageSizeAttempts({ width: 1920, height: 1080 })
      .filter((a) => a.width != null)
      .map((a) => a.width!);
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]!).toBeLessThan(widths[i - 1]!);
    }
  });

  it("ölçü bilinmiyorsa yalnızca kalite kademelerini dener", () => {
    const attempts = planImageSizeAttempts({ qualityPreset: "high" });
    expect(attempts.every((a) => a.width === undefined)).toBe(true);
    expect(attempts).toHaveLength(5);
  });

  it("küçültme çift boyut üretir — tek boyutu kodlayıcılar kabul etmez", () => {
    const attempts = planImageSizeAttempts({ width: 1001, height: 667 });
    for (const a of attempts.filter((x) => x.width != null)) {
      expect(a.width! % 2).toBe(0);
      expect(a.height! % 2).toBe(0);
    }
  });

  it("aşırı küçülmeyi engeller", () => {
    const attempts = planImageSizeAttempts({ width: 20, height: 20 });
    for (const a of attempts.filter((x) => x.width != null)) {
      expect(a.width!).toBeGreaterThanOrEqual(16);
    }
  });

  it("denemeyi spec'e uygular, diğer ipuçlarını korur", () => {
    const spec: ConvertJobSpec = {
      inputPath: "/a.png",
      outputPath: "/b.jpg",
      mode: "transcode",
      videoEncoder: "mjpeg",
      videoHints: { qualityPreset: "high", targetSizeMb: 5, aspectRatio: "1:1" }
    };
    const next = applyImageSizeAttempt(spec, { qualityPreset: "small", width: 800, height: 600 });
    expect(next.videoHints).toMatchObject({
      qualityPreset: "small",
      width: 800,
      height: 600,
      targetSizeMb: 5,
      aspectRatio: "1:1"
    });
  });

  it("MB'yi bayta çevirir, geçersizde null döner", () => {
    const spec = (mb?: number): ConvertJobSpec => ({
      inputPath: "/a",
      outputPath: "/b.jpg",
      mode: "transcode",
      ...(mb != null ? { videoHints: { targetSizeMb: mb } } : {})
    });
    expect(targetSizeBytes(spec(5))).toBe(5 * 1024 * 1024);
    expect(targetSizeBytes(spec())).toBeNull();
    expect(targetSizeBytes(spec(0))).toBeNull();
  });
});
