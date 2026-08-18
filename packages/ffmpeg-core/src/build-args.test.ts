import { describe, expect, it } from "vitest";

import type { ConvertJobSpec } from "@lfc/types";

import { buildFfmpegArgs } from "./build-args";
import { buildTrimArgs } from "./trim-args";

/** `-vf` değerini argüman dizisinden çeker. */
function vf(args: string[]): string | undefined {
  const i = args.indexOf("-vf");
  return i === -1 ? undefined : args[i + 1];
}

/** Bir bayrağın değerini çeker. */
function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

const base: ConvertJobSpec = {
  inputPath: "/tmp/in.mp4",
  outputPath: "/tmp/out.mp4",
  mode: "transcode",
  videoEncoder: "libx264",
  audioEncoder: "aac"
};

// ── D-02 ────────────────────────────────────────────────────────────────────
// Filtergraph içinde çıplak virgül filtre ayracıdır. if() ifadesindeki virgüller
// kaçırılmazsa ffmpeg ifadeyi ortadan böler ve "No such filter" ile düşer —
// bu hata /aspect-ratio sayfasını ve ana dönüştürücünün oran seçicisini
// tamamen çalışmaz hâle getirmişti.
describe("D-02: en-boy oranı crop filtresi", () => {
  const ratios = ["16:9", "9:16", "1:1", "4:3"];

  it.each(ratios)("%s oranında crop üretir", (ratio) => {
    const args = buildFfmpegArgs({ ...base, videoHints: { aspectRatio: ratio } });
    expect(vf(args)).toContain("crop=");
  });

  it.each(ratios)("%s oranında if() içindeki virgülleri kaçırır", (ratio) => {
    const filter = vf(buildFfmpegArgs({ ...base, videoHints: { aspectRatio: ratio } })) ?? "";

    // ffmpeg filtreleri KAÇIRILMAMIŞ virgülden böler. Yalnızca oran verildiğinde
    // zincir tam iki segmenttir: crop + çift boyut scale'i. Kaçırılmamış fazladan
    // bir virgül, crop ifadesinin ortadan bölündüğü anlamına gelir.
    const segments = filter.split(/(?<!\\),/);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatch(/^crop=/);
    expect(segments[0]).toContain("\\,");
  });

  it("geçersiz oranı yok sayar", () => {
    for (const bad of ["", "16", "16:0", "a:b", "-1:2"]) {
      const args = buildFfmpegArgs({ ...base, videoHints: { aspectRatio: bad } });
      expect(vf(args) ?? "").not.toContain("crop=");
    }
  });
});

