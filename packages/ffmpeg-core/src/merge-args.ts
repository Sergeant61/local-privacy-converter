import type { FfprobeFileJson } from "./ffprobe";

/**
 * Video birleştirme argümanları (DENETIM.md D-05).
 *
 * Eski davranış: her zaman concat demuxer + `-c copy`, hiçbir ön kontrol yok.
 * Girdiler uyumsuzsa ffmpeg hata vermiyordu — exit 0 dönüyor, handler `{ok:true}`
 * diyor, kullanıcı "başarıyla birleştirildi" bildirimi alıyordu; ama ikinci klip
 * yanlış çözünürlükte, yanlış hızda ve ses akışı düşmüş halde çıkıyordu.
 *
 * Yeni davranış: girdiler önce ffprobe ile özetlenir. Hepsi uyumluysa hızlı yol
 * (stream copy) korunur — bu en yaygın durum ve yeniden kodlamak israf olur.
 * Uyuşmazlık varsa `filter_complex concat`'e düşülür: her akış ortak bir hedefe
 * normalize edilir, sesi olmayan girdiye sessizlik eklenir.
 */

export interface MergeInputSummary {
  path: string;
  width: number | null;
  height: number | null;
  /** Saniyedeki kare sayısı; `r_frame_rate` kesrinden çözülür. */
  fps: number | null;
  videoCodec: string | null;
  pixFmt: string | null;
  durationSec: number | null;
  hasAudio: boolean;
  audioCodec: string | null;
  sampleRate: number | null;
  channels: number | null;
}

export interface MergeTarget {
  width: number;
  height: number;
  fps: number;
}

export type MergePlan =
  | { strategy: "copy" }
  | { strategy: "filter"; target: MergeTarget; reasons: string[] };

/** Sesi olmayan girdiler için üretilen sessizliğin parametreleri. */
const SILENCE_SAMPLE_RATE = 48_000;
const SILENCE_LAYOUT = "stereo";

/** `r_frame_rate` "30000/1001" gibi bir kesirdir; 0/0 "bilinmiyor" demektir. */
function parseFrameRate(raw: string | undefined): number | null {
  if (!raw) return null;
  const [numRaw, denRaw] = raw.split("/");
  const num = Number(numRaw);
  const den = denRaw === undefined ? 1 : Number(denRaw);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0 || num <= 0) return null;
  return num / den;
}

/** İki kare hızı pratikte aynı mı? 29.97 ile 30 arasında ayrım yapmaya değmez. */
function sameFps(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) < 0.05;
}

export function summarizeMergeInput(path: string, json: FfprobeFileJson): MergeInputSummary {
  const streams = json.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  const audio = streams.find((s) => s.codec_type === "audio");
  const duration = Number(json.format?.duration);

  return {
    path,
    width: typeof video?.width === "number" ? video.width : null,
    height: typeof video?.height === "number" ? video.height : null,
    fps: parseFrameRate(video?.r_frame_rate),
    videoCodec: video?.codec_name ?? null,
    pixFmt: video?.pix_fmt ?? null,
    durationSec: Number.isFinite(duration) && duration > 0 ? duration : null,
    hasAudio: audio !== undefined,
    audioCodec: audio?.codec_name ?? null,
    sampleRate: audio?.sample_rate !== undefined ? Number(audio.sample_rate) || null : null,
    channels: typeof audio?.channels === "number" ? audio.channels : null
  };
}

/** Çift sayıya yuvarlar: yuv420p tek boyutlu kareyi kodlayamaz. */
function toEven(n: number): number {
  return n % 2 === 0 ? n : n + 1;
}

/**
 * Girdileri karşılaştırır ve strateji seçer. Uyuşmazlık gerekçeleri kullanıcıya
 * gösterilebilsin diye tek tek döner — "neden yeniden kodlanıyor" sorusunun
 * cevabı sessizce kaybolmasın.
 */
