<script lang="ts">
  import { browser } from "$app/environment";
  import { onMount } from "svelte";
  import { _, locale } from "svelte-i18n";
  import { get } from "svelte/store";

  import { buildFfmpegArgs } from "@lfc/ffmpeg-core/build-args";
  import type { ConvertJobSpec, VideoEncoderChoice } from "@lfc/types";
  import type { MediaProbeSummaryPayload } from "@lfc/validators";
  import { recordConversion } from "$lib/history/store";
  import { profileLabel, socialInfo } from "$lib/profile-text";
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
    { value: "high",       labelKey: "quality.high",       descKey: "quality.highDesc" },
    { value: "compatible", labelKey: "quality.compatible", descKey: "quality.compatibleDesc" },
    { value: "balanced",   labelKey: "quality.balanced",   descKey: "quality.balancedDesc" },
    { value: "small",      labelKey: "quality.small",      descKey: "quality.smallDesc" },
    { value: "very_small", labelKey: "quality.verySmall",  descKey: "quality.verySmallDesc" },
  ] as const;

  /** Anahtar sırası menüdeki sırayı belirliyor; değer `encoders.*` çeviri anahtarı. */
  const ENCODER_LABEL_KEYS: Record<string, string> = {
    libx264:           "encoders.libx264",
    libx265:           "encoders.libx265",
    libsvtav1:         "encoders.libsvtav1",
    libvpx_vp9:        "encoders.libvpx_vp9",
    h264_nvenc:        "encoders.h264_nvenc",
    hevc_nvenc:        "encoders.hevc_nvenc",
    h264_videotoolbox: "encoders.h264_videotoolbox",
    hevc_videotoolbox: "encoders.hevc_videotoolbox",
    h264_qsv:          "encoders.h264_qsv",
    hevc_qsv:          "encoders.hevc_qsv",
    h264_amf:          "encoders.h264_amf",
    hevc_amf:          "encoders.hevc_amf",
    h264_vaapi:        "encoders.h264_vaapi",
    hevc_vaapi:        "encoders.hevc_vaapi",
  };

  // `label` null olan seçeneklerin metni çeviriden geliyor; diğerleri ölçü adı.
  const RESOLUTION_OPTIONS: { value: ResolutionPreset; label: string | null; labelKey?: string }[] = [
    { value: "original", label: null, labelKey: "home.resOriginal" },
    { value: "360p",     label: "360p — 640px" },
    { value: "480p",     label: "480p — 854px" },
    { value: "720p",     label: "720p — 1280px" },
    { value: "1080p",    label: "1080p — 1920px" },
    { value: "1440p",    label: "1440p / 2K — 2560px" },
    { value: "2160p",    label: "2160p / 4K — 3840px" },
    { value: "custom",   label: null, labelKey: "home.resCustom" },
  ];

  const ASPECT_RATIO_OPTIONS: { value: AspectRatioPreset; labelKey: string }[] = [
    { value: "original", labelKey: "home.arOriginal" },
    { value: "16:9",     labelKey: "home.ar169" },
    { value: "9:16",     labelKey: "home.ar916" },
    { value: "1:1",      labelKey: "home.ar11" },
    { value: "4:3",      labelKey: "home.ar43" },
    { value: "21:9",     labelKey: "home.ar219" },
    { value: "custom",   labelKey: "home.arCustom" },
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
      const key = row.profile.socialMeta!.platformLabel;
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
      probeError = get(_)("home.desktopOnly");
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
      probeError = get(_)("home.unknownExt");
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
      probeError = get(_)("home.pathFailedElectron");
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
    return `${base}${get(_)("home.outputFileSuffix")}.${ext}`;
  }

  function buildJobSpec(outPath: string): ConvertJobSpec {
    if (!filePath) {
      throw new Error(get(_)("common.pathFailed"));
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
        convertToast = get(_)("common.outputDirFailed", { values: { message: dirResult.message } });
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
        convertToast = convertCancelled ? get(_)("home.convertCanceled") : r.message;
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
        convertToast = get(_)("home.outputSaved", { values: { path: autoPath } });
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
      convertToast = get(_)("common.outputDirFailed", { values: { message: dirResult.message } });
      return;
    }
    const dot = fileLabel.lastIndexOf(".");
    const base = dot >= 0 ? fileLabel.slice(0, dot) : fileLabel;
    const sep = dirResult.dir.includes("\\") ? "\\" : "/";
    const outPath = `${dirResult.dir}${sep}${base}${get(_)("home.audioFileSuffix")}.mp3`;

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
      convertToast = get(_)("home.audioExtracted", { values: { path: outPath } });
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
      probeError = get(_)("home.dropPathFailed");
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
    <h1>{$_("home.heroTitle")}</h1>
    <p class="lede">{$_("home.heroLede")}</p>
  </header>

  <section class="card" aria-labelledby="job-title">
    <div class="card-header">
      <h2 id="job-title">{$_("home.jobTitle")}</h2>
      <p class="card-sub">{$_("home.jobSub")}</p>
    </div>

    <div
      role="region"
      aria-label={$_("home.dropRegion")}
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
        <p class="drop-title">{$_("home.dropTitle")}</p>
        <p class="drop-sub">{$_("home.dropSub")}</p>
        <div class="pick-row">
          <label class="file-pick">
            <span class="cta">{$_("home.pickCta")}</span>
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
              <span class="cta small">{$_("home.changeCta")}</span>
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
          <p class="preview-col-label">{$_("home.sourceCol")}</p>
          {#if inputPreviewUrl}
            <img src={inputPreviewUrl} alt={$_("home.sourceAlt")} class="preview-img" />
          {:else if videoPreviewUrl}
            <!-- svelte-ignore a11y_media_has_caption -->
            <video src={videoPreviewUrl} controls class="preview-img preview-video"></video>
          {:else if probeSummary.inferredKind === "audio"}
            <canvas
              bind:this={waveformCanvas}
              width="320"
              height="80"
              class="waveform-canvas"
              aria-label={$_("home.waveformAria")}
            ></canvas>
          {:else}
            <div class="preview-placeholder" aria-label={$_("home.noPreviewAria")}>
              <span class="placeholder-kind">{$_("home.placeholderVideo")}</span>
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
          <p class="preview-col-label">{$_("home.outputCol")}</p>
          {#if outputPreviewUrl}
            <img src={outputPreviewUrl} alt={$_("home.outputAlt")} class="preview-img" />
          {:else if outputPath}
            <div class="preview-placeholder done" aria-label={$_("home.doneAria")}>
              <span class="placeholder-done-mark">&#10003;</span>
            </div>
          {:else}
            <div class="preview-placeholder pending" aria-label={$_("home.pendingAria")}>
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
              {$_("common.showInFolder")}
            </button>
          {:else}
            <p class="preview-filename muted-hint">{$_("home.outputAfterHint")}</p>
          {/if}
        </div>
      </div>
    {/if}

    <section class="settings-block" aria-labelledby="simple-settings">
      <h3 class="block-title" id="simple-settings">{$_("home.simpleSettings")}</h3>
      <div class="grid">
        <label class="field">
          <span>{$_("home.targetFormat")}</span>
          <select
            bind:value={targetProfileId}
            disabled={!probeSummary || targetsWithAvailability.length === 0}
          >
            {#if !probeSummary}
              <option value={targetProfileId}>{$_("home.pickFileFirst")}</option>
            {:else}
              {#if groupedTargets.general.length > 0}
                <optgroup label={$_("home.groupGeneral")}>
                  {#each groupedTargets.general as row (row.profile.id)}
                    <option value={row.profile.id} disabled={!row.ok}>
                      {profileLabel(row.profile, $locale)}{!row.ok ? $_("home.missingEncoderSuffix") : ""}
                    </option>
                  {/each}
                </optgroup>
              {/if}
              {#each groupedTargets.platforms as [platformLabel, rows] (platformLabel)}
                <optgroup label={platformLabel}>
                  {#each rows as row (row.profile.id)}
                    <option value={row.profile.id} disabled={!row.ok}>
                      {profileLabel(row.profile, $locale)}{!row.ok ? $_("home.missingEncoderSuffix") : ""}
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
            <p class="social-info-title">{sm.platformLabel}</p>
            <p class="social-info-text">{socialInfo(sm, $locale)}</p>
          </div>
        {/if}

        {#if simpleFields.includes("quality_preset")}
          <div class="field">
            <label for="quality-select">{$_("home.qualityPreset")}</label>
            <select id="quality-select" bind:value={qualityPreset}>
              {#each QUALITY_OPTIONS as opt (opt.value)}
                <option value={opt.value} title={$_(opt.descKey)}>{$_(opt.labelKey)}</option>
              {/each}
            </select>
            <p class="field-hint">
              {(() => {
                const key = QUALITY_OPTIONS.find((o) => o.value === qualityPreset)?.descKey;
                return key ? $_(key) : "";
              })()}
            </p>
          </div>
        {/if}

        {#if simpleFields.includes("resolution_preset") && !selectedHints?.audioOnlyOutput}
          <div class="field">
            <label for="resolution-select">{$_("home.resolution")}</label>
            <select id="resolution-select" bind:value={resolutionPreset}>
              {#each RESOLUTION_OPTIONS as opt (opt.value)}
                <option value={opt.value}>{opt.label ?? $_(opt.labelKey!)}</option>
              {/each}
            </select>
            {#if resolutionPreset === "custom"}
              <input
                type="number"
                class="number-input"
                min="64"
                max="7680"
                step="2"
                placeholder={$_("home.widthPlaceholder")}
                value={customWidth ?? ""}
                oninput={(e) => {
                  const v = parseInt((e.currentTarget as HTMLInputElement).value, 10);
                  customWidth = Number.isInteger(v) && v > 0 ? v : null;
                }}
              />
            {/if}
          </div>

          <div class="field">
            <label for="aspect-ratio-select">{$_("home.aspectRatio")}</label>
            <select id="aspect-ratio-select" bind:value={aspectRatioPreset}>
              {#each ASPECT_RATIO_OPTIONS as opt (opt.value)}
                <option value={opt.value}>{$_(opt.labelKey)}</option>
              {/each}
            </select>
            {#if aspectRatioPreset === "custom"}
              <input
                type="text"
                class="number-input"
                placeholder={$_("home.aspectPlaceholder")}
                bind:value={customAspectRatio}
              />
              <p class="field-hint">{$_("home.aspectHint")}</p>
            {:else if aspectRatioPreset !== "original"}
              <p class="field-hint">{$_("home.aspectHint")}</p>
            {/if}
          </div>
        {/if}
      </div>

      {#if noAudioWarning}
        <p class="warn">{$_("home.noAudioWarn")}</p>
      {/if}

      {#if selectedRow && !selectedRow.ok}
        <p class="warn">
          {$_("home.missingEncodersPrefix")}
          <strong>{selectedRow.missing.join(", ")}</strong>{$_("home.missingEncodersSuffix")}
        </p>
      {/if}
    </section>

    {#if profiles.length > 0 || showProfileSave}
      <details class="profiles-section">
        <summary>{$_("home.savedProfiles", { values: { count: profiles.length } })}</summary>
        <div class="profiles-body">
          {#each profiles as p (p.id)}
            <div class="profile-row">
              <span class="profile-name" title={`${p.targetProfileId}${p.qualityPreset ? ' · ' + p.qualityPreset : ''}`}>{p.name}</span>
              <button type="button" class="profile-load-btn" onclick={() => void applyProfile(p)}>{$_("home.applyProfile")}</button>
              <button type="button" class="profile-del-btn" onclick={() => void deleteProfile(p.id)}>{$_("home.deleteProfile")}</button>
            </div>
          {/each}
          {#if showProfileSave}
            <div class="profile-save-row">
              <input
                type="text"
                class="profile-name-input"
                placeholder={$_("home.profileNamePlaceholder")}
                bind:value={profileSaveName}
                onkeydown={(e) => e.key === "Enter" && void saveCurrentProfile()}
              />
              <button type="button" class="profile-load-btn" onclick={() => void saveCurrentProfile()} disabled={!profileSaveName.trim()}>{$_("home.saveBtn")}</button>
              <button type="button" class="profile-del-btn" onclick={() => { showProfileSave = false; profileSaveName = ""; }}>{$_("common.cancel")}</button>
            </div>
          {:else}
            <button type="button" class="profile-add-btn" onclick={() => (showProfileSave = true)}>{$_("home.addProfile")}</button>
          {/if}
        </div>
      </details>
    {:else}
      <button type="button" class="profile-add-btn-inline" onclick={() => (showProfileSave = true)}>
        {$_("home.addProfileInline")}
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
            ? $_("home.convertProgressBtn", { values: { percent: Math.round(convertProgress) } })
            : $_("home.convertRunning")
          : $_("home.startConvert")}
      </button>
      {#if convertBusy}
        <button
          type="button"
          class="cta stop-btn"
          onclick={() => void cancelConversion()}
        >{$_("home.stop")}</button>
      {:else if probeSummary?.inferredKind === "video" && filePath && !convertBusy}
        <button
          type="button"
          class="cta quick-audio-btn"
          title={$_("home.quickAudioTitle")}
          onclick={() => void quickExtractAudio()}
        >{$_("home.quickAudio")}</button>
      {/if}
      {#if convertToast}
        <p class="convert-status" role="status">{convertToast}</p>
      {/if}
    </div>

    {#if convertLog.length > 0}
      <details class="log-details">
        <summary>{$_("home.logSummary", { values: { count: convertLog.length } })}</summary>
        <pre class="log-output" aria-live="polite">{convertLog.join("\n")}</pre>
        <div class="log-actions">
          <button type="button" class="log-clear-btn" onclick={() => (convertLog = [])}>{$_("home.clearLog")}</button>
        </div>
      </details>
    {/if}

    <details class="advanced">
      <summary>{$_("home.advanced")}</summary>
      <div class="advanced-body">
        {#if capsLoading}
          <p class="muted">{$_("home.codecLoading")}</p>
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
                title={encoderSet.has(enc)
                  ? $_("home.encoderPresentTitle", { values: { enc } })
                  : $_("home.encoderMissingTitle", { values: { enc } })}
              >
                {enc}: {encoderSet.has(enc) ? $_("home.encoderInstalled") : $_("home.encoderMissing")}
              </span>
            {/each}
          </div>
        {/if}

        {#if advancedFields.includes("hwaccel_list")}
          <p class="meta-row" title={$_("home.hwAccelTitle")}>
            <span class="label">{$_("home.hwAccel")}</span>
            <span class="value">{hwaccels.length ? hwaccels.join(", ") : "—"}</span>
          </p>
        {/if}

        {#if advancedFields.includes("override_video_encoder") && selectedRow?.profile.hasVideoOut}
          <label class="field" title={$_("home.encoderSelectTitle")}>
            <span>{$_("home.videoEncoder")}</span>
            <select bind:value={overrideVideoEncoder} onchange={() => (encoderPickedByUser = true)}>
              <option value="">{$_("home.encoderDefault")}</option>
              {#each Object.entries(ENCODER_LABEL_KEYS) as [enc, labelKey] (enc)}
                {#if encoderSet.has(enc)}
                  <option value={enc}>{$_(labelKey)}</option>
                {/if}
              {/each}
            </select>
            {#if overrideVideoEncoder && GPU_ENCODERS.has(overrideVideoEncoder)}
              <p class="field-hint gpu-hint">{$_("home.gpuHint")}</p>
            {/if}
          </label>
        {/if}

        {#if probeSummary && probeSummary.inferredKind !== "image-only"}
          <label class="field">
            <span>{$_("home.maxSize")}</span>
            <input
              type="number"
              class="number-input"
              min="1"
              step="1"
              placeholder={$_("home.noLimit")}
              value={targetSizeMb ?? ""}
              oninput={(e) => {
                const v = parseFloat((e.currentTarget as HTMLInputElement).value);
                targetSizeMb = Number.isFinite(v) && v > 0 ? v : null;
              }}
            />
            <p class="field-hint">{$_("home.maxSizeHint")}</p>
          </label>
        {/if}

        {#if probeSummary && !selectedHints?.audioOnlyOutput && probeSummary.hasAudio !== false}
          <label class="field">
            <span>{$_("home.audioChannels")}</span>
            <select bind:value={audioChannels}>
              <option value="">{$_("home.audioSame")}</option>
              <option value="1">{$_("home.audioMono")}</option>
              <option value="2">{$_("home.audioStereo")}</option>
            </select>
            <p class="field-hint">{$_("home.audioHint")}</p>
          </label>
        {/if}

        <label class="field">
          <span>{$_("home.extraArgs")}</span>
          <input
            type="text"
            class="text-input"
            placeholder="-bf 2 -g 30 -movflags +faststart"
            bind:value={extraFfmpegArgsRaw}
          />
          <p class="field-hint">{$_("home.extraArgsHint")}</p>
        </label>

        {#if previewLine}
          <div class="preview">
            <span class="preview-label">{$_("home.argsPreview")}</span>
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
            {$_("home.ffmpegUnknownDuration")}
          {/if}
        {:else}
          {$_("home.progressIdle")}
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
