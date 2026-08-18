import { describe, expect, it } from "vitest";

import type { FfprobeFileJson } from "./ffprobe";
import {
  buildConcatCopyArgs,
  buildConcatListContent,
  buildVideoMergeFilterArgs,
  planVideoMerge,
  summarizeMergeInput,
  type MergeInputSummary
} from "./merge-args";
import { buildSubtitleExtractArgs, subtitleExtensionFor } from "./subtitle-args";

function probeJson(opts: {
  width?: number;
  height?: number;
  fps?: string;
  codec?: string;
  pixFmt?: string;
  audio?: { codec?: string; rate?: string; channels?: number } | null;
  duration?: string;
}): FfprobeFileJson {
  const streams: FfprobeFileJson["streams"] = [
    {
      codec_type: "video",
      codec_name: opts.codec ?? "h264",
      width: opts.width ?? 1920,
      height: opts.height ?? 1080,
      pix_fmt: opts.pixFmt ?? "yuv420p",
      r_frame_rate: opts.fps ?? "30/1"
    }
  ];
  if (opts.audio !== null) {
    streams.push({
      codec_type: "audio",
      codec_name: opts.audio?.codec ?? "aac",
      sample_rate: opts.audio?.rate ?? "48000",
      channels: opts.audio?.channels ?? 2
    });
  }
  return { streams, format: { duration: opts.duration ?? "4.0" } };
}

const sum = (path: string, opts: Parameters<typeof probeJson>[0] = {}): MergeInputSummary =>
  summarizeMergeInput(path, probeJson(opts));

/** `-filter_complex` değerini argüman dizisinden çeker. */
function filterGraph(args: string[]): string {
  const i = args.indexOf("-filter_complex");
  return i === -1 ? "" : (args[i + 1] ?? "");
}

// ── D-05 ────────────────────────────────────────────────────────────────────
// concat demuxer + `-c copy` uyumsuz girdilerde hata vermiyor: exit 0 dönüyor,
// handler "başarılı" diyor, ama ikinci klip yanlış çözünürlükte, yanlış hızda
// ve ses akışı düşmüş halde çıkıyordu.
describe("D-05: video birleştirme uyum kontrolü", () => {
  it("ffprobe çıktısını özetler", () => {
    const s = sum("/tmp/a.mp4", { width: 1280, height: 720, fps: "30000/1001" });
    expect(s).toMatchObject({ width: 1280, height: 720, videoCodec: "h264", hasAudio: true });
    expect(s.fps).toBeCloseTo(29.97, 2);
  });

  it("kare hızı bilinmiyorsa null döner — 0/0 sayı değildir", () => {
    expect(sum("/tmp/a.mp4", { fps: "0/0" }).fps).toBeNull();
  });

  it("özdeş girdilerde hızlı yolu (stream copy) korur", () => {
    const plan = planVideoMerge([sum("/tmp/a.mp4"), sum("/tmp/b.mp4")]);
    expect(plan.strategy).toBe("copy");
  });

  it("29.97 ile 30'u aynı sayar — bu fark için yeniden kodlamaya değmez", () => {
    const plan = planVideoMerge([sum("/tmp/a.mp4", { fps: "30/1" }), sum("/tmp/b.mp4", { fps: "30000/1001" })]);
    expect(plan.strategy).toBe("copy");
  });

  it.each([
    ["çözünürlük", { width: 640, height: 480 }, /çözünürlük/],
    ["video codec", { codec: "hevc" }, /video codec/],
    ["piksel biçimi", { pixFmt: "yuv422p" }, /piksel/],
    ["kare hızı", { fps: "60/1" }, /kare hızı/],
    ["ses codec", { audio: { codec: "mp3" } }, /ses codec/],
    ["örnekleme hızı", { audio: { rate: "44100" } }, /örnekleme/],
    ["kanal sayısı", { audio: { channels: 1 } }, /kanal/]
  ])("%s uyuşmazlığını yakalar", (_label, diff, pattern) => {
    const plan = planVideoMerge([sum("/tmp/a.mp4"), sum("/tmp/b.mp4", diff)]);
    expect(plan.strategy).toBe("filter");
    if (plan.strategy !== "filter") return;
    expect(plan.reasons.join(" ")).toMatch(pattern);
  });

  it("ses akışı eksikliğini yakalar — sessizce düşen akışın kaynağı buydu", () => {
    const plan = planVideoMerge([sum("/tmp/a.mp4"), sum("/tmp/b.mp4", { audio: null })]);
    expect(plan.strategy).toBe("filter");
    if (plan.strategy !== "filter") return;
    expect(plan.reasons.join(" ")).toMatch(/ses yok/);
  });

  it("hedefi en büyük kareye ve en yüksek hıza göre seçer", () => {
    const plan = planVideoMerge([
      sum("/tmp/a.mp4", { width: 640, height: 480, fps: "25/1" }),
      sum("/tmp/b.mp4", { width: 1920, height: 1080, fps: "60/1" })
    ]);
    expect(plan.strategy).toBe("filter");
    if (plan.strategy !== "filter") return;
    expect(plan.target).toEqual({ width: 1920, height: 1080, fps: 60 });
  });

  it("tek boyutlu kareyi çifte yuvarlar — yuv420p tekini kodlayamaz", () => {
    const plan = planVideoMerge([
      sum("/tmp/a.mp4", { width: 641, height: 481 }),
      sum("/tmp/b.mp4", { width: 320, height: 240 })
    ]);
    if (plan.strategy !== "filter") throw new Error("filter bekleniyordu");
    expect(plan.target.width % 2).toBe(0);
    expect(plan.target.height % 2).toBe(0);
  });

  it("aynı gerekçeyi tekrarlamaz", () => {
    const plan = planVideoMerge([
      sum("/tmp/a.mp4", { width: 1920, height: 1080 }),
      sum("/tmp/b.mp4", { width: 640, height: 480 }),
      sum("/tmp/c.mp4", { width: 320, height: 240 })
    ]);
    if (plan.strategy !== "filter") throw new Error("filter bekleniyordu");
    expect(plan.reasons.filter((r) => r.startsWith("çözünürlük"))).toHaveLength(2);
    expect(new Set(plan.reasons).size).toBe(plan.reasons.length);
  });
});

