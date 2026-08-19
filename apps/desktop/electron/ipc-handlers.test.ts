/**
 * IPC handler testleri (KALAN-ISLER.md K-02).
 *
 * Neden var: 190 birim testinin tamamı `packages/` altındaki saf
 * fonksiyonlardaydı, bu katman test edilmiyordu. DENETIM.md'de bulunan kırık
 * özelliklerin çoğu tam olarak burada saklanıyordu — argüman üreticileri doğru
 * çalışırken handler onları yanlış çağırıyordu (D-06, D-20).
 *
 * Yöntem: `@lfc/ffmpeg-core`'un **yalnızca süreç koşucuları** taklit ediliyor
 * (`runFfmpegJob`, `runFfprobeJson`, `probeFfmpegVersion`,
 * `listFfmpegCapabilities`); argüman üreticilerinin hepsi GERÇEK. Testin
 * ölçtüğü şey de bu: handler'ın ffmpeg'e gerçekten hangi argümanları verdiği.
 * Üreticiyi de taklit etseydik D-06 sınıfı hatalar yine görünmez kalırdı.
 *
 * Ayarlar ve profiller gerçek dosya sistemine yazılıyor — her testte taze bir
 * geçici `userData` dizini açılıyor.
 */

import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  APNG_CONVERT_CHANNEL,
  AUDIO_MERGE_CHANNEL,
  AUDIO_NORMALIZE_CHANNEL,
  CANCEL_CONVERT_CHANNEL,
  CAPABILITIES_CHANNEL,
  CHECK_UPDATE_CHANNEL,
  FRAME_EXTRACT_CHANNEL,
  GET_OUTPUT_DIR_CHANNEL,
  GIF_CONVERT_CHANNEL,
  HANDLER_CHANNELS,
  METADATA_READ_CHANNEL,
  METADATA_WRITE_CHANNEL,
  OPEN_MEDIA_CHANNEL,
  PDF_CONVERT_CHANNEL,
  PROBE_CHANNEL,
  PROFILES_DELETE_CHANNEL,
  PROFILES_GET_CHANNEL,
  PROFILES_SAVE_CHANNEL,
  READ_PREVIEW_CHANNEL,
  RUN_CONVERT_CHANNEL,
  RUN_CONVERT_LOG_CHANNEL,
  RUN_CONVERT_PROGRESS_CHANNEL,
  SAVE_OUTPUT_CHANNEL,
  SETTINGS_GET_CHANNEL,
  SETTINGS_SET_CHANNEL,
  SHOW_IN_FOLDER_CHANNEL,
  SUBTITLE_EXTRACT_CHANNEL,
  SUBTITLE_PROBE_CHANNEL,
  VERSION_CHANNEL,
  VIDEO_MERGE_CHANNEL,
  VIDEO_TRIM_CHANNEL,
  WATERMARK_CHANNEL
} from "./channels";

// ── Taklitler ────────────────────────────────────────────────────────────────
// `vi.hoisted`: `vi.mock` fabrikaları dosyanın en üstüne kaldırılıyor, bu yüzden
// referans verecekleri her şey onlardan da önce var olmak zorunda.

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, payload: unknown) => unknown>(),
  userDataDir: { value: "" },
  showOpenDialog: vi.fn(),
  showSaveDialog: vi.fn(),
  showItemInFolder: vi.fn(),
  runFfmpegJob: vi.fn(),
  runFfprobeJson: vi.fn(),
  probeFfmpegVersion: vi.fn(),
  listFfmpegCapabilities: vi.fn(),
  resolveFfmpegExecutable: vi.fn(),
  resolveFfprobeExecutable: vi.fn(),
  spawn: vi.fn(),
  httpsGet: vi.fn()
}));

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getAppPath: () => "/app",
    getVersion: () => "1.3.0",
    getPath: (name: string) =>
      name === "documents"
        ? path.join(mocks.userDataDir.value, "Documents")
        : mocks.userDataDir.value,
    setName: vi.fn(),
    quit: vi.fn()
  },
  BrowserWindow: {
    // Diyalog handler'ları çağıran pencereyi arıyor; testte hep bulunuyor.
    fromWebContents: () => ({ id: 1 })
  },
  dialog: {
    showOpenDialog: mocks.showOpenDialog,
    showSaveDialog: mocks.showSaveDialog
  },
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, payload: unknown) => unknown) => {
      mocks.handlers.set(channel, fn);
    },
    removeHandler: (channel: string) => {
      mocks.handlers.delete(channel);
    }
  },
  shell: { showItemInFolder: mocks.showItemInFolder }
}));

// Argüman üreticileri gerçek kalıyor; yalnızca süreç başlatanlar taklit.
vi.mock("@lfc/ffmpeg-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@lfc/ffmpeg-core")>();
  return {
    ...actual,
    runFfmpegJob: mocks.runFfmpegJob,
    runFfprobeJson: mocks.runFfprobeJson,
    probeFfmpegVersion: mocks.probeFfmpegVersion,
    listFfmpegCapabilities: mocks.listFfmpegCapabilities
  };
});

vi.mock("./ffmpeg-resolve", () => ({
  resolveFfmpegExecutable: mocks.resolveFfmpegExecutable,
  resolveFfprobeExecutable: mocks.resolveFfprobeExecutable
}));

vi.mock("node:child_process", () => ({
  spawn: mocks.spawn,
  default: { spawn: mocks.spawn }
}));

vi.mock("node:https", () => ({
  get: mocks.httpsGet,
  default: { get: mocks.httpsGet }
}));

const { wireIpcHandlers, loadSettings } = await import("./ipc-handlers");

// ── Yardımcılar ──────────────────────────────────────────────────────────────

