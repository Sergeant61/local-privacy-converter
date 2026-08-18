import { describe, expect, it } from "vitest";

import { parseExtraFfmpegArgs } from "./extra-args";
import { buildProfileJobSpec } from "./job-spec";

// ── D-10 ────────────────────────────────────────────────────────────────────
// Sosyal preset meta verisi yalnızca HomeConverter'da okunuyordu; toplu
// dönüştürme ve çoklu çıktı ekranları zorunlu çözünürlüğü ve boyut limitini
// tamamen yok sayıyordu — aynı preset, ekrana göre farklı çıktı veriyordu.
describe("D-10: preset kuralları tek yerde", () => {
  const io = { inputPath: "/tmp/in.mp4", outputPath: "/tmp/out.mp4" };

  it("sosyal presetin zorunlu ölçüsünü uygular", () => {
    const spec = buildProfileJobSpec("social-ig-stories", io);
    expect(spec.videoHints).toMatchObject({ width: 1080, height: 1920 });
  });

  it("zorunlu ölçü kullanıcı seçimini ezer", () => {
    const spec = buildProfileJobSpec("social-ig-stories", { ...io, width: 640, height: 360 });
    expect(spec.videoHints).toMatchObject({ width: 1080, height: 1920 });
  });

  it("sosyal presetin boyut limitini uygular", () => {
    expect(buildProfileJobSpec("social-wp-video", io).videoHints?.targetSizeMb).toBe(16);
    expect(buildProfileJobSpec("social-dc-video", io).videoHints?.targetSizeMb).toBe(10);
  });

  it("görüntü presetlerinde de boyut limitini uygular", () => {
    // Eskiden mjpeg/png/libwebp limitten muaftı: WhatsApp 5 MB, Instagram 8 MB
    // alanları yalnızca arayüzde metindi (DENETIM.md D-09).
    expect(buildProfileJobSpec("social-wp-image", { ...io, outputPath: "/tmp/o.jpg" }).videoHints?.targetSizeMb).toBe(5);
    expect(buildProfileJobSpec("social-ig-image", { ...io, outputPath: "/tmp/o.jpg" }).videoHints?.targetSizeMb).toBe(8);
  });

  it("sosyal preset kalite seviyesini sabitler", () => {
    const spec = buildProfileJobSpec("social-yt-1080", { ...io, qualityPreset: "very_small" });
    expect(spec.videoHints?.qualityPreset).toBe("balanced");
  });

  it("sosyal presette en-boy oranı istenmez — zorunlu ölçü zaten çerçeveyi kuruyor", () => {
    const spec = buildProfileJobSpec("social-ig-feed", { ...io, aspectRatio: "4:3" });
    expect(spec.videoHints?.aspectRatio).toBeUndefined();
  });

  it("sosyal olmayan presette kullanıcı seçimlerini korur", () => {
    const spec = buildProfileJobSpec("mp4-h264-aac", {
      ...io,
      qualityPreset: "high",
      width: 1280,
      aspectRatio: "16:9",
      targetSizeMb: 25
    });
    expect(spec.videoHints).toMatchObject({
      qualityPreset: "high",
      width: 1280,
      aspectRatio: "16:9",
      targetSizeMb: 25
    });
  });

  it("kodlayıcı ve mod profilden gelir", () => {
    expect(buildProfileJobSpec("webm-vp9-opus", io)).toMatchObject({
      mode: "transcode",
      videoEncoder: "libvpx-vp9",
      audioEncoder: "libopus"
    });
    expect(buildProfileJobSpec("remux-copy", io).mode).toBe("copy");
    expect(buildProfileJobSpec("audio-mp3", io).audioOnlyOutput).toBe(true);
  });

  it("kodlayıcı override'ı profile üstün gelir", () => {
    expect(buildProfileJobSpec("mp4-h264-aac", { ...io, videoEncoderOverride: "libx265" }).videoEncoder).toBe("libx265");
  });

  it.each([0, -5, NaN])("geçersiz ölçüyü (%p) yok sayar", (bad) => {
    const spec = buildProfileJobSpec("mp4-h264-aac", { ...io, width: bad });
    expect(spec.videoHints?.width).toBeUndefined();
  });
});

// ── D-16 ────────────────────────────────────────────────────────────────────
describe("D-16: uzantısız çıktı yolunda konteyner", () => {
  it("uzantı yoksa ffmpeg muxer adını verir", () => {
    expect(buildProfileJobSpec("mkv-h264-aac", { inputPath: "/a", outputPath: "/tmp/cikti" }).container).toBe("matroska");
    expect(buildProfileJobSpec("audio-m4a-aac", { inputPath: "/a", outputPath: "/tmp/cikti" }).container).toBe("ipod");
    expect(buildProfileJobSpec("image-png", { inputPath: "/a", outputPath: "/tmp/cikti" }).container).toBe("image2");
  });

  it("uzantı varsa dokunmaz — ffmpeg zaten doğru seçiyor", () => {
    expect(buildProfileJobSpec("mkv-h264-aac", { inputPath: "/a", outputPath: "/tmp/o.mkv" }).container).toBeUndefined();
  });

  it("dizin adındaki noktayı uzantı sanmaz", () => {
    expect(buildProfileJobSpec("mp4-h264-aac", { inputPath: "/a", outputPath: "/tmp/v1.2/cikti" }).container).toBe("mp4");
  });
});

// ── D-23 ────────────────────────────────────────────────────────────────────
// `split(/\s+/)` tırnak desteklemediği için boşluk içeren hiçbir değer
// yazılamıyordu: `-metadata title=My Movie` üç argümana bölünüyor, ffmpeg
// `Movie`'yi çıktı yolu sanıyordu.
describe("D-23: ek FFmpeg argümanlarının bölünmesi", () => {
  it("boşluk içeren değeri tırnakla korur", () => {
    expect(parseExtraFfmpegArgs('-metadata "title=My Movie"')).toEqual(["-metadata", "title=My Movie"]);
    expect(parseExtraFfmpegArgs("-metadata 'title=My Movie'")).toEqual(["-metadata", "title=My Movie"]);
  });

  it("tırnaksız sade argümanları eskisi gibi böler", () => {
    expect(parseExtraFfmpegArgs("-tune film -preset slow")).toEqual(["-tune", "film", "-preset", "slow"]);
  });

  it("ters bölü bir sonraki karakteri kaçırır", () => {
    expect(parseExtraFfmpegArgs("a\\ b")).toEqual(["a b"]);
  });

  it("tek tırnak içinde ters bölü harfidir", () => {
    expect(parseExtraFfmpegArgs("'a\\b'")).toEqual(["a\\b"]);
  });

  it("boş tırnak geçerli bir argümandır", () => {
    expect(parseExtraFfmpegArgs('-metadata comment=""')).toEqual(["-metadata", "comment="]);
  });

  it("fazla boşluğu ve boş girdiyi eler", () => {
    expect(parseExtraFfmpegArgs("   -tune    film   ")).toEqual(["-tune", "film"]);
    expect(parseExtraFfmpegArgs("")).toEqual([]);
    expect(parseExtraFfmpegArgs(null)).toEqual([]);
  });

  it("kapanmamış tırnağı sona kadar okur — sessizce kaybetmez", () => {
    expect(parseExtraFfmpegArgs('-metadata "title=Yarim')).toEqual(["-metadata", "title=Yarim"]);
  });
});
