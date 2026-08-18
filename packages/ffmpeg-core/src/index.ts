/**
 * FFmpeg komut oluşturma ve güvenli çocuk süreç yardımcıları.
 *
 * Güvenlik: FFmpeg **asla** `shell: true` ile çalıştırılmamalı; kullanıcı yolları
 * argüman dizisine bölmek `child_process.spawn(executable, args, { shell:false })`
 * kullanılmalıdır. Bu paket üretilen argümanların şeklini garanti altına alır, ancak
 * çağıranların spawn seçenekleri hâlâ sorumluluklarıdır.
 */

import { spawn } from "node:child_process";

import type { FfmpegProbeResult } from "@lfc/types";

export {
  listFfmpegCapabilities,
  parseFfmpegCodecTable,
  parseHwaccels
} from "./capabilities";
export { buildFfmpegArgs } from "./build-args";
export { buildTrimArgs } from "./trim-args";
export type { TrimArgsInput, TrimArgsResult } from "./trim-args";
export {
  summarizeMergeInput,
  planVideoMerge,
  buildConcatListContent,
  buildConcatCopyArgs,
  buildVideoMergeFilterArgs
} from "./merge-args";
export type { MergeInputSummary, MergePlan, MergeTarget } from "./merge-args";
export { buildSubtitleExtractArgs, subtitleExtensionFor } from "./subtitle-args";
export type { SubtitleFormat, SubtitleExtractInput, SubtitleExtractResult } from "./subtitle-args";
export { ffprobeJsonToSummary, runFfprobeJson } from "./ffprobe";
export type { FfprobeFileJson, FfprobeFormatJson, FfprobeStreamJson } from "./ffprobe";
export { runFfmpegJob } from "./run-ffmpeg";

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