let tmpDir = "";
let host: {
  setTaskbarProgress: Mock<(progress: number | null) => void>;
  updateTrayMenu: Mock<(statusLabel: string) => void>;
  notifyCompletion: Mock<(title: string, body: string) => void>;
};

/** Renderer'a gönderilen mesajları toplayan sahte `event`. */
function makeEvent() {
  const sent: { channel: string; payload: unknown }[] = [];
  return {
    sent,
    event: {
      sender: {
        isDestroyed: () => false,
        send: (channel: string, payload: unknown) => {
          sent.push({ channel, payload });
        }
      }
    }
  };
}

async function invoke(channel: string, payload?: unknown, event: unknown = makeEvent().event) {
  const handler = mocks.handlers.get(channel);
  if (!handler) throw new Error(`Kanal bağlanmamış: ${channel}`);
  return await handler(event, payload);
}

/** ffmpeg'e geçirilen son argüman dizisi. */
function lastFfmpegArgs(): string[] {
  const call = mocks.runFfmpegJob.mock.calls.at(-1);
  if (!call) throw new Error("runFfmpegJob hiç çağrılmadı");
  return call[1] as string[];
}

function tmpPath(...parts: string[]) {
  return path.join(tmpDir, ...parts);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lpc-ipc-"));
  mocks.userDataDir.value = tmpDir;

  vi.clearAllMocks();
  mocks.handlers.clear();

  mocks.resolveFfmpegExecutable.mockReturnValue("/fake/ffmpeg");
  mocks.resolveFfprobeExecutable.mockReturnValue("/fake/ffprobe");
  mocks.runFfmpegJob.mockResolvedValue({ ok: true, code: 0 });
  mocks.runFfprobeJson.mockResolvedValue({
    ok: true,
    json: { format: { duration: "12.5", format_name: "mov,mp4" }, streams: [] }
  });
  mocks.probeFfmpegVersion.mockResolvedValue({ ok: true, stdout: "ffmpeg version 7.1\nbuilt with" });
  mocks.listFfmpegCapabilities.mockResolvedValue({
    ok: true,
    value: { encoders: ["libx264"], decoders: ["h264"], hwaccels: ["videotoolbox"] }
  });

  host = {
    setTaskbarProgress: vi.fn<(progress: number | null) => void>(),
    updateTrayMenu: vi.fn<(statusLabel: string) => void>(),
    notifyCompletion: vi.fn<(title: string, body: string) => void>()
  };

  loadSettings();
  wireIpcHandlers(host);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Bağlantı ─────────────────────────────────────────────────────────────────

describe("kanal bağlantısı", () => {
  it("her handler kanalı bağlanıyor", () => {
    for (const channel of HANDLER_CHANNELS) {
      expect(mocks.handlers.has(channel), `bağlanmamış kanal: ${channel}`).toBe(true);
    }
    expect(mocks.handlers.size).toBe(HANDLER_CHANNELS.length);
  });

  it("ilerleme ve log kanalları handler almıyor — ters yönde çalışıyorlar", () => {
    expect(mocks.handlers.has(RUN_CONVERT_PROGRESS_CHANNEL)).toBe(false);
    expect(mocks.handlers.has(RUN_CONVERT_LOG_CHANNEL)).toBe(false);
  });

  it("iki kez bağlamak handler sayısını çoğaltmıyor", () => {
    wireIpcHandlers(host);
    expect(mocks.handlers.size).toBe(HANDLER_CHANNELS.length);
  });
});

// ── FFmpeg sürümü / probe / yetenekler ───────────────────────────────────────

describe(VERSION_CHANNEL, () => {
  it("çıktıdan sürüm satırını seçiyor", async () => {
    mocks.probeFfmpegVersion.mockResolvedValue({
      ok: true,
      stdout: "configuration: --foo\nffmpeg version 7.1 Copyright\nlibavutil 58"
    });
    expect(await invoke(VERSION_CHANNEL, {})).toEqual({
      ok: true,
      versionLine: "ffmpeg version 7.1 Copyright"
    });
  });

  it("ikili çözümlenemezse hata mesajını geçiriyor", async () => {
    mocks.resolveFfmpegExecutable.mockImplementation(() => {
      throw new Error("Gömülü ikililer yok.");
    });
    expect(await invoke(VERSION_CHANNEL, {})).toEqual({
      ok: false,
      message: "Gömülü ikililer yok."
    });
  });

  it("ffmpeg hata verirse stderr'i döndürüyor", async () => {
    mocks.probeFfmpegVersion.mockResolvedValue({ ok: false, stderr: "izin yok", code: 126 });
    expect(await invoke(VERSION_CHANNEL, {})).toEqual({ ok: false, message: "izin yok" });
  });
});

describe(PROBE_CHANNEL, () => {
  it("ffprobe JSON'unu özete çeviriyor", async () => {
    mocks.runFfprobeJson.mockResolvedValue({
      ok: true,
      json: {
        format: { format_name: "mov,mp4,m4a", duration: "42" },
        streams: [
          { codec_type: "video", codec_name: "h264" },
          { codec_type: "audio", codec_name: "aac" }
        ]
      }
    });
    const res = (await invoke(PROBE_CHANNEL, { inputPath: "/a/b.mp4" })) as {
      ok: true;
      summary: { hasVideo: boolean; hasAudio: boolean; durationSec: number };
    };
    expect(res.ok).toBe(true);
    expect(res.summary.hasVideo).toBe(true);
    expect(res.summary.hasAudio).toBe(true);
    expect(res.summary.durationSec).toBe(42);
  });

  it("inputPath yoksa reddediyor", async () => {
    expect(await invoke(PROBE_CHANNEL, {})).toEqual({
      ok: false,
      message: "Geçersiz parametre paketi."
    });
  });
});

describe(CAPABILITIES_CHANNEL, () => {
  it("çözümlenen ikiliyle sorguluyor", async () => {
    const res = await invoke(CAPABILITIES_CHANNEL, {});
    expect(mocks.listFfmpegCapabilities).toHaveBeenCalledWith("/fake/ffmpeg");
    expect(res).toMatchObject({ ok: true });
  });
});

// ── Diyaloglar ───────────────────────────────────────────────────────────────

describe(OPEN_MEDIA_CHANNEL, () => {
  it("seçilen yolu döndürüyor", async () => {
    mocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ["/a/b.mp4"] });
    expect(await invoke(OPEN_MEDIA_CHANNEL, {})).toEqual({
      canceled: false,
      filePath: "/a/b.mp4"
    });
  });

  it("iptal edilirse canceled dönüyor", async () => {
    mocks.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    expect(await invoke(OPEN_MEDIA_CHANNEL, {})).toEqual({ canceled: true });
  });
});

