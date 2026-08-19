<script lang="ts">
  import { browser } from "$app/environment";
  import { onMount } from "svelte";

  import { buildFfmpegArgs } from "@lfc/ffmpeg-core/build-args";
  import type { ConvertJobSpec, VideoEncoderChoice } from "@lfc/types";
  import type { MediaProbeSummaryPayload } from "@lfc/validators";
  import { recordConversion } from "$lib/history/store";
  import {
    buildHtmlFileAccept,
    filterTargetsByEncoders,
    getAdvancedFieldsForProfile,
    getSimpleFieldsForProfile,
    getTargetsForSource,
    getTargetById,
    gpuEncoderForProfile,
    GPU_ENCODERS,
    isKnownInputExtension,
    normalizeExtension,
    buildProfileJobSpec,
    parseExtraFfmpegArgs,
    targetProfileToJobHints,
    type TargetProfileId
  } from "@lfc/media-formats";

  let filePath = $state<string | null>(null);
  let fileLabel = $state<string | null>(null);
  let probeError = $state<string | null>(null);
  let probeSummary = $state<MediaProbeSummaryPayload | null>(null);
  let capsLoading = $state(true);
  let capsError = $state<string | null>(null);
  let encoderSet = $state<Set<string>>(new Set());
  let hwaccels = $state<string[]>([]);
  let ffmpegVersion = $state<string | null>(null);

  type ResolutionPreset = "original" | "360p" | "480p" | "720p" | "1080p" | "1440p" | "2160p" | "custom";
  type AspectRatioPreset = "original" | "16:9" | "9:16" | "1:1" | "4:3" | "21:9" | "custom";

  let targetProfileId = $state<TargetProfileId>("mp4-h264-aac");
  let qualityPreset = $state<"high" | "compatible" | "balanced" | "small" | "very_small">("balanced");
  let resolutionPreset = $state<ResolutionPreset>("original");
  let customWidth = $state<number | null>(null);
  let aspectRatioPreset = $state<AspectRatioPreset>("original");
  let customAspectRatio = $state("16:9");
  let overrideVideoEncoder = $state<VideoEncoderChoice | "">("");
  let targetSizeMb = $state<number | null>(null);
  let extraFfmpegArgsRaw = $state("");
  let audioChannels = $state<"" | "1" | "2">("");
  let isDragging = $state(false);

  // ── Profil yönetimi ──────────────────────────────────────────────────────
  type UserProfile = {
    id: string;
    name: string;
    targetProfileId: string;
    qualityPreset?: string;
    resolutionPreset?: string;
    audioChannels?: number;
    extraFfmpegArgs?: string;
    createdAt: number;
  };
  let profiles = $state<UserProfile[]>([]);
  let profileSaveName = $state("");
  let showProfileSave = $state(false);

  async function loadProfilesList() {
    if (!hasLfc) return;
    try {
      profiles = await window.lfc.getProfiles();
    } catch { profiles = []; }
  }

  async function applyProfile(p: UserProfile) {
    targetProfileId = p.targetProfileId as typeof targetProfileId;
    if (p.qualityPreset) qualityPreset = p.qualityPreset as typeof qualityPreset;
    if (p.resolutionPreset) resolutionPreset = p.resolutionPreset as typeof resolutionPreset;
    if (p.audioChannels != null) audioChannels = String(p.audioChannels) as "" | "1" | "2";
    if (p.extraFfmpegArgs != null) extraFfmpegArgsRaw = p.extraFfmpegArgs;
  }

  async function saveCurrentProfile() {
    if (!hasLfc || !profileSaveName.trim()) return;
    const r = await window.lfc.saveProfile({
      name: profileSaveName.trim(),
      targetProfileId,
      qualityPreset,
      resolutionPreset,
      audioChannels: audioChannels !== "" ? Number(audioChannels) : undefined,
      extraFfmpegArgs: extraFfmpegArgsRaw || undefined
    });
    if (r.ok) {
      profileSaveName = "";
      showProfileSave = false;
      await loadProfilesList();
    }
  }

  async function deleteProfile(id: string) {
    if (!hasLfc) return;
    await window.lfc.deleteProfile(id);
    await loadProfilesList();
  }
  // ────────────────────────────────────────────────────────────────────────────

  let convertBusy = $state(false);
  let convertLog = $state<string[]>([]);
  let convertCancelled = $state(false);
  /** Dönüşüm yüzdesi (0–100); süre yoksa veya boşta `null`. */
  let convertProgress = $state<number | null>(null);
  let convertToast = $state<string | null>(null);

  let inputPreviewUrl = $state<string | null>(null);
  let videoPreviewUrl = $state<string | null>(null);
  let waveformPath = $state<string | null>(null);
  let waveformCanvas = $state<HTMLCanvasElement | null>(null);
  let outputPath = $state<string | null>(null);
  let outputPreviewUrl = $state<string | null>(null);

  const QUALITY_OPTIONS = [
    { value: "high",       label: "Yüksek kalite",    desc: "CRF 18 — en iyi görüntü, büyük dosya" },
    { value: "compatible", label: "Uyumlu",            desc: "CRF 20 — geniş cihaz desteği, kaliteli" },
    { value: "balanced",   label: "Dengeli (önerilen)",desc: "CRF 23 — iyi kalite, makul boyut" },
    { value: "small",      label: "Küçük dosya",       desc: "CRF 28 — belirgin sıkıştırma" },
    { value: "very_small", label: "Çok küçük",         desc: "CRF 35 — maksimum sıkıştırma, kayıp gözle görülür" },
  ] as const;

  const ENCODER_LABELS: Record<string, string> = {
    libx264:           "libx264 — CPU · orta hız",
    libx265:           "libx265 — CPU · yavaş (daha iyi sıkıştırma)",
    libsvtav1:         "libsvtav1 — CPU · yavaş (AV1, en iyi sıkıştırma)",
    libvpx_vp9:        "libvpx-vp9 — CPU · yavaş",
    h264_nvenc:        "h264_nvenc — NVIDIA GPU · çok hızlı",
    hevc_nvenc:        "hevc_nvenc — NVIDIA GPU · çok hızlı (H.265)",
    h264_videotoolbox: "h264_videotoolbox — Apple GPU · çok hızlı",
    hevc_videotoolbox: "hevc_videotoolbox — Apple GPU · çok hızlı (H.265)",
    h264_qsv:          "h264_qsv — Intel GPU · hızlı",
    hevc_qsv:          "hevc_qsv — Intel GPU · hızlı (H.265)",
    h264_amf:          "h264_amf — AMD GPU · hızlı",
    hevc_amf:          "hevc_amf — AMD GPU · hızlı (H.265)",
    h264_vaapi:        "h264_vaapi — VAAPI · hızlı (Linux)",
    hevc_vaapi:        "hevc_vaapi — VAAPI · hızlı Linux H.265)",
  };

  const RESOLUTION_OPTIONS: { value: ResolutionPreset; label: string }[] = [
    { value: "original", label: "Orijinal" },
    { value: "360p",     label: "360p — 640px" },
    { value: "480p",     label: "480p — 854px" },
    { value: "720p",     label: "720p — 1280px" },
    { value: "1080p",    label: "1080p — 1920px" },
    { value: "1440p",    label: "1440p / 2K — 2560px" },
    { value: "2160p",    label: "2160p / 4K — 3840px" },
    { value: "custom",   label: "Özel…" },
  ];

  const ASPECT_RATIO_OPTIONS: { value: AspectRatioPreset; label: string }[] = [
    { value: "original", label: "Orijinal" },
    { value: "16:9",     label: "16:9 — Yatay (TV / monitör)" },
    { value: "9:16",     label: "9:16 — Dikey (stories / reels)" },
    { value: "1:1",      label: "1:1 — Kare (Instagram feed)" },
    { value: "4:3",      label: "4:3 — Klasik TV" },
    { value: "21:9",     label: "21:9 — Sinematik (ultra-geniş)" },
    { value: "custom",   label: "Özel…" },
  ];

  const fileAccept = buildHtmlFileAccept();
  const hasLfc = browser && typeof window !== "undefined" && "lfc" in window && window.lfc;

  const targetsWithAvailability = $derived.by(() => {
    if (!probeSummary) {
      return [];
    }
    const kind = probeSummary.inferredKind ?? "video";
    const ext = normalizeExtension(fileLabel ?? "");
    const list = getTargetsForSource(ext, kind);
    return filterTargetsByEncoders(list, encoderSet);
  });

  const selectedRow = $derived(targetsWithAvailability.find((t) => t.profile.id === targetProfileId));

  const simpleFields = $derived(getSimpleFieldsForProfile(targetProfileId));
  const advancedFields = $derived(getAdvancedFieldsForProfile(targetProfileId));

  const groupedTargets = $derived.by(() => {
    const general = targetsWithAvailability.filter((r) => !r.profile.socialMeta);
    // Yerel toplama tablosu: $derived.by icinde kurulup atiliyor, reaktif durum degil.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const platforms = new Map<string, typeof targetsWithAvailability>();
    for (const row of targetsWithAvailability.filter((r) => !!r.profile.socialMeta)) {
      const key = row.profile.socialMeta!.platformLabelTr;
      if (!platforms.has(key)) platforms.set(key, []);
      platforms.get(key)!.push(row);
    }
    return { general, platforms };
  });

  /**
   * Bu hedef için kullanılabilir donanım kodlayıcısı; yoksa boş (profil varsayılanı).
   * Kodek ailesi eşlemesi `@lfc/media-formats` içinde ve orada sınanıyor
   * (ISTEMCI-TEST-RAPORU.md H-01).
   */
  function gpuEncoderFor(profileId: TargetProfileId): VideoEncoderChoice | "" {
    const profile = getTargetById(profileId);
    if (!profile?.hasVideoOut || probeSummary?.inferredKind === "image-only") return "";
    return gpuEncoderForProfile(profileId, encoderSet);
  }

  /**
   * Hedef format değiştiğinde donanım kodlayıcısı YENİDEN seçilir. Önceden yalnızca
   * dosya yüklenirken bir kez seçiliyordu; format sonradan değiştirilince eski
   * seçim yerinde kalıp yeni hedefin kodeğini eziyordu.
   *
   * Kullanıcı listeden elle bir kodlayıcı seçtiyse (boş = "profil varsayılanı"
   * dâhil) karışılmıyor; yeni bir dosya seçilince otomatik kipe dönülüyor.
   */
  let encoderPickedByUser = $state(false);

  $effect(() => {
    const id = targetProfileId;
    if (encoderPickedByUser) return;
    overrideVideoEncoder = gpuEncoderFor(id);
  });

  onMount(() => {
    const openHandler = () => { void onNativePick(); };
    window.addEventListener("lfc:open-file", openHandler);

    if (hasLfc) {
      void loadProfilesList();
      Promise.all([
        window.lfc.getFfmpegVersion(),
        window.lfc.getFfmpegCapabilities()
      ]).then(([v, c]) => {
        if (v.ok) ffmpegVersion = v.versionLine;
        if (c.ok === false) {
          capsError = c.message;
        } else {
          encoderSet = new Set(c.value.encoders);
          hwaccels = c.value.hwaccels;
        }
        capsLoading = false;
        // Kodlayıcı seçimini `$effect` üstleniyor: `encoderSet` değiştiği için
        // yetenekler geldiğinde kendiliğinden yeniden çalışıyor.
      });
    } else {
      capsLoading = false;
    }

    return () => window.removeEventListener("lfc:open-file", openHandler);
  });

  function resolutionHints(): { width?: number } {
    const widthMap: Partial<Record<ResolutionPreset, number>> = {
      "360p": 640, "480p": 854, "720p": 1280, "1080p": 1920, "1440p": 2560, "2160p": 3840
    };
    if (resolutionPreset === "original") return {};
    if (resolutionPreset === "custom") {
      return customWidth != null && customWidth > 0 ? { width: customWidth } : {};
    }
    const w = widthMap[resolutionPreset];
    return w ? { width: w } : {};
  }

  async function runProbe(path: string, sourceLabel: string) {
    probeError = null;
    probeSummary = null;
    inputPreviewUrl = null;
    videoPreviewUrl = null;
    waveformPath = null;
    if (!hasLfc) {
      probeError = "Bu ekran yalnızca masaüstü (Electron) ortamında tam çalışır.";
      return;
    }
    const r = await window.lfc.probeMedia({ inputPath: path });
    if (r.ok === false) {
      probeError = r.message;
      return;
    }
    probeSummary = r.summary;
    const kind = r.summary.inferredKind ?? "video";
    const ext = normalizeExtension(sourceLabel);
    const firstOk = filterTargetsByEncoders(getTargetsForSource(ext, kind), encoderSet).find(
      (x) => x.ok
    );
    if (firstOk) {
      targetProfileId = firstOk.profile.id;
    }
    // Yeni dosya → otomatik kodlayıcı seçimine dön.
    encoderPickedByUser = false;
    overrideVideoEncoder = "";
    if (kind === "image-only") {
      const prev = await window.lfc.readFilePreview(path);
      if (prev.ok) {
        inputPreviewUrl = prev.dataUrl;
      }
    } else if (kind === "video") {
      videoPreviewUrl = `file://${path.replace(/\\/g, "/")}`;
    } else if (kind === "audio") {
      waveformPath = path;
    }
  }

  $effect(() => {
    const canvas = waveformCanvas;
    const path = waveformPath;
    if (!canvas || !path) return;
    void renderWaveform(canvas, path);
  });

  async function renderWaveform(canvas: HTMLCanvasElement, path: string) {
    try {
      const url = `file://${path.replace(/\\/g, "/")}`;
      const resp = await fetch(url);
      const buffer = await resp.arrayBuffer();
      const audioCtx = new AudioContext();
      const decoded = await audioCtx.decodeAudioData(buffer);
      await audioCtx.close();
      const data = decoded.getChannelData(0);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      const step = Math.max(1, Math.floor(data.length / W));
      ctx.fillStyle = "rgba(56,189,248,0.1)";
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(56,189,248,0.85)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x < W; x++) {
        let min = 1, max = -1;
        for (let j = 0; j < step; j++) {
          const v = data[x * step + j] ?? 0;
          if (v < min) min = v;
          if (v > max) max = v;
        }
        const y1 = ((1 - max) / 2) * H;
        const y2 = ((1 - min) / 2) * H;
        ctx.moveTo(x, y1);
        ctx.lineTo(x, Math.max(y2, y1 + 1));
      }
      ctx.stroke();
    } catch {
      // silently skip if audio cannot be decoded
    }
  }

  function validateAndSetFile(path: string, label: string) {
    probeError = null;
    outputPath = null;
    outputPreviewUrl = null;
    convertToast = null;
    const ext = normalizeExtension(label);
    if (!isKnownInputExtension(ext)) {
      probeError =
        "Bu uzantı listede yok. Desteklenen türlerden birini seçin (ör. mp4, mp3, png).";
      probeSummary = null;
      filePath = null;
      fileLabel = null;
      return;
    }
    filePath = path;
    fileLabel = label;
    void runProbe(path, label);
  }

  async function onNativePick() {
    if (!hasLfc) {
      return;
    }
    const r = await window.lfc.showOpenMediaDialog();
    if (r.canceled === false) {
      const base = r.filePath.split(/[/\\]/).pop() ?? "dosya";
      validateAndSetFile(r.filePath, base);
    }
  }

  function onInputChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.item(0);
    if (!file || !hasLfc) {
      return;
    }
    try {
      const path = window.lfc.getPathForFile(file);
      validateAndSetFile(path, file.name);
    } catch {
      probeError = "Dosya yolu alınamadı. Lütfen güncel Electron ile deneyin.";
    }
    input.value = "";
  }

  const selectedHints = $derived(
    probeSummary ? targetProfileToJobHints(targetProfileId) : null
  );

  const noAudioWarning = $derived(
    selectedHints?.audioOnlyOutput === true && !probeSummary?.audioCodec
  );

  const canStart = $derived(
    Boolean(filePath && selectedRow?.ok && probeSummary && !capsLoading && hasLfc && !noAudioWarning)
  );

  function suggestOutputFilename(inputName: string, extension: string): string {
    const ext = extension.startsWith(".") ? extension.slice(1) : extension;
    const dot = inputName.lastIndexOf(".");
    const base = dot >= 0 ? inputName.slice(0, dot) : inputName;
    return `${base}-donusum.${ext}`;
  }

  function buildJobSpec(outPath: string): ConvertJobSpec {
    if (!filePath) {
      throw new Error("Dosya yolu yok");
    }
    const res = resolutionHints();
    const aspect =
      aspectRatioPreset === "original"
        ? undefined
        : aspectRatioPreset === "custom"
          ? (customAspectRatio.trim() || undefined)
          : aspectRatioPreset;

    // Preset kuralları (zorunlu ölçü, boyut limiti, sabit kalite) artık
    // `buildProfileJobSpec` içinde — toplu dönüştürme ve çoklu çıktı ekranları
    // da aynı işlevi çağırıyor (DENETIM.md D-10).
    return buildProfileJobSpec(targetProfileId, {
      inputPath: filePath,
      outputPath: outPath,
      qualityPreset,
      ...(res.width != null ? { width: res.width } : {}),
      ...(aspect ? { aspectRatio: aspect } : {}),
      ...(targetSizeMb != null && targetSizeMb > 0 ? { targetSizeMb } : {}),
      ...(overrideVideoEncoder !== "" ? { videoEncoderOverride: overrideVideoEncoder } : {}),
      ...(audioChannels !== "" ? { audioChannels: Number(audioChannels) as 1 | 2 } : {}),
      extraFfmpegArgs: parseExtraFfmpegArgs(extraFfmpegArgsRaw)
    });
  }

  async function cancelConversion() {
    convertCancelled = true;
    if (hasLfc) await window.lfc.cancelConvert();
  }

  async function startConversion() {
    if (!hasLfc || !filePath || !selectedRow?.ok) {
      return;
    }
    convertToast = null;
    convertCancelled = false;
    try {
      const profile = getTargetById(targetProfileId);
      const ext = profile?.outputExtension ?? "mp4";
      const dirResult = await window.lfc.getOutputDir();
      if (dirResult.ok === false) {
        convertToast = `Çıktı klasörü oluşturulamadı: ${dirResult.message}`;
        return;
      }
      const filename = suggestOutputFilename(fileLabel ?? "dosya", ext);
      const sep = dirResult.dir.includes("\\") ? "\\" : "/";
      const autoPath = `${dirResult.dir}${sep}${filename}`;

      convertBusy = true;
      outputPath = null;
      outputPreviewUrl = null;
      convertLog = [];
      const durRaw = probeSummary?.durationSec;
      const dur =
        durRaw != null && typeof durRaw === "number" && Number.isFinite(durRaw) ? durRaw : NaN;
      const hasDuration = dur > 0;
      convertProgress = hasDuration ? 0 : null;
      const spec = buildJobSpec(autoPath);
      const r = await window.lfc.runConvertJob(
        hasDuration ? { spec, inputDurationSec: dur } : { spec },
        (percent) => {
          convertProgress = percent;
        },
        (line) => {
          convertLog = [...convertLog, line].slice(-500);
        }
      );
      const inputExt = (fileLabel ?? "").split(".").pop()?.toLowerCase() ?? "";
      const outputExt = ext.toLowerCase();
      if (r.ok === false) {
        convertToast = convertCancelled ? "Dönüşüm iptal edildi." : r.message;
        if (!convertCancelled) {
          void recordConversion({
            timestamp: Date.now(),
            inputFilename: fileLabel ?? "",
            inputExt,
            outputFilename: filename,
            outputExt,
            outputPath: autoPath,
            targetProfileId,
            status: "error",
            errorMessage: r.message
          });
        }
      } else {
        outputPath = autoPath;
        convertToast = `Kaydedildi: ${autoPath}`;
        void recordConversion({
          timestamp: Date.now(),
          inputFilename: fileLabel ?? "",
          inputExt,
          outputFilename: filename,
          outputExt,
          outputPath: autoPath,
          targetProfileId,
          status: "success"
        });
        const imageExts = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff"]);
        if (imageExts.has(outputExt)) {
          const prev = await window.lfc.readFilePreview(autoPath);
          if (prev.ok) {
            outputPreviewUrl = prev.dataUrl;
          }
        }
      }
    } catch (e: unknown) {
      convertToast = e instanceof Error ? e.message : String(e);
    } finally {
      convertBusy = false;
      convertProgress = null;
      convertCancelled = false;
    }
  }

  async function quickExtractAudio() {
    if (!hasLfc || !filePath || !fileLabel || convertBusy) return;
    const dirResult = await window.lfc.getOutputDir();
    if (dirResult.ok === false) {
      convertToast = `Çıktı klasörü oluşturulamadı: ${dirResult.message}`;
      return;
    }
    const dot = fileLabel.lastIndexOf(".");
    const base = dot >= 0 ? fileLabel.slice(0, dot) : fileLabel;
    const sep = dirResult.dir.includes("\\") ? "\\" : "/";
    const outPath = `${dirResult.dir}${sep}${base}-ses.mp3`;

    const spec: import("@lfc/types").ConvertJobSpec = {
      inputPath: filePath,
      outputPath: outPath,
      mode: "transcode",
      audioOnlyOutput: true,
      audioEncoder: "libmp3lame"
    };

    convertBusy = true;
    outputPath = null;
    outputPreviewUrl = null;
    convertLog = [];
    convertProgress = null;
    convertToast = null;

    const r = await window.lfc.runConvertJob(
      { spec },
      (percent) => { convertProgress = percent; },
      (line) => { convertLog = [...convertLog, line].slice(-500); }
    );
    convertBusy = false;
    convertProgress = null;

    if (r.ok) {
      outputPath = outPath;
      convertToast = `Ses çıkarıldı: ${outPath}`;
    } else if (r.ok === false) {
      convertToast = r.message;
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    isDragging = false;
    const file = event.dataTransfer?.files?.item(0);
    if (!file || !hasLfc) {
      return;
    }
    try {
      const path = window.lfc.getPathForFile(file);
      validateAndSetFile(path, file.name);
    } catch {
      probeError = "Sürüklenen dosya için yerel yol alınamadı.";
    }
  }

  const previewLine = $derived.by(() => {
    if (!filePath || !selectedRow?.ok) {
      return "";
    }
    const ext = getTargetById(targetProfileId)?.outputExtension ?? "out";
    const filename = suggestOutputFilename(fileLabel ?? "dosya", ext);
    return buildFfmpegArgs(buildJobSpec(`~/Documents/LPC/${filename}`)).join(" ");
  });

  $effect(() => {
    if (!probeSummary || capsLoading) {
      return;
    }
    const rows = filterTargetsByEncoders(
      getTargetsForSource(normalizeExtension(fileLabel ?? ""), probeSummary.inferredKind ?? "video"),
      encoderSet
    );
    const current = rows.find((r) => r.profile.id === targetProfileId);
    if (!current?.ok) {
      const pick = rows.find((r) => r.ok);
      if (pick) {
        targetProfileId = pick.profile.id;
      }
    }
  });
</script>

<div class="page">
  <header class="hero">
    <p class="eyebrow">Local Privacy Converter</p>
    <h1>Dosyalarınız cihazdan çıkmadan dönüştürün ve sıkıştırın</h1>
    <p class="lede">
      Medya işlemleri yerelde kalır; buluta yüklenmez. İşlem sırasında internet bağlantısı gerekmez.
    </p>
  </header>

  <section class="card" aria-labelledby="job-title">
    <div class="card-header">
      <h2 id="job-title">Yeni iş</h2>
      <p class="card-sub">
        Dosya seçildiğinde tür ffprobe ile analiz edilir; yalnızca uygun hedef formatlar listelenir.
      </p>
    </div>

    <div
      role="region"
      aria-label="Dosya bırakma alanı"
      class="drop"
      class:drag={isDragging}
      class:compact={!!filePath}
      ondragenter={(e) => {
        e.preventDefault();
        isDragging = true;
      }}
      ondragover={(e) => e.preventDefault()}
      ondragleave={() => (isDragging = false)}
      ondrop={onDrop}
    >
      {#if !filePath}
        <p class="drop-title">Dosyaları buraya bırakın</p>
        <p class="drop-sub">
          Sürükleyip bırakın veya seçin. Uzantı, desteklenen allowlist ile sınırlıdır.
        </p>
        <div class="pick-row">
          <label class="file-pick">
            <span class="cta">Dosya seç</span>
            <input
              type="file"
              class="sr-only"
              accept={fileAccept}
              onchange={onInputChange}
            />
          </label>
        </div>
      {:else}
        <div class="drop-compact-row">
          <span class="drop-compact-name">{fileLabel}</span>
          <div class="pick-row">
            <label class="file-pick">
              <span class="cta small">Değiştir</span>
              <input
                type="file"
                class="sr-only"
                accept={fileAccept}
                onchange={onInputChange}
              />
            </label>
          </div>
        </div>
      {/if}
      {#if probeError}
        <p class="error" role="alert">{probeError}</p>
      {/if}
    </div>

    {#if probeSummary && filePath}
      <div class="preview-panel">
        <div class="preview-col">
          <p class="preview-col-label">Kaynak</p>
          {#if inputPreviewUrl}
            <img src={inputPreviewUrl} alt="Kaynak önizleme" class="preview-img" />
          {:else if videoPreviewUrl}
            <!-- svelte-ignore a11y_media_has_caption -->
            <video src={videoPreviewUrl} controls class="preview-img preview-video"></video>
          {:else if probeSummary.inferredKind === "audio"}
            <canvas
              bind:this={waveformCanvas}
              width="320"
              height="80"
              class="waveform-canvas"
              aria-label="Ses dalga formu önizlemesi"
            ></canvas>
          {:else}
            <div class="preview-placeholder" aria-label="Önizleme mevcut değil">
              <span class="placeholder-kind">Video</span>
            </div>
          {/if}
          <p class="preview-filename" title={fileLabel ?? ""}>{fileLabel}</p>
          <p class="preview-meta">
            {probeSummary.inferredKind ?? "video"}
            {#if probeSummary.videoCodec} · {probeSummary.videoCodec}{/if}
            {#if probeSummary.audioCodec} · {probeSummary.audioCodec}{/if}
            {#if probeSummary.durationSec != null} · {probeSummary.durationSec.toFixed(1)}s{/if}
          </p>
        </div>

        <div class="preview-arrow" aria-hidden="true">&#8594;</div>

        <div class="preview-col">
          <p class="preview-col-label">Çıktı</p>
          {#if outputPreviewUrl}
            <img src={outputPreviewUrl} alt="Çıktı önizleme" class="preview-img" />
          {:else if outputPath}
            <div class="preview-placeholder done" aria-label="Dönüşüm tamamlandı">
              <span class="placeholder-done-mark">&#10003;</span>
            </div>
          {:else}
            <div class="preview-placeholder pending" aria-label="Henüz dönüştürülmedi">
              <span class="placeholder-pending-dots">&#8943;</span>
            </div>
          {/if}
          {#if outputPath}
            <p class="preview-filename" title={outputPath}>{outputPath.split(/[/\\]/).pop()}</p>
            <p class="preview-meta">~/Documents/LPC/</p>
            <button
              type="button"
              class="show-in-folder-btn"
              onclick={() => void window.lfc.showInFolder(outputPath!)}
            >
              Dizinde göster
            </button>
          {:else}
            <p class="preview-filename muted-hint">Dönüşüm sonrası burada görünecek</p>
          {/if}
        </div>
      </div>
    {/if}

    <section class="settings-block" aria-labelledby="simple-settings">
      <h3 class="block-title" id="simple-settings">Basit ayarlar</h3>
      <div class="grid">
        <label class="field">
          <span>Hedef format</span>
          <select
            bind:value={targetProfileId}
            disabled={!probeSummary || targetsWithAvailability.length === 0}
          >
            {#if !probeSummary}
              <option value={targetProfileId}>Önce dosya seçin</option>
            {:else}
              {#if groupedTargets.general.length > 0}
                <optgroup label="Genel">
                  {#each groupedTargets.general as row (row.profile.id)}
                    <option value={row.profile.id} disabled={!row.ok}>
                      {row.profile.labelTr}{!row.ok ? " (eksik encoder)" : ""}
                    </option>
                  {/each}
                </optgroup>
              {/if}
              {#each groupedTargets.platforms as [platformLabel, rows] (platformLabel)}
                <optgroup label={platformLabel}>
                  {#each rows as row (row.profile.id)}
                    <option value={row.profile.id} disabled={!row.ok}>
                      {row.profile.labelTr}{!row.ok ? " (eksik encoder)" : ""}
                    </option>
                  {/each}
                </optgroup>
              {/each}
            {/if}
          </select>
        </label>

        {#if selectedRow?.profile.socialMeta}
          {@const sm = selectedRow.profile.socialMeta}
          <div class="social-info-card">
            <p class="social-info-title">{sm.platformLabelTr}</p>
            <p class="social-info-text">{sm.infoTr}</p>
          </div>
        {/if}

        {#if simpleFields.includes("quality_preset")}
          <div class="field">
            <label for="quality-select">Kalite ön ayarı</label>
            <select id="quality-select" bind:value={qualityPreset}>
              {#each QUALITY_OPTIONS as opt (opt.value)}
                <option value={opt.value} title={opt.desc}>{opt.label}</option>
              {/each}
            </select>
            <p class="field-hint">
              {QUALITY_OPTIONS.find(o => o.value === qualityPreset)?.desc ?? ""}
            </p>
          </div>
        {/if}

        {#if simpleFields.includes("resolution_preset") && !selectedHints?.audioOnlyOutput}
          <div class="field">
            <label for="resolution-select">Çözünürlük</label>
            <select id="resolution-select" bind:value={resolutionPreset}>
              {#each RESOLUTION_OPTIONS as opt (opt.value)}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>
            {#if resolutionPreset === "custom"}
              <input
                type="number"
                class="number-input"
                min="64"
                max="7680"
                step="2"
                placeholder="Genişlik (px)"
                value={customWidth ?? ""}
                oninput={(e) => {
                  const v = parseInt((e.currentTarget as HTMLInputElement).value, 10);
                  customWidth = Number.isInteger(v) && v > 0 ? v : null;
                }}
              />
            {/if}
          </div>

          <div class="field">
            <label for="aspect-ratio-select">En-Boy Oranı</label>
            <select id="aspect-ratio-select" bind:value={aspectRatioPreset}>
              {#each ASPECT_RATIO_OPTIONS as opt (opt.value)}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>
            {#if aspectRatioPreset === "custom"}
              <input
                type="text"
                class="number-input"
                placeholder="ör. 16:9"
                bind:value={customAspectRatio}
              />
              <p class="field-hint">Kaynak kırpılarak merkez korunur.</p>
            {:else if aspectRatioPreset !== "original"}
              <p class="field-hint">Kaynak kırpılarak merkez korunur.</p>
            {/if}
          </div>
        {/if}
      </div>

      {#if noAudioWarning}
        <p class="warn">
          Seçili kaynak dosyada ses akışı bulunamadı. Bu profil yalnızca ses çıktısı üretir; dönüşüm başlatılamaz.
        </p>
      {/if}

      {#if selectedRow && !selectedRow.ok}
        <p class="warn">
          Bu hedef için şu encoder’lar eksik:
          <strong>{selectedRow.missing.join(", ")}</strong>. FFmpeg derlemenizi veya paketinizi kontrol edin.
        </p>
      {/if}
    </section>

    {#if profiles.length > 0 || showProfileSave}
      <details class="profiles-section">
        <summary>Kaydedilmiş Profiller ({profiles.length})</summary>
        <div class="profiles-body">
          {#each profiles as p (p.id)}
            <div class="profile-row">
              <span class="profile-name" title={`${p.targetProfileId}${p.qualityPreset ? ' · ' + p.qualityPreset : ''}`}>{p.name}</span>
              <button type="button" class="profile-load-btn" onclick={() => void applyProfile(p)}>Uygula</button>
              <button type="button" class="profile-del-btn" onclick={() => void deleteProfile(p.id)}>Sil</button>
            </div>
          {/each}
          {#if showProfileSave}
            <div class="profile-save-row">
              <input
                type="text"
                class="profile-name-input"
                placeholder="Profil adı…"
                bind:value={profileSaveName}
                onkeydown={(e) => e.key === "Enter" && void saveCurrentProfile()}
              />
              <button type="button" class="profile-load-btn" onclick={() => void saveCurrentProfile()} disabled={!profileSaveName.trim()}>Kaydet</button>
              <button type="button" class="profile-del-btn" onclick={() => { showProfileSave = false; profileSaveName = ""; }}>İptal</button>
            </div>
          {:else}
            <button type="button" class="profile-add-btn" onclick={() => (showProfileSave = true)}>+ Mevcut ayarları kaydet</button>
          {/if}
        </div>
      </details>
    {:else}
      <button type="button" class="profile-add-btn-inline" onclick={() => (showProfileSave = true)}>
        + Profil kaydet
      </button>
    {/if}

    <div class="action-row">
      <button
        type="button"
        class="cta primary-action"
        disabled={!canStart || convertBusy}
        aria-busy={convertBusy}
        onclick={() => void startConversion()}
      >
        {convertBusy
          ? convertProgress != null
            ? `Dönüşüm… %${Math.round(convertProgress)}`
            : "Dönüşüm çalışıyor…"
          : "Dönüşümü başlat"}
      </button>
      {#if convertBusy}
        <button
          type="button"
          class="cta stop-btn"
          onclick={() => void cancelConversion()}
        >Durdur</button>
      {:else if probeSummary?.inferredKind === "video" && filePath && !convertBusy}
        <button
          type="button"
          class="cta quick-audio-btn"
          title="Videodan tek tıkla MP3 ses çıkar"
          onclick={() => void quickExtractAudio()}
        >♪ MP3 Çıkar</button>
      {/if}
      {#if convertToast}
        <p class="convert-status" role="status">{convertToast}</p>
      {/if}
    </div>

    {#if convertLog.length > 0}
      <details class="log-details">
        <summary>FFmpeg log ({convertLog.length} satır)</summary>
        <pre class="log-output" aria-live="polite">{convertLog.join("\n")}</pre>
        <div class="log-actions">
          <button type="button" class="log-clear-btn" onclick={() => (convertLog = [])}>Temizle</button>
        </div>
      </details>
    {/if}

    <details class="advanced">
      <summary>Gelişmiş ayarlar</summary>
      <div class="advanced-body">
        {#if capsLoading}
          <p class="muted">Codec listesi yükleniyor…</p>
        {:else if capsError}
          <p class="error" role="alert">{capsError}</p>
        {/if}

        {#if advancedFields.includes("ffmpeg_version")}
          <p class="meta-row">
            <span class="label">FFmpeg</span>
            <span class="value">{ffmpegVersion ?? "—"}</span>
          </p>
        {/if}

        {#if advancedFields.includes("encoder_availability") && probeSummary}
          <div class="encoder-checks" role="list">
            {#each selectedRow?.profile.requiredEncoders ?? [] as enc (enc)}
              <span
                class:ok={encoderSet.has(enc)}
                class:bad={!encoderSet.has(enc)}
                role="listitem"
                title={encoderSet.has(enc) ? `${enc} encoder sistemde mevcut` : `${enc} encoder bulunamadı — bu format kullanılamaz`}
              >
                {enc}: {encoderSet.has(enc) ? "yüklü" : "yok"}
              </span>
            {/each}
          </div>
        {/if}

        {#if advancedFields.includes("hwaccel_list")}
          <p class="meta-row" title="Sistemde bulunan GPU/donanım hızlandırma yöntemleri. Encoder seçiminde otomatik kullanılır.">
            <span class="label">Donanım hızlandırma</span>
            <span class="value">{hwaccels.length ? hwaccels.join(", ") : "—"}</span>
          </p>
        {/if}

        {#if advancedFields.includes("override_video_encoder") && selectedRow?.profile.hasVideoOut}
          <label class="field" title="Hangi encoder kullanılacağını seçin. GPU encoder'lar çok daha hızlıdır ancak bazı sistemlerde bulunmayabilir.">
            <span>Video encoder</span>
            <select bind:value={overrideVideoEncoder} onchange={() => (encoderPickedByUser = true)}>
              <option value="">Varsayılan (profil)</option>
              {#each Object.entries(ENCODER_LABELS) as [enc, label] (enc)}
                {#if encoderSet.has(enc)}
                  <option value={enc}>{label}</option>
                {/if}
              {/each}
            </select>
            {#if overrideVideoEncoder && GPU_ENCODERS.has(overrideVideoEncoder)}
              <p class="field-hint gpu-hint">GPU encoder etkin — donanım hızlandırma kullanılıyor.</p>
            {/if}
          </label>
        {/if}

        {#if probeSummary && probeSummary.inferredKind !== "image-only"}
          <label class="field">
            <span>Maksimum boyut (MB)</span>
            <input
              type="number"
              class="number-input"
              min="1"
              step="1"
              placeholder="Sınır yok"
              value={targetSizeMb ?? ""}
              oninput={(e) => {
                const v = parseFloat((e.currentTarget as HTMLInputElement).value);
                targetSizeMb = Number.isFinite(v) && v > 0 ? v : null;
              }}
            />
            <p class="field-hint">Ayarlanırsa FFmpeg çıktıyı bu boyutta keser (-fs).</p>
          </label>
        {/if}

        {#if probeSummary && !selectedHints?.audioOnlyOutput && probeSummary.hasAudio !== false}
          <label class="field">
            <span>Ses kanalı</span>
            <select bind:value={audioChannels}>
              <option value="">Kaynak ile aynı</option>
              <option value="1">Mono (1 kanal)</option>
              <option value="2">Stereo (2 kanal)</option>
            </select>
            <p class="field-hint">Mono: dosya boyutu küçülür, stereo ses kaybolur. Stereo: uyumluluk için zorla.</p>
          </label>
        {/if}

        <label class="field">
          <span>Ekstra FFmpeg argümanları</span>
          <input
            type="text"
            class="text-input"
            placeholder="-bf 2 -g 30 -movflags +faststart"
            bind:value={extraFfmpegArgsRaw}
          />
          <p class="field-hint">Çıktı yolundan önce eklenir. Boşlukla ayırın. Yanlış argümanlar dönüşümü bozabilir.</p>
        </label>

        {#if previewLine}
          <div class="preview">
            <span class="preview-label">Örnek ffmpeg argümanları</span>
            <code class="preview-code">{previewLine}</code>
          </div>
        {/if}
      </div>
    </details>

    <div
      class="progress"
      class:busy={convertBusy}
      role={convertBusy ? "progressbar" : undefined}
      aria-valuemin={convertBusy ? 0 : undefined}
      aria-valuemax={convertBusy ? 100 : undefined}
      aria-valuenow={convertBusy && convertProgress != null ? Math.round(convertProgress) : undefined}
      aria-valuetext={convertBusy && convertProgress != null ? `%${Math.round(convertProgress)}` : undefined}
    >
      <div class="progress-label">
        {#if convertBusy}
          {#if convertProgress != null}
            FFmpeg… %<strong class="pct">{Math.round(convertProgress)}</strong>
          {:else}
            FFmpeg çalışıyor… (süre bilinmiyor, yüzde gösterilemiyor)
          {/if}
        {:else}
          İlerleme
        {/if}
      </div>
      <div
        class="bar"
        class:indeterminate={convertBusy && convertProgress == null}
      >
        {#if convertBusy && convertProgress != null}
          <span class="fill" style="width: {Math.min(100, Math.max(0, convertProgress))}%"></span>
        {:else if convertBusy}
          <span class="fill indeterminate-fill"></span>
        {:else}
          <span class="fill" style="width: 0%"></span>
        {/if}
      </div>
    </div>
  </section>
</div>

<style>
  .page {
    max-width: 960px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    padding-bottom: 1rem;
  }

  .hero {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }

  .eyebrow {
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-size: 0.72rem;
    color: var(--muted);
    font-weight: 700;
  }

  h1 {
    margin: 0;
    font-size: clamp(1.65rem, 2.4vw, 2.05rem);
    line-height: 1.2;
  }

  .lede {
    margin: 0;
    color: var(--muted);
    max-width: 780px;
  }

  .card {
    background: radial-gradient(circle at 15% 20%, rgba(56, 189, 248, 0.12), transparent),
      var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    padding: 1.35rem 1.45rem 1.5rem;
    box-shadow: var(--shadow-card);
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .card-header h2 {
    margin: 0;
    font-size: 1.2rem;
  }

  .card-sub {
    margin: 0.35rem 0 0;
    color: var(--muted);
  }

  .drop {
    border: 1px dashed var(--border);
    border-radius: var(--radius-card);
    padding: 1.1rem;
    text-align: center;
    background: rgba(255, 255, 255, 0.02);
    transition:
      border-color 0.15s ease,
      background 0.15s ease;
  }

  .drop.compact {
    padding: 0.65rem 1rem;
  }

  .drop.drag {
    border-color: var(--accent-start);
    background: rgba(56, 189, 248, 0.08);
  }

  .drop-title {
    margin: 0;
    font-weight: 800;
  }

  .drop-sub {
    margin: 0.35rem 0 0.75rem;
    color: var(--muted);
    font-size: 0.92rem;
  }

  .drop-compact-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    justify-content: space-between;
  }

  .drop-compact-name {
    font-size: 0.9rem;
    color: var(--text);
    font-weight: 600;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cta.small {
    padding: 0.4rem 0.75rem;
    font-size: 0.82rem;
  }

  .preview-panel {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 1rem;
    align-items: start;
    padding: 1rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    background: rgba(0, 0, 0, 0.12);
  }

  .preview-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.45rem;
    min-width: 0;
  }

  .preview-col-label {
    margin: 0;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.09em;
    color: var(--muted);
    font-weight: 700;
    align-self: flex-start;
  }

  .preview-img {
    width: 100%;
    max-height: 200px;
    object-fit: contain;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: rgba(0, 0, 0, 0.25);
  }
  .preview-video {
    max-height: 200px;
    height: auto;
  }
  .waveform-canvas {
    width: 100%;
    height: 80px;
    border-radius: 8px;
    border: 1px solid var(--border);
    display: block;
  }

  .preview-placeholder {
    width: 100%;
    aspect-ratio: 4 / 3;
    max-height: 200px;
    border-radius: 8px;
    border: 1px dashed var(--border);
    background: rgba(255, 255, 255, 0.03);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--muted);
  }

  .preview-placeholder.done {
    border-style: solid;
    border-color: var(--success, #22c55e);
    background: rgba(34, 197, 94, 0.06);
  }

  .preview-placeholder.pending {
    opacity: 0.5;
  }

  .placeholder-kind {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--muted);
  }

  .placeholder-done-mark {
    font-size: 2rem;
    color: var(--success, #22c55e);
    line-height: 1;
  }

  .placeholder-pending-dots {
    font-size: 1.5rem;
    color: var(--muted);
    letter-spacing: 0.1em;
  }

  .preview-arrow {
    font-size: 1.6rem;
    color: var(--muted);
    padding-top: 3.5rem;
    line-height: 1;
    opacity: 0.6;
  }

  .preview-filename {
    margin: 0;
    font-size: 0.8rem;
    color: var(--text);
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: center;
  }

  .preview-filename.muted-hint {
    color: var(--muted);
    font-style: italic;
  }

  .preview-meta {
    margin: 0;
    font-size: 0.75rem;
    color: var(--muted);
    text-align: center;
  }

  .show-in-folder-btn {
    margin-top: 0.1rem;
    padding: 0.35rem 0.8rem;
    border-radius: var(--radius-button);
    border: 1px solid var(--border);
    background: var(--surface-elevated);
    color: var(--text);
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
    white-space: nowrap;
  }

  .show-in-folder-btn:hover {
    background: var(--surface-hover);
    border-color: var(--accent-start);
  }

  .pick-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    justify-content: center;
    align-items: center;
  }

  .file-pick {
    display: inline-flex;
    justify-content: center;
  }

  .cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.75rem 1.15rem;
    border-radius: var(--radius-button);
    background: linear-gradient(120deg, var(--accent-start), var(--accent-end));
    color: var(--accent-text);
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 10px 30px rgba(99, 102, 241, 0.22);
    border: none;
    font: inherit;
  }

  .error {
    margin: 0.75rem 0 0;
    color: var(--danger);
    font-size: 0.92rem;
  }

  .warn {
    margin: 0.5rem 0 0;
    font-size: 0.88rem;
    color: var(--warning, #eab308);
  }

  .settings-block {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  .block-title {
    margin: 0;
    font-size: 1rem;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 0.85rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.9rem;
    color: var(--muted);
  }

  select {
    border-radius: var(--radius-button);
    border: 1px solid var(--border);
    background: var(--surface-elevated);
    color: var(--text);
    padding: 0.65rem 0.75rem;
    font-size: 0.95rem;
  }

  .profiles-section {
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    padding: 0.5rem 0.85rem;
    background: rgba(0, 0, 0, 0.08);
  }

  .profiles-section summary {
    cursor: pointer;
    font-weight: 600;
    font-size: 0.88rem;
    color: var(--muted);
    user-select: none;
  }

  .profiles-body {
    margin-top: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .profile-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .profile-name {
    flex: 1;
    font-size: 0.84rem;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .profile-load-btn {
    font: inherit;
    font-size: 0.75rem;
    padding: 0.2rem 0.55rem;
    border: 1px solid var(--accent-start);
    border-radius: var(--radius-button);
    background: rgba(56, 189, 248, 0.1);
    color: var(--accent-start);
    cursor: pointer;
    white-space: nowrap;
  }

  .profile-load-btn:hover { background: rgba(56, 189, 248, 0.2); }
  .profile-load-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .profile-del-btn {
    font: inherit;
    font-size: 0.75rem;
    padding: 0.2rem 0.55rem;
    border: 1px solid rgba(239, 68, 68, 0.35);
    border-radius: var(--radius-button);
    background: transparent;
    color: var(--danger);
    cursor: pointer;
    white-space: nowrap;
  }

  .profile-del-btn:hover { background: rgba(239, 68, 68, 0.08); }

  .profile-save-row {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .profile-name-input {
    flex: 1;
    min-width: 8rem;
    border-radius: var(--radius-button);
    border: 1px solid var(--border);
    background: var(--surface-elevated);
    color: var(--text);
    padding: 0.3rem 0.6rem;
    font: inherit;
    font-size: 0.84rem;
  }

  .profile-name-input::placeholder { color: var(--muted); opacity: 0.6; }

  .profile-add-btn, .profile-add-btn-inline {
    font: inherit;
    font-size: 0.78rem;
    color: var(--muted);
    background: none;
    border: 1px dashed var(--border);
    border-radius: var(--radius-button);
    padding: 0.25rem 0.7rem;
    cursor: pointer;
    align-self: flex-start;
  }

  .profile-add-btn:hover, .profile-add-btn-inline:hover { color: var(--text); border-color: var(--accent-start); }

  .log-details {
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    padding: 0.5rem 0.85rem;
    background: rgba(0, 0, 0, 0.18);
  }

  .log-details summary {
    cursor: pointer;
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--muted);
    user-select: none;
  }

  .log-output {
    margin: 0.5rem 0 0;
    padding: 0.65rem 0.75rem;
    background: rgba(0, 0, 0, 0.25);
    border-radius: 6px;
    font-size: 0.72rem;
    font-family: monospace;
    color: rgba(148, 215, 186, 0.9);
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 200px;
    overflow-y: auto;
    line-height: 1.45;
  }

  .log-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 0.4rem;
  }

  .log-clear-btn {
    font: inherit;
    font-size: 0.78rem;
    padding: 0.2rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-button);
    background: transparent;
    color: var(--muted);
    cursor: pointer;
  }

  .log-clear-btn:hover { color: var(--text); }

  .advanced {
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    padding: 0.5rem 0.85rem;
    background: rgba(0, 0, 0, 0.12);
  }

  .advanced summary {
    cursor: pointer;
    font-weight: 700;
    font-size: 0.95rem;
  }

  .advanced-body {
    margin-top: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  .muted {
    color: var(--muted);
    font-size: 0.9rem;
    margin: 0;
  }

  .meta-row {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    font-size: 0.88rem;
    margin: 0;
  }

  .meta-row .label {
    color: var(--muted);
    font-weight: 600;
  }

  .encoder-checks {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    font-size: 0.82rem;
  }

  .encoder-checks span {
    padding: 0.2rem 0.45rem;
    border-radius: 6px;
    border: 1px solid var(--border);
  }

  .encoder-checks .ok {
    border-color: var(--success);
    color: var(--success);
  }

  .encoder-checks .bad {
    border-color: var(--danger);
    color: var(--danger);
  }

  .preview {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .preview-label {
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
  }

  .preview-code {
    display: block;
    font-size: 0.75rem;
    line-height: 1.45;
    padding: 0.55rem 0.65rem;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid var(--border);
    white-space: pre-wrap;
    word-break: break-word;
  }

  .action-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.85rem;
    padding: 0.2rem 0;
  }

  .primary-action {
    min-width: 200px;
  }

  .primary-action:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    box-shadow: none;
  }

  .stop-btn {
    background: rgba(239, 68, 68, 0.15);
    color: var(--danger, #ef4444);
    border: 1px solid rgba(239, 68, 68, 0.4);
    box-shadow: none;
    min-width: 90px;
  }

  .stop-btn:hover {
    background: rgba(239, 68, 68, 0.25);
  }

  .quick-audio-btn {
    background: rgba(34, 197, 94, 0.12);
    color: var(--success, #22c55e);
    border: 1px solid rgba(34, 197, 94, 0.35);
    box-shadow: none;
    min-width: 110px;
    font-size: 0.88rem;
  }

  .quick-audio-btn:hover {
    background: rgba(34, 197, 94, 0.22);
  }

  .field-hint {
    margin: 0.2rem 0 0;
    font-size: 0.75rem;
    color: var(--muted);
    line-height: 1.4;
  }

  .gpu-hint {
    color: var(--success, #22c55e);
  }

  .number-input {
    border-radius: var(--radius-button);
    border: 1px solid var(--border);
    background: var(--surface-elevated);
    color: var(--text);
    padding: 0.65rem 0.75rem;
    font-size: 0.95rem;
    font: inherit;
    width: 100%;
  }

  .number-input::placeholder {
    color: var(--muted);
  }

  .text-input {
    border-radius: var(--radius-button);
    border: 1px solid var(--border);
    background: var(--surface-elevated);
    color: var(--text);
    padding: 0.65rem 0.75rem;
    font-size: 0.88rem;
    font: inherit;
    width: 100%;
  }

  .text-input::placeholder {
    color: var(--muted);
    opacity: 0.6;
  }

  .social-info-card {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.65rem 0.85rem;
    border: 1px solid rgba(99, 102, 241, 0.35);
    border-radius: var(--radius-button);
    background: rgba(99, 102, 241, 0.07);
    font-size: 0.88rem;
  }

  .social-info-title {
    margin: 0;
    font-weight: 700;
    color: var(--text);
    font-size: 0.82rem;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--accent-start);
  }

  .social-info-text {
    margin: 0;
    color: var(--muted);
    line-height: 1.4;
  }

  .convert-status {
    margin: 0;
    font-size: 0.88rem;
    color: var(--muted);
    flex: 1;
    min-width: 200px;
  }

  .progress {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    opacity: 0.65;
    transition: opacity 0.15s ease;
  }

  .progress.busy {
    opacity: 1;
  }

  .progress-label {
    font-size: 0.82rem;
    color: var(--muted);
  }

  .progress-label .pct {
    font-variant-numeric: tabular-nums;
  }

  .bar {
    width: 100%;
    height: 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
    overflow: hidden;
    border: 1px solid var(--border);
  }

  .fill {
    display: block;
    height: 100%;
    background: linear-gradient(120deg, var(--accent-start), var(--accent-end));
    border-radius: inherit;
  }

  .bar.indeterminate .indeterminate-fill {
    width: 35%;
    animation: bar-shuttle 0.9s ease-in-out infinite alternate;
  }

  @keyframes bar-shuttle {
    from {
      transform: translateX(-20%);
    }
    to {
      transform: translateX(220%);
    }
  }
</style>