// ── D-03 ────────────────────────────────────────────────────────────────────
// `-ss` girdi tarafında zaman damgalarını sıfırlar, bu yüzden `-to` bitiş değil
// süre anlamına gelir. 3-7 sn isteyen kullanıcı 7 sn'lik çıktı alıyordu.
describe("D-03: trim aralığı", () => {
  const io = { inputPath: "/tmp/in.mp4", outputPath: "/tmp/out.mp4" };

  it("bitiş noktasını süreye çevirir", () => {
    const r = buildTrimArgs({ ...io, startSec: 3, endSec: 7 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(flag(r.args, "-ss")).toBe("3");
    expect(flag(r.args, "-t")).toBe("4");
    expect(r.args).not.toContain("-to");
  });

  it.each([
    [0, 5, 5],
    [2, 10, 8],
    [8, 12, 4],
    [1, 2, 1]
  ])("%is → %is aralığı %i saniye sürer", (start, end, expected) => {
    const r = buildTrimArgs({ ...io, startSec: start, endSec: end });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(flag(r.args, "-t")).toBe(String(expected));
  });

  it("başlangıç 0 ise arama yapmaz", () => {
    const r = buildTrimArgs({ ...io, startSec: 0, endSec: 5 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.args).not.toContain("-ss");
  });

  it("bitiş yoksa süre sınırı koymaz", () => {
    const r = buildTrimArgs({ ...io, startSec: 3, endSec: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.args).not.toContain("-t");
  });

  it.each([
    [5, 5],
    [7, 3]
  ])("geçersiz aralığı reddeder (%i → %i)", (start, end) => {
    const r = buildTrimArgs({ ...io, startSec: start, endSec: end });
    expect(r.ok).toBe(false);
  });

  it("stream-copy varsayılan, kapatılabilir", () => {
    const copy = buildTrimArgs({ ...io, endSec: 5 });
    const enc = buildTrimArgs({ ...io, endSec: 5, streamCopy: false });
    expect(copy.ok && copy.args).toContain("copy");
    expect(enc.ok && enc.args).not.toContain("copy");
  });
});

// ── D-04 ────────────────────────────────────────────────────────────────────
// `-fs` bir bitrate hedefi değil, sert bir yazma durdurucusudur: videoyu sessizce
// kırpar (30 sn → 3 sn, exit 0) ve moov atomu sonradan yazıldığı için dosya yine
// limitin üstünde kalır.
describe("D-04: hedef boyut bitrate bütçesine çevrilir", () => {
  const sized = (mb: number, dur?: number): ConvertJobSpec => ({
    ...base,
    videoHints: {
      qualityPreset: "balanced",
      targetSizeMb: mb,
      ...(dur != null ? { sourceDurationSec: dur } : {})
    }
  });

  it("hiçbir kod yolunda -fs üretmez", () => {
    const specs: ConvertJobSpec[] = [
      sized(10, 30),
      sized(10),
      { ...sized(10, 30), audioOnlyOutput: true },
      { ...sized(10, 30), videoEncoder: "png" },
      { ...sized(10, 30), mode: "copy" }
    ];
    for (const spec of specs) {
      expect(buildFfmpegArgs(spec)).not.toContain("-fs");
    }
  });

  it("bütçeyi süreye bölerek video bitrate'i hesaplar", () => {
    const args = buildFfmpegArgs(sized(10, 30));
    const bps = Number(flag(args, "-b:v"));
    // 10 MB × 0.97 ÷ 30 sn − 160 kbps ses ≈ 2.55 Mbps
    expect(bps).toBeGreaterThan(2_400_000);
    expect(bps).toBeLessThan(2_700_000);
  });

  it("bütçe modunda CRF kullanmaz — ikisi birlikte anlamsızdır", () => {
    const args = buildFfmpegArgs(sized(10, 30));
    expect(args).not.toContain("-crf");
    expect(args).toContain("-b:v");
  });

  it("boyut hedefi yokken CRF modunu korur", () => {
    const args = buildFfmpegArgs({ ...base, videoHints: { qualityPreset: "balanced" } });
    expect(args).toContain("-crf");
    expect(args).not.toContain("-b:v");
  });

  it("süre bilinmiyorsa kısıt uygulamaz — kırpmaktansa sınırı aşmak yeğdir", () => {
    const args = buildFfmpegArgs(sized(10));
    expect(args).not.toContain("-b:v");
    expect(args).not.toContain("-fs");
    expect(args).toContain("-crf");
  });

  it("bütçe büyüdükçe bitrate artar", () => {
    const small = Number(flag(buildFfmpegArgs(sized(10, 30)), "-b:v"));
    const large = Number(flag(buildFfmpegArgs(sized(25, 30)), "-b:v"));
    expect(large).toBeGreaterThan(small);
  });

  it("aşırı küçük bütçede izlenebilir bir tabanda durur", () => {
    const bps = Number(flag(buildFfmpegArgs(sized(0.01, 600)), "-b:v"));
    expect(bps).toBe(100_000);
  });

  it("yalnız-ses çıktıda ses bitrate'ini bütçeye göre sınırlar", () => {
    const args = buildFfmpegArgs({ ...sized(1, 300), audioOnlyOutput: true });
    const bps = Number(flag(args, "-b:a"));
    expect(bps).toBeLessThan(160_000);
    expect(bps).toBeGreaterThanOrEqual(32_000);
  });

  it("yalnız-ses çıktıda bütçe bolsa kalite ön ayarını aşmaz", () => {
    const args = buildFfmpegArgs({ ...sized(500, 30), audioOnlyOutput: true });
    expect(Number(flag(args, "-b:a"))).toBe(160_000);
  });

  it("görüntü çıktısında boyut kısıtı uygulamaz", () => {
    const args = buildFfmpegArgs({ ...sized(10, 30), videoEncoder: "png" });
    expect(args).not.toContain("-b:v");
    expect(args).not.toContain("-fs");
  });

  it("VideoToolbox'a -maxrate/-bufsize göndermez", () => {
    const args = buildFfmpegArgs({ ...sized(10, 30), videoEncoder: "h264_videotoolbox" });
    expect(args).toContain("-b:v");
    expect(args).not.toContain("-maxrate");
  });
});

// ── genel şekil ─────────────────────────────────────────────────────────────
describe("argüman dizisi şekli", () => {
  it("çıktı yolunu her zaman son argüman olarak koyar", () => {
    const specs: ConvertJobSpec[] = [
      base,
      { ...base, mode: "copy" },
      { ...base, audioOnlyOutput: true },
      { ...base, videoEncoder: "png" }
    ];
    for (const spec of specs) {
      expect(buildFfmpegArgs(spec).at(-1)).toBe(spec.outputPath);
    }
  });

  it("extra argümanları çıktı yolundan hemen önce ekler", () => {
    const args = buildFfmpegArgs({ ...base, extraFfmpegArgs: ["-tune", "film"] });
    expect(args.at(-3)).toBe("-tune");
    expect(args.at(-2)).toBe("film");
  });

  it("boş extra argümanları eler", () => {
    const args = buildFfmpegArgs({ ...base, extraFfmpegArgs: ["", "   "] });
    expect(args.at(-2)).not.toBe("");
  });

  it("kullanıcı girdisini ayrı argüman olarak tutar — kabuk enjeksiyonu yüzeyi yok", () => {
    const nasty = '/tmp/a b; touch PWNED.mp4';
    const args = buildFfmpegArgs({ ...base, outputPath: nasty });
    expect(args.at(-1)).toBe(nasty);
    expect(args.filter((a) => a.includes("PWNED"))).toHaveLength(1);
  });
});