describe(SAVE_OUTPUT_CHANNEL, () => {
  it("varsayılan yolu ve filtreleri diyaloğa geçiriyor", async () => {
    mocks.showSaveDialog.mockResolvedValue({ canceled: false, filePath: "/out/x.mp4" });
    const res = await invoke(SAVE_OUTPUT_CHANNEL, {
      defaultPath: "/out/x.mp4",
      filters: [{ name: "Video", extensions: ["mp4"] }],
      title: "Kaydet"
    });
    expect(mocks.showSaveDialog.mock.calls[0]?.[1]).toMatchObject({
      defaultPath: "/out/x.mp4",
      title: "Kaydet"
    });
    expect(res).toEqual({ canceled: false, filePath: "/out/x.mp4" });
  });

  it("geçersiz paketi sessizce iptale çeviriyor", async () => {
    expect(await invoke(SAVE_OUTPUT_CHANNEL, { defaultPath: "" })).toEqual({ canceled: true });
  });
});

// ── Dönüşüm ──────────────────────────────────────────────────────────────────

const baseSpec = {
  inputPath: "/in/a.mov",
  outputPath: "/out/a.mp4",
  mode: "transcode" as const,
  container: "mp4",
  videoEncoder: "libx264" as const,
  audioEncoder: "aac" as const
};

describe(RUN_CONVERT_CHANNEL, () => {
  it("spec'ten gerçek ffmpeg argümanları kuruyor", async () => {
    const res = await invoke(RUN_CONVERT_CHANNEL, { spec: baseSpec });
    expect(res).toEqual({ ok: true });
    const args = lastFfmpegArgs();
    expect(args).toContain("/in/a.mov");
    expect(args).toContain("/out/a.mp4");
    expect(args).toContain("libx264");
    expect(mocks.runFfmpegJob.mock.calls[0]?.[0]).toBe("/fake/ffmpeg");
  });

  it("geçersiz spec'te hangi alanın bozuk olduğunu söylüyor", async () => {
    const res = (await invoke(RUN_CONVERT_CHANNEL, {
      spec: { ...baseSpec, mode: "büyüle" }
    })) as { ok: false; message: string };
    expect(res.ok).toBe(false);
    expect(res.message).toContain("Geçersiz dönüşüm paketi");
    expect(res.message).toContain("mode");
    expect(mocks.runFfmpegJob).not.toHaveBeenCalled();
  });

  it("ilerlemeyi renderer'a ve görev çubuğuna iletiyor", async () => {
    mocks.runFfmpegJob.mockImplementation(
      async (_exe: string, _args: string[], opts: { onProgress?: (p: number) => void }) => {
        opts.onProgress?.(42);
        return { ok: true, code: 0 };
      }
    );
    const { event, sent } = makeEvent();
    await invoke(RUN_CONVERT_CHANNEL, { spec: baseSpec }, event);
    expect(sent).toContainEqual({
      channel: RUN_CONVERT_PROGRESS_CHANNEL,
      payload: { percent: 42 }
    });
    expect(host.setTaskbarProgress).toHaveBeenCalledWith(42);
  });

  it("ffmpeg log satırlarını ayrı kanaldan iletiyor", async () => {
    mocks.runFfmpegJob.mockImplementation(
      async (_exe: string, _args: string[], opts: { onLog?: (l: string) => void }) => {
        opts.onLog?.("frame= 10 fps=0.0");
        return { ok: true, code: 0 };
      }
    );
    const { event, sent } = makeEvent();
    await invoke(RUN_CONVERT_CHANNEL, { spec: baseSpec }, event);
    expect(sent).toContainEqual({
      channel: RUN_CONVERT_LOG_CHANNEL,
      payload: { line: "frame= 10 fps=0.0" }
    });
  });

  it("başarıda çıktı adıyla bildirim gönderiyor", async () => {
    await invoke(RUN_CONVERT_CHANNEL, { spec: baseSpec });
    expect(host.notifyCompletion).toHaveBeenCalledWith("Dönüşüm Tamamlandı", "a.mp4");
  });

  it("hedef boyut istendiğinde kaynağı ffprobe ile ölçüyor (D-04/D-17)", async () => {
    await invoke(RUN_CONVERT_CHANNEL, {
      spec: { ...baseSpec, videoHints: { targetSizeMb: 8 } }
    });
    expect(mocks.runFfprobeJson).toHaveBeenCalledWith("/fake/ffprobe", "/in/a.mov");
  });

  it("hedef boyut yokken gereksiz probe yapmıyor", async () => {
    await invoke(RUN_CONVERT_CHANNEL, { spec: baseSpec });
    expect(mocks.runFfprobeJson).not.toHaveBeenCalled();
  });

  it("görüntü çıktısı sınırın altına inmezse kaç MB kaldığını söylüyor (D-09)", async () => {
    const outputPath = tmpPath("big.jpg");
    // Her denemede aynı büyük dosya: kademeler tükenir, handler pes etmeli.
    mocks.runFfmpegJob.mockImplementation(async () => {
      fs.writeFileSync(outputPath, Buffer.alloc(3 * 1024 * 1024));
      return { ok: true, code: 0 };
    });
    const res = (await invoke(RUN_CONVERT_CHANNEL, {
      spec: {
        ...baseSpec,
        outputPath,
        container: "jpg",
        videoEncoder: "mjpeg",
        videoHints: { targetSizeMb: 1, width: 1920, height: 1080 }
      }
    })) as { ok: false; message: string };
    expect(res.ok).toBe(false);
    expect(res.message).toContain("1.00 MB");
    expect(res.message).toContain("3.00 MB");
    // Tek denemede pes etmemiş olmalı: kalite kademeleri denendi.
    expect(mocks.runFfmpegJob.mock.calls.length).toBeGreaterThan(1);
  });
});

