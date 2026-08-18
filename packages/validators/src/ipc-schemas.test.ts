import { describe, expect, it } from "vitest";

import {
  ipcAudioNormalizeRequestSchema,
  ipcFrameExtractRequestSchema,
  ipcGifConvertRequestSchema,
  ipcMetadataWriteRequestSchema,
  ipcPdfConvertRequestSchema,
  ipcSettingsSetRequestSchema,
  ipcVideoTrimRequestSchema,
  ipcWatermarkRequestSchema,
  checkInputPath,
  checkOutputPath,
  checkInputPaths
} from "./index";

const io = { inputPath: "/tmp/in.mp4", outputPath: "/tmp/out.mp4" };

// ── D-01 ────────────────────────────────────────────────────────────────────
// Renderer eskiden `ffmpegExecutable` alanını doğrudan gönderebiliyor ve bu
// yol hiçbir kontrolden geçmeden spawn ediliyordu. Şema artık yol taşıyan her
// alanı reddediyor; yol üretebilen tek yer ana süreçteki dosya diyaloğu.
describe("D-01: ayar yazma paketi yol taşıyamaz", () => {
  it.each([
    { ffmpegBinary: "/tmp/evil.sh" },
    { outputDir: "/tmp/evil" },
    { ffmpegExecutable: "/tmp/evil.sh" },
    { ffprobeExecutable: "/tmp/evil.sh" }
  ])("ham yol içeren paketi reddeder: %o", (patch) => {
    expect(ipcSettingsSetRequestSchema.safeParse(patch).success).toBe(false);
  });

  it("yalnızca niyet bayraklarını kabul eder", () => {
    for (const patch of [
      { pickFfmpegBinary: true },
      { clearFfmpegBinary: true },
      { pickOutputDir: true },
      { clearOutputDir: true },
      { defaultQuality: "small" as const }
    ]) {
      expect(ipcSettingsSetRequestSchema.safeParse(patch).success).toBe(true);
    }
  });

  it("bilinmeyen alanı sessizce yutmaz", () => {
    expect(ipcSettingsSetRequestSchema.safeParse({ nope: 1 }).success).toBe(false);
  });
});

// ── D-07: enum daraltma ─────────────────────────────────────────────────────
// Bu alanlar doğrudan ffmpeg argümanına ya da filtergraph'a yapıştırılıyor.
// `-${format}` tek başına pdftoppm'e rastgele bayrak geçirmeye yetiyordu.
describe("D-07: serbest string alanlar enum'a indirildi", () => {
  it("PDF format'ı bayrak enjeksiyonuna kapalı", () => {
    expect(ipcPdfConvertRequestSchema.safeParse({ inputPath: "/tmp/a.pdf", format: "png" }).success).toBe(true);
    for (const bad of ["r 9999", "-o /tmp/pwn", "png -f", "", "svg"]) {
      expect(ipcPdfConvertRequestSchema.safeParse({ inputPath: "/tmp/a.pdf", format: bad }).success).toBe(false);
    }
  });

  it("kare çıkarma format'ı dosya uzantısına indirgenmiş", () => {
    for (const bad of ["png;rm -rf /", "../../x", "webp"]) {
      expect(
        ipcFrameExtractRequestSchema.safeParse({ inputPath: "/a", outputDir: "/b", format: bad }).success
      ).toBe(false);
    }
  });

  it("filigran konumu ve rengi enum/desen", () => {
    const base = { ...io, mode: "text" as const };
    expect(ipcWatermarkRequestSchema.safeParse({ ...base, position: "topleft" }).success).toBe(true);
    expect(ipcWatermarkRequestSchema.safeParse({ ...base, fontColor: "#ff00ff" }).success).toBe(true);
    for (const bad of ["nowhere", "10:10", "x=0"]) {
      expect(ipcWatermarkRequestSchema.safeParse({ ...base, position: bad }).success).toBe(false);
    }
    for (const bad of ["white@1:box=1", "red'", "#zzz"]) {
      expect(ipcWatermarkRequestSchema.safeParse({ ...base, fontColor: bad }).success).toBe(false);
    }
  });

  it("görsel filigran imagePath olmadan geçmez", () => {
    expect(ipcWatermarkRequestSchema.safeParse({ ...io, mode: "image" }).success).toBe(false);
    expect(ipcWatermarkRequestSchema.safeParse({ ...io, mode: "image", imagePath: "/tmp/wm.png" }).success).toBe(true);
  });

  it("metadata etiket adları ffmpeg'in kabul ettiği sadeliğe indirgenmiş", () => {
    expect(ipcMetadataWriteRequestSchema.safeParse({ ...io, tags: { title: "x" } }).success).toBe(true);
    for (const bad of ["ti tle", "a=b", "a\nb", ""]) {
      expect(ipcMetadataWriteRequestSchema.safeParse({ ...io, tags: { [bad]: "x" } }).success).toBe(false);
    }
  });
});

