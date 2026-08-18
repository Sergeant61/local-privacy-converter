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
    // zincir crop + çift boyut scale'i + setsar'dır. Kaçırılmamış fazladan bir
    // virgül, crop ifadesinin ortadan bölündüğü anlamına gelir.
    const segments = filter.split(/(?<!\\),/);
    expect(segments).toEqual([expect.stringMatching(/^crop=/), "scale=trunc(iw/2)*2:trunc(ih/2)*2", "setsar=1"]);
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

// ── D-08 ────────────────────────────────────────────────────────────────────
// Her iki boyut da verildiğinde çıplak `scale=W:H` görüntüyü esnetir. Dikey
// sosyal presetler bu yüzden 1080×1920 piksel ölçüsünü tutturup içeriği
// eziyordu: ölçümde `social-ig-stories` → 1080x1920 ama `dar=16:9`.
describe("D-08: iki boyut verildiğinde kareye oturtma", () => {
  const sized = (extra: Partial<NonNullable<ConvertJobSpec["videoHints"]>> = {}) =>
    vf(buildFfmpegArgs({ ...base, videoHints: { width: 1080, height: 1920, ...extra } })) ?? "";

  it("varsayılan olarak doldurur ve kırpar — oranı bozmaz", () => {
    const filter = sized();
    expect(filter).toContain("force_original_aspect_ratio=increase");
    expect(filter).toContain("crop=1080:1920");
    expect(filter).not.toMatch(/scale=1080:1920(,|$)/);
  });

  it("her zaman setsar=1 ekler — SAR bozulunca oynatıcı kareyi yamuk gösterir", () => {
    expect(sized()).toContain("setsar=1");
    expect(sized({ fit: "contain" })).toContain("setsar=1");
    expect(sized({ fit: "stretch" })).toContain("setsar=1");
  });

  it("contain modunda sığdırır ve siyahla doldurur", () => {
    const filter = sized({ fit: "contain" });
    expect(filter).toContain("force_original_aspect_ratio=decrease");
    expect(filter).toContain("pad=1080:1920:(ow-iw)/2:(oh-ih)/2");
  });

  it("stretch açıkça istenirse eski davranışı korur", () => {
    expect(sized({ fit: "stretch" })).toContain("scale=1080:1920");
  });

  it("tek boyutta oranı koruyan -2 kullanmayı sürdürür", () => {
    const only = vf(buildFfmpegArgs({ ...base, videoHints: { width: 640 } })) ?? "";
    expect(only).toContain("scale=640:-2");
    expect(only).not.toContain("crop=");
  });
});

// ── D-13 ────────────────────────────────────────────────────────────────────
// `if (width ?? height)`: sıfır nullish değil ama falsy. Kullanıcı 360p ister,
// orijinal çözünürlükte çıktı alırdı.
describe("D-13: sıfır ve geçersiz ölçüler", () => {
  it("width 0 verildiğinde geçerli height'ı yok saymaz", () => {
    const filter = vf(buildFfmpegArgs({ ...base, videoHints: { width: 0, height: 360 } })) ?? "";
    expect(filter).toContain("scale=-2:360");
  });

  it.each([0, -1, NaN, Infinity])("geçersiz ölçüyü (%p) yok sayar", (bad) => {
    const args = buildFfmpegArgs({ ...base, videoHints: { width: bad, height: bad } });
    expect(vf(args)).toBeUndefined();
  });

  it("fps 0 filtre eklemez", () => {
    expect(vf(buildFfmpegArgs({ ...base, videoHints: { fps: 0 } }))).toBeUndefined();
  });
});

// ── D-14 / D-15 ─────────────────────────────────────────────────────────────
// PNG ve JPEG hedefleri ilk kareyi yazıp ikinci karede exit 234 ile düşüyor ama
// diskte geçerli görünen kısmi dosya bırakıyordu; libwebp aynı girdiyle
// animasyon üretiyordu. AVIF ise libsvtav1 kullandığı için video dalına düşüp
// `-c:a aac` alıyor, `-an` almıyordu.
describe("D-14/D-15: tek kare görüntü çıktısı", () => {
  const still = (outputPath: string, videoEncoder?: ConvertJobSpec["videoEncoder"]) =>
    buildFfmpegArgs({ ...base, outputPath, ...(videoEncoder ? { videoEncoder } : {}) });

  it.each([
    ["/tmp/o.png", "png"],
    ["/tmp/o.jpg", "mjpeg"],
    ["/tmp/o.webp", "libwebp"]
  ] as const)("%s tek kareye sınırlanır", (out, enc) => {
    const args = still(out, enc);
    expect(args).toContain("-frames:v");
    expect(args[args.indexOf("-frames:v") + 1]).toBe("1");
    expect(args).toContain("-an");
  });

  it("AVIF görüntü dalına düşer — encoder libsvtav1 olsa bile", () => {
    const args = still("/tmp/o.avif", "libsvtav1");
    expect(args).toContain("-frames:v");
    expect(args).toContain("-an");
    expect(args).not.toContain("-c:a");
  });

  it.each(["/tmp/o.bmp", "/tmp/o.tiff", "/tmp/o.jpeg"])("%s da görüntü sayılır", (out) => {
    expect(still(out)).toContain("-frames:v");
  });

  it("video çıktısında kare sınırı koymaz", () => {
    const args = buildFfmpegArgs({ ...base, outputPath: "/tmp/o.mp4" });
    expect(args).not.toContain("-frames:v");
    expect(args).toContain("-c:a");
  });
});