describe(CANCEL_CONVERT_CHANNEL, () => {
  it("koşan işin sinyalini iptal ediyor", async () => {
    let captured: AbortSignal | undefined;
    mocks.runFfmpegJob.mockImplementation(
      async (_exe: string, _args: string[], opts: { signal?: AbortSignal }) => {
        captured = opts.signal;
        await invoke(CANCEL_CONVERT_CHANNEL, {});
        return { ok: false, code: null, stderr: "" };
      }
    );
    const res = await invoke(RUN_CONVERT_CHANNEL, { spec: baseSpec });
    expect(captured?.aborted).toBe(true);
    expect(res).toMatchObject({ ok: false, message: "İptal edildi." });
  });
});

// ── Önizleme / klasör / kabuk ────────────────────────────────────────────────

describe(READ_PREVIEW_CHANNEL, () => {
  it("görüntüyü data URL olarak döndürüyor", async () => {
    const p = tmpPath("x.png");
    fs.writeFileSync(p, Buffer.from([1, 2, 3]));
    const res = (await invoke(READ_PREVIEW_CHANNEL, { filePath: p })) as {
      ok: true;
      dataUrl: string;
    };
    expect(res.ok).toBe(true);
    expect(res.dataUrl).toBe(`data:image/png;base64,${Buffer.from([1, 2, 3]).toString("base64")}`);
  });

  it("desteklenmeyen uzantıyı reddediyor", async () => {
    expect(await invoke(READ_PREVIEW_CHANNEL, { filePath: tmpPath("x.mp4") })).toEqual({
      ok: false,
      message: "Bu format için önizleme desteklenmiyor."
    });
  });

  it("göreli yolu yol koruması reddediyor", async () => {
    const res = (await invoke(READ_PREVIEW_CHANNEL, { filePath: "../../etc/passwd" })) as {
      ok: false;
      message: string;
    };
    expect(res.ok).toBe(false);
    expect(res.message).toContain("mutlak olmalı");
  });
});

describe(GET_OUTPUT_DIR_CHANNEL, () => {
  it("çıktı klasörünü oluşturuyor", async () => {
    const res = (await invoke(GET_OUTPUT_DIR_CHANNEL, {})) as { ok: true; dir: string };
    expect(res.ok).toBe(true);
    expect(fs.existsSync(res.dir)).toBe(true);
  });
});

describe(SHOW_IN_FOLDER_CHANNEL, () => {
  it("normalize edilmiş yolu kabuğa veriyor", async () => {
    await invoke(SHOW_IN_FOLDER_CHANNEL, { filePath: tmpPath("a", "..", "b.mp4") });
    expect(mocks.showItemInFolder).toHaveBeenCalledWith(tmpPath("b.mp4"));
  });

  it("göreli yolda kabuğu hiç çağırmıyor", async () => {
    await invoke(SHOW_IN_FOLDER_CHANNEL, { filePath: "b.mp4" });
    expect(mocks.showItemInFolder).not.toHaveBeenCalled();
  });
});

// ── Ayarlar ──────────────────────────────────────────────────────────────────

describe(`${SETTINGS_GET_CHANNEL} / ${SETTINGS_SET_CHANNEL}`, () => {
  it("varsayılan kaliteyi kaydedip geri okuyor", async () => {
    expect(await invoke(SETTINGS_SET_CHANNEL, { defaultQuality: "small" })).toEqual({ ok: true });
    expect(await invoke(SETTINGS_GET_CHANNEL, {})).toMatchObject({ defaultQuality: "small" });
  });

  it("GÜVENLİK: renderer'dan gelen ham outputDir reddediliyor (D-01)", async () => {
    expect(await invoke(SETTINGS_SET_CHANNEL, { outputDir: "/tmp/evil" })).toEqual({
      ok: false,
      message: "Geçersiz ayar paketi."
    });
    expect(await invoke(SETTINGS_GET_CHANNEL, {})).not.toHaveProperty("outputDir");
  });

  it("GÜVENLİK: renderer'dan gelen ham ffmpegBinary reddediliyor (D-01)", async () => {
    expect(await invoke(SETTINGS_SET_CHANNEL, { ffmpegBinary: "/tmp/backdoor" })).toEqual({
      ok: false,
      message: "Geçersiz ayar paketi."
    });
  });

  it("çıktı klasörü yalnızca ana süreçteki diyalogdan geliyor", async () => {
    mocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ["/picked/dir"] });
    expect(await invoke(SETTINGS_SET_CHANNEL, { pickOutputDir: true })).toEqual({ ok: true });
    expect(await invoke(SETTINGS_GET_CHANNEL, {})).toMatchObject({ outputDir: "/picked/dir" });
  });

  it("seçilen ffmpeg ikilisi doğrulanamazsa kaydedilmiyor", async () => {
    mocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ["/not/ffmpeg"] });
    mocks.resolveFfmpegExecutable.mockImplementation(() => {
      throw new Error("çalıştırılabilir değil");
    });
    expect(await invoke(SETTINGS_SET_CHANNEL, { pickFfmpegBinary: true })).toEqual({
      ok: false,
      message: "çalıştırılabilir değil"
    });
    expect(await invoke(SETTINGS_GET_CHANNEL, {})).not.toHaveProperty("ffmpegBinary");
  });

  it("ayarlar diske yazılıyor ve yeniden yüklenince duruyor", async () => {
    await invoke(SETTINGS_SET_CHANNEL, { defaultQuality: "high" });
    loadSettings();
    expect(await invoke(SETTINGS_GET_CHANNEL, {})).toMatchObject({ defaultQuality: "high" });
  });
});

