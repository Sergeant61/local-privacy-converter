import { mediaKindFromProbe } from "@lfc/media-formats";
import type { MediaProbeSummary } from "@lfc/types";

import { spawnText } from "./spawn-text";

export interface FfprobeStreamJson {
  codec_type?: string;
  codec_name?: string;
}

export interface FfprobeFormatJson {
  format_name?: string;
  duration?: string;
}

export interface FfprobeFileJson {
  streams?: FfprobeStreamJson[];
  format?: FfprobeFormatJson;
}

export type RunFfprobeResult =
  | { ok: true; json: FfprobeFileJson }
  | { ok: false; message: string };

export async function runFfprobeJson(
  ffprobeExecutable: string,
  inputPath: string
): Promise<RunFfprobeResult> {
  const result = await spawnText(ffprobeExecutable, [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    inputPath
  ]);

  if (!result.ok) {
    return {
      ok: false,
      message: result.stderr.trim() || `ffprobe çıkış kodu: ${result.code ?? "?"}`
    };
  }

  const raw = result.stdout.trim();
  if (!raw.length) {
    return { ok: false, message: "ffprobe boş çıktı verdi." };
  }
  try {
    const json = JSON.parse(raw) as FfprobeFileJson;
    return { ok: true, json };
  } catch {
    return { ok: false, message: "ffprobe JSON ayrıştırılamadı." };
  }
}

export function ffprobeJsonToSummary(json: FfprobeFileJson): MediaProbeSummary {
  const streams = json.streams ?? [];
  let hasVideo = false;
  let hasAudio = false;
  let videoCodec: string | null = null;
  let audioCodec: string | null = null;

  for (const s of streams) {
    if (s.codec_type === "video") {
      hasVideo = true;
      videoCodec = s.codec_name ?? null;
    }
    if (s.codec_type === "audio") {
      hasAudio = true;
      audioCodec = s.codec_name ?? null;
    }
  }

  const durationRaw = json.format?.duration;
  const parsed =
    durationRaw != null && durationRaw !== "N/A" ? Number.parseFloat(durationRaw) : Number.NaN;
  const durationSec = Number.isFinite(parsed) ? parsed : null;
  const formatName = json.format?.format_name ?? "";

  const inferredKind = mediaKindFromProbe({ hasVideo, hasAudio, videoCodec, audioCodec });

  return {
    formatName,
    durationSec,
    hasVideo,
    hasAudio,
    videoCodec,
    audioCodec,
    inferredKind
  };
}
