/**
 * FFmpeg komut oluşturma ve güvenli çocuk süreç yardımcıları.
 *
 * Güvenlik: FFmpeg **asla** `shell: true` ile çalıştırılmamalı; kullanıcı yolları
 * argüman dizisine bölmek `child_process.spawn(executable, args, { shell:false })`
 * kullanılmalıdır. Bu paket üretilen argümanların şeklini garanti altına alır, ancak
 * çağıranların spawn seçenekleri hâlâ sorumluluklarıdır.
 */

import { spawn } from "node:child_process";

import type { ConvertJobSpec, FfmpegProbeResult } from "@lfc/types";

import {
  balancedAacAudio,
  cpuCompatibleH264Preset,
  copyStreams,
  fastNvencCompatibleH264
} from "@lfc/ffmpeg-presets";

function vfScale(width?: number, height?: number, fps?: number): string[] {
  const segments: string[] = [];
  if (width ?? height) {
    const w = width ?? -2;
    const h = height ?? -2;
    segments.push(`scale=${w}:${h}`);
  }
  if (fps) {
    segments.push(`fps=${fps}`);
  }
  if (!segments.length) {
    return [];
  }
  return ["-vf", segments.join(",")];
}

function pickCpuVideoArgs(encoder: ConvertJobSpec["videoEncoder"]) {
  if (encoder === "h264_nvenc") {
    return fastNvencCompatibleH264();
  }
  switch (encoder) {
    case "libx265":
      return ["-c:v", "libx265", "-crf", "28", "-preset", "medium"];
    case "libsvtav1":
      return ["-c:v", "libsvtav1", "-crf", "30", "-preset", "8"];
    case "libx264":
    default:
      return [...cpuCompatibleH264Preset()];
  }
}

/** Yüksek seviye iş tanımından `spawn` uyumlu argüman dizisi üretir. */
export function buildFfmpegArgs(spec: ConvertJobSpec): string[] {
  const args = ["-hide_banner", "-nostdin", "-y"];

  args.push("-i", spec.inputPath);

  if (spec.mode === "copy") {
    args.push(...copyStreams());
    args.push(spec.outputPath);
    return args;
  }

  const stripVideo = spec.videoHints?.stripVideo ?? false;
  if (!stripVideo) {
    args.push(...vfScale(spec.videoHints?.width, spec.videoHints?.height, spec.videoHints?.fps));
    args.push(...pickCpuVideoArgs(spec.videoEncoder ?? "libx264"));
  }

  switch (spec.audioEncoder ?? "aac") {
    case "copy":
      args.push("-c:a", "copy");
      break;
    case "libmp3lame":
      args.push("-c:a", "libmp3lame", "-b:a", "192k");
      break;
    case "libopus":
      args.push("-c:a", "libopus", "-b:a", "128k");
      break;
    case "aac":
    default:
      args.push(...balancedAacAudio());
      break;
  }

  if (stripVideo) {
    args.push("-vn");
  }

  args.push(spec.outputPath);
  return args;
}

async function drainStream(stream?: NodeJS.ReadableStream): Promise<string> {
  if (!stream) {
    return "";
  }
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString();
}

/** `ffmpeg -version` çıktısını yakalar; çıkış kodu sıfır değilse hata olarak döner. */
export async function probeFfmpegVersion(
  ffmpegExecutable: string
): Promise<FfmpegProbeResult> {
  return await new Promise((resolve) => {
    let settled = false;
    const finalize = (result: FfmpegProbeResult) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    const subprocess = spawn(
      ffmpegExecutable,
      ["-hide_banner", "-loglevel", "error", "-version"],
      {
        stdio: ["ignore", "pipe", "pipe"],
        shell: false
      }
    );

    const stdoutPromise = drainStream(subprocess.stdout);
    const stderrPromise = drainStream(subprocess.stderr);
    const closePromise = new Promise<number | null>((innerResolve) =>
      subprocess.once("close", (code) => innerResolve(code ?? null))
    );

    subprocess.once("error", (error: NodeJS.ErrnoException) => {
      finalize({ ok: false, code: null, stderr: error.message });
    });

    void Promise.all([stdoutPromise, stderrPromise, closePromise])
      .then(([stdout, stderr, code]) => {
        if (code === 0) {
          finalize({ ok: true, stdout });
          return;
        }
        finalize({ ok: false, code, stderr });
      })
      .catch((error: unknown) => {
        finalize({
          ok: false,
          code: null,
          stderr: error instanceof Error ? error.message : String(error)
        });
      });
  });
}