describe("D-05: filtre grafiği", () => {
  const target = { width: 1920, height: 1080, fps: 30 };

  it("her girdi için ortak hedefe normalize edilmiş bir video zinciri kurar", () => {
    const inputs = [sum("/tmp/a.mp4"), sum("/tmp/b.mp4", { width: 640, height: 480 })];
    const graph = filterGraph(buildVideoMergeFilterArgs(inputs, target, "/tmp/out.mp4"));
    expect(graph).toContain("[0:v]scale=1920:1080");
    expect(graph).toContain("[1:v]scale=1920:1080");
    expect(graph).toContain("force_original_aspect_ratio=decrease");
    expect(graph).toContain("setsar=1");
    expect(graph).toContain("concat=n=2:v=1:a=1[outv][outa]");
  });

  it("sesi olmayan girdiye kendi süresi kadar sessizlik üretir", () => {
    const inputs = [sum("/tmp/a.mp4"), sum("/tmp/b.mp4", { audio: null, duration: "7.5" })];
    const args = buildVideoMergeFilterArgs(inputs, target, "/tmp/out.mp4");
    expect(args).toContain("anullsrc=r=48000:cl=stereo");
    // Sessizlik girdisi dosyalardan sonra gelir: indeks 2.
    expect(filterGraph(args)).toContain("[2:a]atrim=0:7.5");
  });

  it("tüm girdilerde ses varsa sessizlik kaynağı eklemez", () => {
    const args = buildVideoMergeFilterArgs([sum("/tmp/a.mp4"), sum("/tmp/b.mp4")], target, "/tmp/out.mp4");
    expect(args.join(" ")).not.toContain("anullsrc");
  });

  it("süresi bilinmeyen sessiz girdiyi de akışsız bırakmaz", () => {
    const inputs = [sum("/tmp/a.mp4"), summarizeMergeInput("/tmp/b.mp4", { streams: [{ codec_type: "video" }] })];
    expect(filterGraph(buildVideoMergeFilterArgs(inputs, target, "/tmp/out.mp4"))).toContain("atrim=0:1");
  });

  it("her girdinin hem video hem ses etiketi concat'e girer", () => {
    const graph = filterGraph(
      buildVideoMergeFilterArgs([sum("/a"), sum("/b"), sum("/c")], target, "/tmp/out.mp4")
    );
    expect(graph).toContain("[v0][a0][v1][a1][v2][a2]concat=n=3");
  });

  it("çıktı yolunu son argüman olarak koyar ve yeniden kodlar", () => {
    const args = buildVideoMergeFilterArgs([sum("/a"), sum("/b")], target, "/tmp/out.mp4");
    expect(args.at(-1)).toBe("/tmp/out.mp4");
    expect(args).toContain("libx264");
    expect(args).not.toContain("copy");
  });

  it("concat listesindeki tek tırnakları kaçırır", () => {
    expect(buildConcatListContent(["/tmp/it's a.mp4"])).toBe("file '/tmp/it'\\''s a.mp4'");
  });

  it("hızlı yol hâlâ stream copy", () => {
    expect(buildConcatCopyArgs("/tmp/l.txt", "/tmp/o.mp4")).toEqual([
      "-f", "concat", "-safe", "0", "-i", "/tmp/l.txt", "-c", "copy", "-y", "/tmp/o.mp4"
    ]);
  });
});