// ── Profiller ────────────────────────────────────────────────────────────────

describe("profil kanalları", () => {
  it("kaydet → listele → sil turu", async () => {
    expect(await invoke(PROFILES_GET_CHANNEL, {})).toEqual([]);

    expect(
      await invoke(PROFILES_SAVE_CHANNEL, { name: "Arşiv", targetProfileId: "mp4-h264-aac" })
    ).toEqual({ ok: true });

    const saved = (await invoke(PROFILES_GET_CHANNEL, {})) as { id: string; name: string }[];
    expect(saved).toHaveLength(1);
    expect(saved[0]?.name).toBe("Arşiv");

    expect(await invoke(PROFILES_DELETE_CHANNEL, { id: saved[0]!.id })).toEqual({ ok: true });
    expect(await invoke(PROFILES_GET_CHANNEL, {})).toEqual([]);
  });

  it("aynı id ile kaydetmek yeni kayıt eklemiyor, üzerine yazıyor", async () => {
    await invoke(PROFILES_SAVE_CHANNEL, { name: "A", targetProfileId: "mp4-h264-aac" });
    const [first] = (await invoke(PROFILES_GET_CHANNEL, {})) as { id: string }[];
    await invoke(PROFILES_SAVE_CHANNEL, {
      id: first!.id,
      name: "B",
      targetProfileId: "mp4-h264-aac"
    });
    const all = (await invoke(PROFILES_GET_CHANNEL, {})) as { name: string }[];
    expect(all).toHaveLength(1);
    expect(all[0]?.name).toBe("B");
  });

  it("adsız profili reddediyor", async () => {
    expect(await invoke(PROFILES_SAVE_CHANNEL, { name: "  ", targetProfileId: "x" })).toMatchObject(
      { ok: false }
    );
  });
});

// ── Birleştirme ──────────────────────────────────────────────────────────────

describe(AUDIO_MERGE_CHANNEL, () => {
  it("concat modunda concat filtresi kuruyor", async () => {
    await invoke(AUDIO_MERGE_CHANNEL, {
      inputPaths: ["/a/1.mp3", "/a/2.mp3"],
      outputPath: tmpPath("out.mp3"),
      mode: "concat",
      outputEncoder: "libmp3lame"
    });
    const args = lastFfmpegArgs();
    expect(args.join(" ")).toContain("[0:a][1:a]concat=n=2:v=0:a=1[a]");
    expect(args).toContain("libmp3lame");
  });

  it("mix modunda amix filtresi kuruyor", async () => {
    await invoke(AUDIO_MERGE_CHANNEL, {
      inputPaths: ["/a/1.mp3", "/a/2.mp3", "/a/3.mp3"],
      outputPath: tmpPath("out.mp3"),
      mode: "mix"
    });
    expect(lastFfmpegArgs().join(" ")).toContain("[0:a][1:a][2:a]amix=inputs=3");
  });

  it("tek girdiyi reddediyor", async () => {
    const res = await invoke(AUDIO_MERGE_CHANNEL, {
      inputPaths: ["/a/1.mp3"],
      outputPath: tmpPath("out.mp3")
    });
    expect(res).toMatchObject({ ok: false });
    expect(mocks.runFfmpegJob).not.toHaveBeenCalled();
  });

  it("sistem dizinine yazmayı reddediyor", async () => {
    const res = (await invoke(AUDIO_MERGE_CHANNEL, {
      inputPaths: ["/a/1.mp3", "/a/2.mp3"],
      outputPath: "/usr/bin/out.mp3"
    })) as { ok: false; message: string };
    expect(res.ok).toBe(false);
    expect(res.message).toContain("korumalı sistem dizini");
  });
});