export function planVideoMerge(inputs: MergeInputSummary[]): MergePlan {
  const first = inputs[0];
  if (first === undefined) {
    return { strategy: "copy" };
  }

  const reasons: string[] = [];
  for (const cur of inputs.slice(1)) {
    if (cur.width !== first.width || cur.height !== first.height) {
      reasons.push(
        `çözünürlük farklı (${first.width ?? "?"}×${first.height ?? "?"} ↔ ${cur.width ?? "?"}×${cur.height ?? "?"})`
      );
    }
    if (cur.videoCodec !== first.videoCodec) {
      reasons.push(`video codec farklı (${first.videoCodec ?? "?"} ↔ ${cur.videoCodec ?? "?"})`);
    }
    if (cur.pixFmt !== first.pixFmt) {
      reasons.push(`piksel biçimi farklı (${first.pixFmt ?? "?"} ↔ ${cur.pixFmt ?? "?"})`);
    }
    if (!sameFps(cur.fps, first.fps)) {
      reasons.push(`kare hızı farklı (${first.fps?.toFixed(2) ?? "?"} ↔ ${cur.fps?.toFixed(2) ?? "?"})`);
    }
    if (cur.hasAudio !== first.hasAudio) {
      reasons.push(cur.hasAudio ? "bir girdide ses yok" : "bir girdide ses yok");
    } else if (cur.hasAudio && first.hasAudio) {
      if (cur.audioCodec !== first.audioCodec) {
        reasons.push(`ses codec'i farklı (${first.audioCodec ?? "?"} ↔ ${cur.audioCodec ?? "?"})`);
      }
      if (cur.sampleRate !== first.sampleRate) {
        reasons.push(`örnekleme hızı farklı (${first.sampleRate ?? "?"} ↔ ${cur.sampleRate ?? "?"})`);
      }
      if (cur.channels !== first.channels) {
        reasons.push(`kanal sayısı farklı (${first.channels ?? "?"} ↔ ${cur.channels ?? "?"})`);
      }
    }
  }

  if (reasons.length === 0) {
    return { strategy: "copy" };
  }

  // Hedef en büyük kareye göre seçilir: küçültmek ayrıntı kaybettirir, büyütmek
  // yalnızca yumuşatır. Kare hızında da en yükseği alınır ki hiçbir klip
  // yavaşlamasın.
  const width = toEven(Math.max(...inputs.map((i) => i.width ?? 0), 2));
  const height = toEven(Math.max(...inputs.map((i) => i.height ?? 0), 2));
  const fpsCandidates = inputs.map((i) => i.fps).filter((f): f is number => f !== null);
  const fps = fpsCandidates.length > 0 ? Math.max(...fpsCandidates) : 30;

  return {
    strategy: "filter",
    target: { width, height, fps },
    // Aynı gerekçe birden çok girdide tekrarlanabilir; kullanıcıya bir kez göster.
    reasons: [...new Set(reasons)]
  };
}

/** concat demuxer'ın liste dosyası içeriği. Tek tırnak ffmpeg'in beklediği gibi kaçırılır. */
export function buildConcatListContent(inputPaths: string[]): string {
  return inputPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
}

/** Hızlı yol: girdiler zaten uyumlu, yeniden kodlama yok. */
export function buildConcatCopyArgs(listPath: string, outputPath: string): string[] {
  return ["-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", "-y", outputPath];
}

/**
 * Uyumsuz girdiler için `filter_complex concat`.
 *
 * Her video ortak hedefe ölçeklenir (en-boy oranı korunur, kalan alan siyahla
 * doldurulur), her ses ortak biçime getirilir; sesi olmayan girdiye kendi
 * süresi kadar sessizlik üretilir. Böylece concat filtresi tüm akışları eşit
 * biçimde alır — sessizce akış düşmesi mümkün olmaz.
 */
export function buildVideoMergeFilterArgs(
  inputs: MergeInputSummary[],
  target: MergeTarget,
  outputPath: string
): string[] {
  const needsSilence = inputs.some((i) => !i.hasAudio);
  const silenceIndex = inputs.length;

  const args: string[] = [];
  for (const input of inputs) {
    args.push("-i", input.path);
  }
  if (needsSilence) {
    args.push(
      "-f",
      "lavfi",
      "-i",
      `anullsrc=r=${SILENCE_SAMPLE_RATE}:cl=${SILENCE_LAYOUT}`
    );
  }

  const chains: string[] = [];
  const concatInputs: string[] = [];

  inputs.forEach((input, i) => {
    chains.push(
      `[${i}:v]scale=${target.width}:${target.height}:force_original_aspect_ratio=decrease,` +
        `pad=${target.width}:${target.height}:(ow-iw)/2:(oh-ih)/2,` +
        `setsar=1,fps=${target.fps},format=yuv420p[v${i}]`
    );

    if (input.hasAudio) {
      chains.push(
        `[${i}:a]aresample=${SILENCE_SAMPLE_RATE},` +
          `aformat=sample_fmts=fltp:channel_layouts=${SILENCE_LAYOUT},` +
          `asetpts=PTS-STARTPTS[a${i}]`
      );
    } else {
      // Sessizlik kaynağı sonsuzdur; klibin süresi kadar kırpılır. Süre
      // bilinmiyorsa 1 sn'ye düşülür — akışı hiç eklememektense kısa eklemek
      // yeğdir, çünkü eksik akış concat'i bozar.
      const dur = input.durationSec ?? 1;
      chains.push(
        `[${silenceIndex}:a]atrim=0:${dur},` +
          `aformat=sample_fmts=fltp:channel_layouts=${SILENCE_LAYOUT},` +
          `asetpts=PTS-STARTPTS[a${i}]`
      );
    }

    concatInputs.push(`[v${i}][a${i}]`);
  });

  chains.push(`${concatInputs.join("")}concat=n=${inputs.length}:v=1:a=1[outv][outa]`);

  args.push(
    "-filter_complex",
    chains.join(";"),
    "-map",
    "[outv]",
    "-map",
    "[outa]",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    "-y",
    outputPath
  );

  return args;
}