// ── D-16 ────────────────────────────────────────────────────────────────────
// İkisi de sözleşmede tanımlı ama hiçbir yerde okunmuyordu.
describe("D-16: copyAllStreams ve container", () => {
  it("copyAllStreams remux'ta tüm akışları eşler", () => {
    const args = buildFfmpegArgs({ ...base, mode: "copy", copyAllStreams: true });
    expect(args).toContain("-map");
    expect(args[args.indexOf("-map") + 1]).toBe("0");
  });

  it("copyAllStreams verilmezse eski davranış korunur", () => {
    expect(buildFfmpegArgs({ ...base, mode: "copy" })).not.toContain("-map");
  });

  it.each(["copy", "transcode"] as const)("%s modunda container'ı -f olarak geçirir", (mode) => {
    const args = buildFfmpegArgs({ ...base, mode, container: "matroska" });
    expect(args).toContain("-f");
    expect(args[args.indexOf("-f") + 1]).toBe("matroska");
    expect(args.at(-1)).toBe(base.outputPath);
  });

  it("yalnız-ses çıktıda da container'a saygı duyar", () => {
    const args = buildFfmpegArgs({ ...base, audioOnlyOutput: true, container: "ipod" });
    expect(args).toContain("-f");
  });
});

// ── D-17 ────────────────────────────────────────────────────────────────────
// capabilities.ts VideoToolbox'ı doğru tespit ediyordu ama `-hwaccel`
// argümanlara hiç yansımıyordu; bitrate de çözünürlükten bağımsız sabitti.
describe("D-17: donanım hızlandırma", () => {
  it.each([
    ["h264_videotoolbox", "videotoolbox"],
    ["hevc_nvenc", "cuda"],
    ["h264_qsv", "qsv"],
    ["hevc_vaapi", "vaapi"]
  ] as const)("%s seçilince çözme tarafını da hızlandırır", (encoder, accel) => {
    const args = buildFfmpegArgs({ ...base, videoEncoder: encoder });
    expect(args).toContain("-hwaccel");
    expect(args[args.indexOf("-hwaccel") + 1]).toBe(accel);
    // `-hwaccel` girdiden önce gelmek zorunda.
    expect(args.indexOf("-hwaccel")).toBeLessThan(args.indexOf("-i"));
  });

  it("yazılım kodlayıcıda hwaccel eklemez", () => {
    expect(buildFfmpegArgs({ ...base, videoEncoder: "libx264" })).not.toContain("-hwaccel");
  });

  it("copy modunda hwaccel eklemez — çözme zaten yok", () => {
    expect(buildFfmpegArgs({ ...base, mode: "copy", videoEncoder: "h264_videotoolbox" })).not.toContain("-hwaccel");
  });

  it("VideoToolbox bitrate'i kare alanına göre ölçeklenir", () => {
    const small = flag(
      buildFfmpegArgs({ ...base, videoEncoder: "h264_videotoolbox", videoHints: { width: 320, height: 240 } }),
      "-b:v"
    );
    const large = flag(
      buildFfmpegArgs({ ...base, videoEncoder: "h264_videotoolbox", videoHints: { width: 3840, height: 2160 } }),
      "-b:v"
    );
    expect(Number(small)).toBeLessThan(Number(large));
    // 320×240 için sabit 5M savurgandı.
    expect(Number(small)).toBeLessThan(5_000_000);
  });

  it("hedef ölçü yoksa kaynak ölçüsünü kullanır", () => {
    const bps = flag(
      buildFfmpegArgs({
        ...base,
        videoEncoder: "h264_videotoolbox",
        videoHints: { sourceWidth: 3840, sourceHeight: 2160 }
      }),
      "-b:v"
    );
    expect(Number(bps)).toBeGreaterThan(5_000_000);
  });

  it("hiçbir ölçü bilinmiyorsa katman varsayılanına düşer", () => {
    expect(
      flag(buildFfmpegArgs({ ...base, videoEncoder: "h264_videotoolbox" }), "-b:v")
    ).toBe("5M");
  });

  it("makul sınırların dışına çıkmaz", () => {
    const tiny = Number(
      flag(buildFfmpegArgs({ ...base, videoEncoder: "h264_videotoolbox", videoHints: { width: 16, height: 16, qualityPreset: "very_small" } }), "-b:v")
    );
    expect(tiny).toBe(300_000);
  });
});