describe(VIDEO_MERGE_CHANNEL, () => {
  const uniform = {
    ok: true as const,
    json: {
      format: { duration: "10" },
      streams: [
        { codec_type: "video", codec_name: "h264", width: 1920, height: 1080, r_frame_rate: "30/1" },
        { codec_type: "audio", codec_name: "aac" }
      ]
    }
  };

  it("aynı ölçüdeki girdilerde concat listesi yazıp copy stratejisi seçiyor (D-05)", async () => {
    mocks.runFfprobeJson.mockResolvedValue(uniform);
    const outputPath = tmpPath("merged.mp4");
    let listExisted = false;
    mocks.runFfmpegJob.mockImplementation(async () => {
      listExisted = fs.existsSync(`${outputPath}.concat-list.txt`);
      return { ok: true, code: 0 };
    });
    await invoke(VIDEO_MERGE_CHANNEL, {
      inputPaths: ["/a/1.mp4", "/a/2.mp4"],
      outputPath
    });
    expect(listExisted).toBe(true);
    expect(lastFfmpegArgs()).toContain("concat");
    // Geçici liste dosyası iş bitince siliniyor.
    expect(fs.existsSync(`${outputPath}.concat-list.txt`)).toBe(false);
  });

  it("ölçüleri farklı girdilerde filtre stratejisine geçiyor (D-05)", async () => {
    mocks.runFfprobeJson
      .mockResolvedValueOnce(uniform)
      .mockResolvedValueOnce({
        ok: true,
        json: {
          format: { duration: "10" },
          streams: [
            { codec_type: "video", codec_name: "h264", width: 640, height: 480, r_frame_rate: "25/1" },
            { codec_type: "audio", codec_name: "aac" }
          ]
        }
      });
    await invoke(VIDEO_MERGE_CHANNEL, {
      inputPaths: ["/a/1.mp4", "/a/2.mp4"],
      outputPath: tmpPath("merged.mp4")
    });
    expect(lastFfmpegArgs().join(" ")).toContain("filter_complex");
  });

  it("video akışı olmayan girdiyi adıyla reddediyor", async () => {
    mocks.runFfprobeJson.mockResolvedValue({
      ok: true,
      json: { format: { duration: "10" }, streams: [{ codec_type: "audio", codec_name: "aac" }] }
    });
    const res = (await invoke(VIDEO_MERGE_CHANNEL, {
      inputPaths: ["/a/1.mp4", "/a/2.mp4"],
      outputPath: tmpPath("merged.mp4")
    })) as { ok: false; message: string };
    expect(res.ok).toBe(false);
    expect(res.message).toContain("1.mp4");
    expect(mocks.runFfmpegJob).not.toHaveBeenCalled();
  });

  it("okunamayan girdide ffmpeg'i hiç başlatmıyor", async () => {
    mocks.runFfprobeJson.mockResolvedValue({ ok: false, message: "bozuk" });
    const res = (await invoke(VIDEO_MERGE_CHANNEL, {
      inputPaths: ["/a/1.mp4", "/a/2.mp4"],
      outputPath: tmpPath("merged.mp4")
    })) as { ok: false; message: string };
    expect(res.message).toContain("bozuk");
    expect(mocks.runFfmpegJob).not.toHaveBeenCalled();
  });
});

// ── Kare / GIF / APNG ────────────────────────────────────────────────────────

describe(FRAME_EXTRACT_CHANNEL, () => {
  it("aralığı fps filtresine çeviriyor ve klasörü açıyor", async () => {
    const outputDir = tmpPath("frames");
    await invoke(FRAME_EXTRACT_CHANNEL, {
      inputPath: "/a/1.mp4",
      outputDir,
      intervalSec: 2,
      format: "jpg"
    });
    const args = lastFfmpegArgs();
    expect(args).toContain("fps=1/2");
    expect(args.at(-1)).toBe(path.join(outputDir, "frame-%04d.jpg"));
    expect(fs.existsSync(outputDir)).toBe(true);
  });
});

describe(GIF_CONVERT_CHANNEL, () => {
  it("palettegen + paletteuse zincirini kuruyor", async () => {
    await invoke(GIF_CONVERT_CHANNEL, {
      inputPath: "/a/1.mp4",
      outputPath: tmpPath("out.gif"),
      fps: 12,
      width: 320,
      loop: 0
    });
    const joined = lastFfmpegArgs().join(" ");
    expect(joined).toContain("fps=12,scale=320:-1:flags=lanczos");
    expect(joined).toContain("palettegen");
    expect(joined).toContain("paletteuse");
  });
});

describe(APNG_CONVERT_CHANNEL, () => {
  it("apng formatı ve tekrar sayısını geçiriyor", async () => {
    await invoke(APNG_CONVERT_CHANNEL, {
      inputPath: "/a/1.mp4",
      outputPath: tmpPath("out.png"),
      fps: 20,
      width: 240,
      plays: 3
    });
    const args = lastFfmpegArgs();
    expect(args).toContain("apng");
    expect(args[args.indexOf("-plays") + 1]).toBe("3");
  });
});

// ── Altyazı ──────────────────────────────────────────────────────────────────

describe(SUBTITLE_PROBE_CHANNEL, () => {
  it("yalnızca altyazı akışlarını global indeksleriyle döndürüyor", async () => {
    mocks.runFfprobeJson.mockResolvedValue({
      ok: true,
      json: {
        format: {},
        streams: [
          { codec_type: "video", codec_name: "h264" },
          { codec_type: "audio", codec_name: "aac" },
          { codec_type: "subtitle", codec_name: "subrip", tags: { title: "TR", language: "tur" } }
        ]
      }
    });
    const res = (await invoke(SUBTITLE_PROBE_CHANNEL, { inputPath: "/a/1.mkv" })) as {
      ok: true;
      streams: { index: number; codecName: string; title: string; language: string }[];
    };
    expect(res.streams).toEqual([
      { index: 2, codecName: "subrip", title: "TR", language: "tur" }
    ]);
  });
});

describe(SUBTITLE_EXTRACT_CHANNEL, () => {
  it("kaynak codec'e göre metin dönüştürmesi kuruyor (D-06)", async () => {
    mocks.runFfprobeJson.mockResolvedValue({
      ok: true,
      json: { format: {}, streams: [{ codec_type: "subtitle", codec_name: "ass" }] }
    });
    await invoke(SUBTITLE_EXTRACT_CHANNEL, {
      inputPath: "/a/1.mkv",
      outputPath: tmpPath("out.srt"),
      streamIndex: 0
    });
    const args = lastFfmpegArgs();
    expect(args).toContain("-map");
    expect(args.join(" ")).toContain("0:0");
    expect(args.at(-1)).toBe(tmpPath("out.srt"));
  });

  it("bitmap altyazıyı metne çevirmeyi reddediyor (D-06)", async () => {
    mocks.runFfprobeJson.mockResolvedValue({
      ok: true,
      json: { format: {}, streams: [{ codec_type: "subtitle", codec_name: "hdmv_pgs_subtitle" }] }
    });
    const res = (await invoke(SUBTITLE_EXTRACT_CHANNEL, {
      inputPath: "/a/1.mkv",
      outputPath: tmpPath("out.srt"),
      streamIndex: 0
    })) as { ok: false; message: string };
    expect(res.ok).toBe(false);
    expect(mocks.runFfmpegJob).not.toHaveBeenCalled();
  });
});

