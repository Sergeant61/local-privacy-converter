import { describe, expect, it } from "vitest";

import { mediaKindFromProbe } from "./probe-kinds";

const probe = (o: Partial<Parameters<typeof mediaKindFromProbe>[0]>) =>
  mediaKindFromProbe({
    hasVideo: false,
    hasAudio: false,
    videoCodec: null,
    audioCodec: null,
    ...o
  });

// ── D-11 ────────────────────────────────────────────────────────────────────
// image-only dalı `!hasAudio` şartına bağlıydı. Kapak resimli MP3 (mjpeg + mp3)
// "video" sınıflanıyor, arayüz 24 video hedefi sunuyor ve dönüşüm 0 baytla
// çöküyordu.
describe("D-11: kapak resimli ses dosyaları", () => {
  it.each(["mjpeg", "png", "bmp", "webp"])("%s kapaklı MP3 ses sayılır", (cover) => {
    expect(probe({ hasVideo: true, hasAudio: true, videoCodec: cover, audioCodec: "mp3" })).toBe("audio");
  });

  it("kapak büyük harfli codec adıyla gelse de tanınır", () => {
    expect(probe({ hasVideo: true, hasAudio: true, videoCodec: "MJPEG", audioCodec: "flac" })).toBe("audio");
  });

  it("sessiz görüntü hâlâ image-only", () => {
    expect(probe({ hasVideo: true, videoCodec: "png" })).toBe("image-only");
  });

  it("gerçek video, sesli de sessiz de olsa video", () => {
    expect(probe({ hasVideo: true, hasAudio: true, videoCodec: "h264", audioCodec: "aac" })).toBe("video");
    expect(probe({ hasVideo: true, videoCodec: "hevc" })).toBe("video");
  });

  it("yalnız ses, ses", () => {
    expect(probe({ hasAudio: true, audioCodec: "mp3" })).toBe("audio");
  });

  it("hiçbir akış okunamayan dosya video sanılmaz", () => {
    // Eski varsayılan "video"ydu: bozuk dosya, çalışmayacak 24 video hedefiyle
    // sunuluyordu.
    expect(probe({})).toBe("audio");
  });
});