// ── D-06 ────────────────────────────────────────────────────────────────────
// Handler sabit `-c:s copy` kullanıyor ve `format` alanını hiç okumuyordu.
// MP4'ün standart altyazı codec'i mov_text ile üç formatta da boş dosya ve
// "Could not write header" çıkıyordu.
describe("D-06: altyazı çıkarma", () => {
  const io = { inputPath: "/tmp/in.mp4", outputPath: "/tmp/out.srt", streamIndex: 2 };

  it.each([
    ["srt", "srt"],
    ["ass", "ass"],
    ["vtt", "webvtt"]
  ] as const)("mov_text kaynağı %s için %s codec'ine çevirir", (format, codec) => {
    const r = buildSubtitleExtractArgs({ ...io, format, sourceCodec: "mov_text" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.codec).toBe(codec);
    expect(r.args).not.toContain("copy");
  });

  it("hiçbir durumda kör `copy` kullanmaz", () => {
    const r = buildSubtitleExtractArgs({ ...io, format: "srt", sourceCodec: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.codec).toBe("srt");
  });

  it.each([
    ["subrip", "srt"],
    ["srt", "srt"],
    ["ass", "ass"],
    ["ssa", "ass"],
    ["webvtt", "vtt"]
  ] as const)("kaynak zaten hedef formatsa (%s → %s) copy kullanır", (sourceCodec, format) => {
    const r = buildSubtitleExtractArgs({ ...io, format, sourceCodec });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.codec).toBe("copy");
  });

  it.each(["dvd_subtitle", "hdmv_pgs_subtitle", "dvb_subtitle", "xsub"])(
    "görüntü tabanlı %s için anlaşılır hata döner",
    (sourceCodec) => {
      const r = buildSubtitleExtractArgs({ ...io, format: "srt", sourceCodec });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason).toMatch(/görüntü tabanlı/);
    }
  );

  it("büyük harfli codec adını da tanır", () => {
    const r = buildSubtitleExtractArgs({ ...io, format: "srt", sourceCodec: "DVD_SUBTITLE" });
    expect(r.ok).toBe(false);
  });

  it("istenen akışı eşler ve çıktıyı son argüman yapar", () => {
    const r = buildSubtitleExtractArgs({ ...io, format: "srt", sourceCodec: "mov_text" });
    if (!r.ok) return;
    expect(r.args).toContain("-map");
    expect(r.args[r.args.indexOf("-map") + 1]).toBe("0:2");
    expect(r.args.at(-1)).toBe("/tmp/out.srt");
  });

  it("uzantı hedef formatla eşleşir", () => {
    expect(subtitleExtensionFor("srt")).toBe("srt");
    expect(subtitleExtensionFor("ass")).toBe("ass");
    expect(subtitleExtensionFor("vtt")).toBe("vtt");
  });
});