// ── Kırpma / normalizasyon / filigran ────────────────────────────────────────

describe(VIDEO_TRIM_CHANNEL, () => {
  it("stream copy ile kırpıyor", async () => {
    await invoke(VIDEO_TRIM_CHANNEL, {
      inputPath: "/a/1.mp4",
      outputPath: tmpPath("cut.mp4"),
      startSec: 5,
      endSec: 12,
      streamCopy: true
    });
    const args = lastFfmpegArgs();
    expect(args).toContain("copy");
    expect(args.join(" ")).toContain("5");
  });

  it("bitiş başlangıçtan küçükse ffmpeg'i çalıştırmıyor", async () => {
    const res = await invoke(VIDEO_TRIM_CHANNEL, {
      inputPath: "/a/1.mp4",
      outputPath: tmpPath("cut.mp4"),
      startSec: 20,
      endSec: 10
    });
    expect(res).toEqual({ ok: false, message: "Bitiş zamanı başlangıçtan büyük olmalı." });
    expect(mocks.runFfmpegJob).not.toHaveBeenCalled();
  });
});

describe(AUDIO_NORMALIZE_CHANNEL, () => {
  const measurement = JSON.stringify({
    input_i: "-23.5",
    input_tp: "-5.2",
    input_lra: "7.1",
    input_thresh: "-34.1",
    target_offset: "0.3"
  });

  it("iki geçiş yapıyor: önce ölçüm, sonra ölçülen değerlerle düzeltme", async () => {
    mocks.runFfmpegJob.mockImplementation(
      async (_exe: string, args: string[], opts: { onLog?: (l: string) => void }) => {
        if (args.includes("-f") && args.includes("null")) {
          for (const line of measurement.split("\n")) opts.onLog?.(line);
        }
        return { ok: true, code: 0 };
      }
    );
    await invoke(AUDIO_NORMALIZE_CHANNEL, {
      inputPath: "/a/1.wav",
      outputPath: tmpPath("norm.wav"),
      targetLufs: -14
    });
    expect(mocks.runFfmpegJob.mock.calls.length).toBe(2);
    expect(lastFfmpegArgs().join(" ")).toContain("measured_I=-23.5");
  });

  it("ölçüm alınamazsa tek geçişe düşüyor", async () => {
    // onLog hiç çağrılmıyor → ayrıştırılacak JSON yok.
    await invoke(AUDIO_NORMALIZE_CHANNEL, {
      inputPath: "/a/1.wav",
      outputPath: tmpPath("norm.wav")
    });
    expect(mocks.runFfmpegJob.mock.calls.length).toBe(2);
    expect(lastFfmpegArgs().join(" ")).not.toContain("measured_I");
  });
});

describe(WATERMARK_CHANNEL, () => {
  it("GÜVENLİK: metin filtregrafa gömülmüyor, textfile ile geçiyor (D-07)", async () => {
    const outputPath = tmpPath("wm.mp4");
    let fileContent = "";
    mocks.runFfmpegJob.mockImplementation(async () => {
      fileContent = fs.readFileSync(`${outputPath}.watermark-text.txt`, "utf8");
      return { ok: true, code: 0 };
    });
    const tricky = "12:34 100% it's";
    await invoke(WATERMARK_CHANNEL, {
      inputPath: "/a/1.mp4",
      outputPath,
      mode: "text",
      text: tricky,
      position: "bottomright"
    });
    const joined = lastFfmpegArgs().join(" ");
    expect(fileContent).toBe(tricky);
    expect(joined).toContain("textfile=");
    expect(joined).toContain("expansion=none");
    expect(joined).not.toContain(tricky);
    // Geçici metin dosyası iş bitince siliniyor.
    expect(fs.existsSync(`${outputPath}.watermark-text.txt`)).toBe(false);
  });

  it("görsel modda overlay zinciri kuruyor", async () => {
    await invoke(WATERMARK_CHANNEL, {
      inputPath: "/a/1.mp4",
      outputPath: tmpPath("wm.mp4"),
      mode: "image",
      imagePath: "/a/logo.png",
      position: "topleft",
      opacity: 0.4
    });
    const joined = lastFfmpegArgs().join(" ");
    expect(joined).toContain("colorchannelmixer=aa=0.4");
    expect(joined).toContain("overlay=10:10");
  });

  it("görsel modda imagePath yoksa reddediyor", async () => {
    const res = await invoke(WATERMARK_CHANNEL, {
      inputPath: "/a/1.mp4",
      outputPath: tmpPath("wm.mp4"),
      mode: "image"
    });
    expect(res).toMatchObject({ ok: false });
    expect(mocks.runFfmpegJob).not.toHaveBeenCalled();
  });
});

// ── Metadata ─────────────────────────────────────────────────────────────────

describe(METADATA_READ_CHANNEL, () => {
  it("format etiketlerini küçük harfe indiriyor", async () => {
    mocks.runFfprobeJson.mockResolvedValue({
      ok: true,
      json: { format: { tags: { TITLE: "Bir Film", Artist: "X" } }, streams: [] }
    });
    expect(await invoke(METADATA_READ_CHANNEL, { inputPath: "/a/1.mp4" })).toEqual({
      ok: true,
      tags: { title: "Bir Film", artist: "X" }
    });
  });
});

