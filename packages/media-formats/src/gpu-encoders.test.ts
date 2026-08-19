import { describe, expect, it } from "vitest";

import { GPU_ENCODERS, gpuEncoderForProfile } from "./gpu-encoders";
import { targetProfileToJobHints } from "./job-hints";

/** Apple Silicon'da gerçekte bulunan kodlayıcı kümesine yakın bir örnek. */
const MAC = new Set([
  "libx264",
  "libx265",
  "libsvtav1",
  "libvpx-vp9",
  "h264_videotoolbox",
  "hevc_videotoolbox"
]);

const NVIDIA = new Set([
  "libx264",
  "libx265",
  "libsvtav1",
  "libvpx-vp9",
  "h264_nvenc",
  "hevc_nvenc",
  "av1_nvenc"
]);

const CPU_ONLY = new Set(["libx264", "libx265", "libsvtav1", "libvpx-vp9"]);

describe("gpuEncoderForProfile", () => {
  // ISTEMCI-TEST-RAPORU.md H-01 — asıl kusur buydu: hedef ne olursa olsun
  // H.264 donanım kodlayıcısı seçiliyor ve profilin kodeğini eziyordu.
  it("H.265 hedefinde H.264 donanım kodlayıcısı SEÇMEZ", () => {
    const chosen = gpuEncoderForProfile("mp4-h265-aac", MAC);
    expect(chosen).toBe("hevc_videotoolbox");
    expect(chosen).not.toContain("h264");
  });

  it("WebM/VP9 hedefinde donanım kodlayıcısına düşmez — yazılımda kalır", () => {
    // Eskiden burada `h264_videotoolbox` seçiliyordu ve FFmpeg
    // "Only VP8 or VP9 or AV1 video ... supported for WebM" deyip kırılıyordu.
    expect(gpuEncoderForProfile("webm-vp9-opus", MAC)).toBe("");
    expect(gpuEncoderForProfile("webm-vp9-opus", NVIDIA)).toBe("");
  });

  it("H.264 hedefinde H.264 donanım kodlayıcısını seçer", () => {
    expect(gpuEncoderForProfile("mp4-h264-aac", MAC)).toBe("h264_videotoolbox");
    expect(gpuEncoderForProfile("mkv-h264-aac", NVIDIA)).toBe("h264_nvenc");
  });

  it("AV1 hedefinde yalnızca AV1 donanım kodlayıcısı kullanılır", () => {
    // Mac'te AV1 donanım kodlayıcısı yok → yazılım (libsvtav1) kalır.
    expect(gpuEncoderForProfile("mp4-av1-aac", MAC)).toBe("");
    expect(gpuEncoderForProfile("mp4-av1-aac", NVIDIA)).toBe("av1_nvenc");
  });

  it("donanım kodlayıcısı hiç yoksa boş döner", () => {
    expect(gpuEncoderForProfile("mp4-h264-aac", CPU_ONLY)).toBe("");
    expect(gpuEncoderForProfile("mp4-h265-aac", CPU_ONLY)).toBe("");
  });

  it("öncelik sırasına uyar — birden çok donanım kodlayıcısı varsa ilki", () => {
    const both = new Set(["h264_nvenc", "h264_videotoolbox", "h264_qsv"]);
    expect(gpuEncoderForProfile("mp4-h264-aac", both)).toBe("h264_videotoolbox");
  });

  it("videosuz (ses/remux) hedeflerde kodlayıcı seçmez", () => {
    expect(gpuEncoderForProfile("audio-mp3", MAC)).toBe("");
    expect(gpuEncoderForProfile("audio-wav", MAC)).toBe("");
    expect(gpuEncoderForProfile("remux-copy", MAC)).toBe("");
  });

  it("görüntü hedeflerinde kodlayıcı seçmez", () => {
    expect(gpuEncoderForProfile("image-png", MAC)).toBe("");
    expect(gpuEncoderForProfile("image-jpeg", MAC)).toBe("");
    expect(gpuEncoderForProfile("image-webp", MAC)).toBe("");
  });

  /**
   * Kapsam kontrolü: video üreten HER profil ya kendi kodek ailesinden bir
   * donanım kodlayıcısı almalı ya da hiç almamalı. Aile dışına düşen tek bir
   * profil bile H-01'in tekrarı demek — bu yüzden profil listesi büyüdükçe de
   * korunsun diye tablodan değil, profillerin kendisinden türetiliyor.
   */
  it("hiçbir profil kendi kodek ailesinin dışına düşmez", () => {
    const ALL = new Set([...MAC, ...NVIDIA, "h264_qsv", "hevc_qsv", "av1_qsv", "h264_amf", "hevc_amf", "av1_amf", "h264_vaapi", "hevc_vaapi"]);
    const families: Record<string, string> = {
      libx264: "h264", libx265: "hevc", libsvtav1: "av1"
    };

    const profiles = [
      "mp4-h264-aac", "mp4-h265-aac", "mp4-av1-aac", "webm-vp9-opus", "mkv-h264-aac"
    ] as const;

    for (const id of profiles) {
      const software = targetProfileToJobHints(id).videoEncoder;
      const chosen = gpuEncoderForProfile(id, ALL);
      if (chosen === "") continue;
      const expectedPrefix = families[software ?? ""];
      expect(expectedPrefix, `${id} için aile tanımlı olmalı`).toBeTruthy();
      expect(chosen.startsWith(`${expectedPrefix}_`), `${id} → ${chosen}`).toBe(true);
    }
  });

  it("GPU_ENCODERS kümesi tüm ailelerin kodlayıcılarını içerir", () => {
    expect(GPU_ENCODERS.has("h264_videotoolbox")).toBe(true);
    expect(GPU_ENCODERS.has("hevc_videotoolbox")).toBe(true);
    expect(GPU_ENCODERS.has("av1_nvenc")).toBe(true);
    expect(GPU_ENCODERS.has("libx264")).toBe(false);
  });
});