// ── D-07: sayısal sınırlar ──────────────────────────────────────────────────
// Eskiden `typeof x === "number"` tek kontroldü; NaN ve Infinity de sayıdır ve
// filtre dizesine "NaN" olarak yazılıp işi düşürüyordu.
describe("D-07: sayısal alanlar sonlu ve aralıklı", () => {
  it.each([NaN, Infinity, -Infinity])("GIF fps'i %p kabul etmez", (v) => {
    expect(ipcGifConvertRequestSchema.safeParse({ ...io, fps: v }).success).toBe(false);
  });

  it("GIF fps/width aralık dışını reddeder", () => {
    expect(ipcGifConvertRequestSchema.safeParse({ ...io, fps: 0 }).success).toBe(false);
    expect(ipcGifConvertRequestSchema.safeParse({ ...io, fps: 1000 }).success).toBe(false);
    expect(ipcGifConvertRequestSchema.safeParse({ ...io, width: 4 }).success).toBe(false);
  });

  it("loudnorm parametreleri ffmpeg'in kabul ettiği aralıkta", () => {
    expect(ipcAudioNormalizeRequestSchema.safeParse({ ...io, targetLufs: -14 }).success).toBe(true);
    expect(ipcAudioNormalizeRequestSchema.safeParse({ ...io, targetLufs: -200 }).success).toBe(false);
    expect(ipcAudioNormalizeRequestSchema.safeParse({ ...io, truePeak: 5 }).success).toBe(false);
    expect(ipcAudioNormalizeRequestSchema.safeParse({ ...io, lra: 0 }).success).toBe(false);
  });

  it("varsayılanlar korunuyor — arayüz alan göndermeyebilir", () => {
    const r = ipcGifConvertRequestSchema.safeParse(io);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toMatchObject({ fps: 10, width: 480, loop: 0 });
  });

  it("kırpma endSec null'ı korur", () => {
    const r = ipcVideoTrimRequestSchema.safeParse({ ...io, endSec: null });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.endSec).toBeNull();
    expect(r.data.streamCopy).toBe(true);
  });
});

// ── D-07: yol koruması ──────────────────────────────────────────────────────
describe("D-07: yol koruması", () => {
  it("göreli yolu ve dizin geçişini reddeder", () => {
    for (const bad of ["relative/path.mp4", "", "   ", "./x.mp4"]) {
      expect(checkInputPath(bad).ok).toBe(false);
    }
  });

  it("NUL baytını reddeder", () => {
    expect(checkInputPath("/tmp/a\0.mp4").ok).toBe(false);
  });

  it("geçiş içeren mutlak yolu normalize eder", () => {
    const r = checkInputPath("/tmp/sub/../a.mp4");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.path).toBe("/tmp/a.mp4");
  });

  it("sıradan kullanıcı yollarına yazmaya izin verir", () => {
    for (const good of ["/Users/x/Movies/out.mp4", "/Volumes/Disk/out.mp4", "/tmp/out.mp4"]) {
      expect(checkOutputPath(good).ok).toBe(true);
    }
  });

  it.each(["/System/x", "/usr/local/bin/ffmpeg", "/etc/hosts", "/Applications/Foo.app/x"])(
    "korumalı sistem dizinine yazmayı engeller: %s",
    (bad) => {
      expect(checkOutputPath(bad).ok).toBe(false);
    }
  );

  it("geçişle sistem dizinine ulaşmayı da engeller", () => {
    expect(checkOutputPath("/tmp/../etc/hosts").ok).toBe(false);
  });

  it("çoklu girdide ilk hata kazanır", () => {
    const r = checkInputPaths(["/tmp/a.mp4", "relative.mp4"]);
    expect(r.ok).toBe(false);
  });
});