describe(METADATA_WRITE_CHANNEL, () => {
  it("etiketleri -metadata çiftlerine çevirip stream copy yapıyor", async () => {
    await invoke(METADATA_WRITE_CHANNEL, {
      inputPath: "/a/1.mp4",
      outputPath: tmpPath("tagged.mp4"),
      tags: { title: "Yeni", artist: "Y" }
    });
    const args = lastFfmpegArgs();
    expect(args).toContain("title=Yeni");
    expect(args).toContain("artist=Y");
    expect(args.join(" ")).toContain("-c copy");
  });

  it("geçersiz etiket adını reddediyor", async () => {
    const res = await invoke(METADATA_WRITE_CHANNEL, {
      inputPath: "/a/1.mp4",
      outputPath: tmpPath("tagged.mp4"),
      tags: { "bad key!": "v" }
    });
    expect(res).toMatchObject({ ok: false });
    expect(mocks.runFfmpegJob).not.toHaveBeenCalled();
  });
});

// ── PDF ──────────────────────────────────────────────────────────────────────

describe(PDF_CONVERT_CHANNEL, () => {
  function fakeProc(behaviour: (proc: EventEmitter & { stderr: EventEmitter }) => void) {
    const proc = Object.assign(new EventEmitter(), { stderr: new EventEmitter() });
    queueMicrotask(() => behaviour(proc));
    return proc;
  }

  it("pdftoppm'i doğrulanmış bayraklarla çağırıyor", async () => {
    const pdf = tmpPath("belge.pdf");
    fs.writeFileSync(pdf, "%PDF-1.4");
    mocks.spawn.mockImplementation(() => fakeProc((p) => p.emit("close", 0)));

    const res = (await invoke(PDF_CONVERT_CHANNEL, {
      inputPath: pdf,
      format: "jpeg",
      dpi: 200
    })) as { ok: true; outputDir: string };

    expect(res.ok).toBe(true);
    const [cmd, args, opts] = mocks.spawn.mock.calls[0] as [string, string[], { shell: boolean }];
    expect(cmd).toBe("pdftoppm");
    expect(args).toContain("-jpeg");
    expect(args[args.indexOf("-r") + 1]).toBe("200");
    // Kabuk enjeksiyonuna kapalı.
    expect(opts.shell).toBe(false);
    expect(fs.existsSync(res.outputDir)).toBe(true);
  });

  it("pdftoppm kurulu değilse kurulum ipucu veriyor", async () => {
    const pdf = tmpPath("belge.pdf");
    fs.writeFileSync(pdf, "%PDF-1.4");
    mocks.spawn.mockImplementation(() =>
      fakeProc((p) => {
        const err = Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" });
        p.emit("error", err);
      })
    );
    const res = (await invoke(PDF_CONVERT_CHANNEL, { inputPath: pdf })) as {
      ok: false;
      message: string;
    };
    expect(res.ok).toBe(false);
    expect(res.message).toContain("poppler");
  });

  it("GÜVENLİK: format enum dışı değeri reddediyor — bayrak enjeksiyonu", async () => {
    const res = await invoke(PDF_CONVERT_CHANNEL, {
      inputPath: tmpPath("belge.pdf"),
      format: "png -sync"
    });
    expect(res).toMatchObject({ ok: false });
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
});

// ── Güncelleme kontrolü ──────────────────────────────────────────────────────

describe(CHECK_UPDATE_CHANNEL, () => {
  function respondWith(body: string) {
    mocks.httpsGet.mockImplementation(
      (_options: unknown, cb: (res: EventEmitter) => void) => {
        const res = new EventEmitter();
        queueMicrotask(() => {
          cb(res);
          res.emit("data", Buffer.from(body));
          res.emit("end");
        });
        return Object.assign(new EventEmitter(), {
          setTimeout: () => undefined,
          destroy: () => undefined
        });
      }
    );
  }

  it("doğru depoyu sorguluyor (D-18)", async () => {
    respondWith(JSON.stringify({ tag_name: "v1.4.0", html_url: "https://x/releases/1.4.0" }));
    await invoke(CHECK_UPDATE_CHANNEL, {});
    const options = mocks.httpsGet.mock.calls[0]?.[0] as { hostname: string; path: string };
    expect(options.hostname).toBe("api.github.com");
    expect(options.path).toBe("/repos/Sergeant61/local-privacy-converter/releases/latest");
  });

  it("uzaktaki sürüm yeniyse güncelleme var diyor", async () => {
    respondWith(JSON.stringify({ tag_name: "v1.4.0", html_url: "https://x" }));
    expect(await invoke(CHECK_UPDATE_CHANNEL, {})).toMatchObject({
      ok: true,
      currentVersion: "1.3.0",
      latestVersion: "1.4.0",
      hasUpdate: true
    });
  });

  it("uzaktaki sürüm eskiyse güncelleme yok diyor — string karşılaştırması değil (D-18)", async () => {
    respondWith(JSON.stringify({ tag_name: "v1.2.9", html_url: "https://x" }));
    expect(await invoke(CHECK_UPDATE_CHANNEL, {})).toMatchObject({
      latestVersion: "1.2.9",
      hasUpdate: false
    });
  });

  it("bozuk yanıtta çökmüyor", async () => {
    respondWith("<html>502</html>");
    expect(await invoke(CHECK_UPDATE_CHANNEL, {})).toEqual({
      ok: false,
      message: "GitHub API yanıtı ayrıştırılamadı."
    });
  });

  it("ağ hatasını mesaja çeviriyor", async () => {
    mocks.httpsGet.mockImplementation(() => {
      const req = Object.assign(new EventEmitter(), {
        setTimeout: () => undefined,
        destroy: () => undefined
      });
      queueMicrotask(() => req.emit("error", new Error("ENOTFOUND")));
      return req;
    });
    expect(await invoke(CHECK_UPDATE_CHANNEL, {})).toEqual({
      ok: false,
      message: "Ağ hatası: ENOTFOUND"
    });
  });
});
