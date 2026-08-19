<script lang="ts">
  import { browser } from "$app/environment";
  import { _ } from "svelte-i18n";
  import { get } from "svelte/store";
  import { onMount } from "svelte";
  import { recordConversion } from "$lib/history/store";
  import { normalizeExtension } from "@lfc/media-formats";
  import type { VideoEncoderChoice, AudioEncoderChoice } from "@lfc/types";

  type AspectRatioPreset = "16:9" | "9:16" | "1:1" | "4:3" | "21:9" | "custom";

  const RATIO_OPTIONS: { value: AspectRatioPreset; label: string | null; descKey: string }[] = [
    { value: "16:9",  label: "16:9", descKey: "aspectRatio.desc169" },
    { value: "9:16",  label: "9:16", descKey: "aspectRatio.desc916" },
    { value: "1:1",   label: "1:1",  descKey: "aspectRatio.desc11" },
    { value: "4:3",   label: "4:3",  descKey: "aspectRatio.desc43" },
    { value: "21:9",  label: "21:9", descKey: "aspectRatio.desc219" },
    // Etiketi çevrilen tek seçenek: diğerleri sayısal oran.
    { value: "custom",label: null,   descKey: "aspectRatio.descCustom" },
  ];

  // Supported: video + image (audio has no aspect ratio)
  const VIDEO_EXTS = new Set(["mp4","m4v","mkv","webm","avi","mov","wmv","flv","ogv","mpg","mpeg","ts","m2ts","mts","3gp","3g2","asf","divx","vob","f4v","dv"]);
  const IMAGE_EXTS = new Set(["png","jpg","jpeg","webp","bmp","tif","tiff","heic","heif","avif","gif"]);

  const hasLfc = browser && typeof window !== "undefined" && "lfc" in window && !!window.lfc;

  let filePath = $state<string | null>(null);
  let fileLabel = $state<string | null>(null);
  let isDragging = $state(false);
  let fileError = $state<string | null>(null);
  let isImage = $state(false);
  let inputPreviewUrl = $state<string | null>(null);

  let selectedRatio = $state<AspectRatioPreset>("16:9");
  let customRatio = $state("3:2");

  let busy = $state(false);
  let progress = $state<number | null>(null);
  let toast = $state<string | null>(null);
  let toastError = $state(false);
  let outputPath = $state<string | null>(null);
  let outputPreviewUrl = $state<string | null>(null);

  onMount(() => {
    // Progress callback geçici olarak başlatılır — startCrop içinde kullanılır
  });

  function getFileType(name: string): "video" | "image" | null {
    const ext = normalizeExtension(name);
    if (VIDEO_EXTS.has(ext)) return "video";
    if (IMAGE_EXTS.has(ext)) return "image";
    return null;
  }

  async function loadFile(path: string, label: string) {
    fileError = null;
    outputPath = null;
    outputPreviewUrl = null;
    toast = null;
    const kind = getFileType(label);
    if (!kind) {
      fileError = get(_)("aspectRatio.unsupported");
      return;
    }
    filePath = path;
    fileLabel = label;
    isImage = kind === "image";
    inputPreviewUrl = null;
    if (isImage && hasLfc) {
      const r = await window.lfc.readFilePreview(path);
      if (r.ok) inputPreviewUrl = r.dataUrl;
    }
  }

  async function onPick() {
    if (!hasLfc) return;
    const r = await window.lfc.showOpenMediaDialog();
    if (r.canceled === false) {
      const base = r.filePath.split(/[/\\]/).pop() ?? "dosya";
      await loadFile(r.filePath, base);
    }
  }

  function onDrop(e: DragEvent) {
    isDragging = false;
    if (!hasLfc) return;
    const file = e.dataTransfer?.files.item(0);
    if (!file) return;
    try {
      const path = window.lfc.getPathForFile(file);
      void loadFile(path, file.name);
    } catch {
      fileError = get(_)("common.pathFailed");
    }
  }

  function onInputChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.item(0);
    if (!file || !hasLfc) return;
    try {
      const path = window.lfc.getPathForFile(file);
      void loadFile(path, file.name);
    } catch {
      fileError = get(_)("common.pathFailed");
    }
    input.value = "";
  }

  function effectiveRatio(): string {
    return selectedRatio === "custom" ? customRatio.trim() : selectedRatio;
  }

  function suggestOutputName(input: string, ext: string): string {
    const dot = input.lastIndexOf(".");
    const base = dot >= 0 ? input.slice(0, dot) : input;
    const ratio = effectiveRatio().replace(":", "x");
    return `${base}-${ratio}.${ext}`;
  }

  async function startCrop() {
    if (!hasLfc || !filePath || !fileLabel) return;
    const ratio = effectiveRatio();
    if (!/^\d+:\d+$/.test(ratio)) {
      toast = get(_)("aspectRatio.invalidRatio");
      toastError = true;
      return;
    }
    const ext = normalizeExtension(fileLabel);
    const dirResult = await window.lfc.getOutputDir();
    if (dirResult.ok === false) {
      toast = get(_)("common.outputDirFailed", { values: { message: dirResult.message } });
      toastError = true;
      return;
    }
    const filename = suggestOutputName(fileLabel, ext);
    const sep = dirResult.dir.includes("\\") ? "\\" : "/";
    const outPath = `${dirResult.dir}${sep}${filename}`;

    // Decide encoder based on file type
    const videoEncoder: VideoEncoderChoice = isImage
      ? (ext === "jpg" || ext === "jpeg" ? "mjpeg" : ext === "webp" ? "libwebp" : "png")
      : "libx264";
    const audioEncoder: AudioEncoderChoice | undefined = isImage ? undefined : "copy";

    busy = true;
    progress = null;
    toast = null;
    toastError = false;
    outputPath = null;
    outputPreviewUrl = null;

    const spec = {
      inputPath: filePath,
      outputPath: outPath,
      mode: "transcode" as const,
      videoEncoder,
      audioEncoder,
      videoHints: {
        aspectRatio: ratio,
        qualityPreset: "balanced" as const,
        ...(isImage ? {} : {}),
      },
      ...(isImage ? {} : { copyAllStreams: false }),
    };

    const r = await window.lfc.runConvertJob(
      { spec, inputDurationSec: null },
      (percent) => { progress = percent; }
    );
    busy = false;

    const dot = fileLabel.lastIndexOf(".");
    const inputExt = dot >= 0 ? fileLabel.slice(dot + 1).toLowerCase() : ext;
    const outputFilename = suggestOutputName(fileLabel, ext);

    if (r.ok) {
      outputPath = outPath;
      toast = get(_)("aspectRatio.done");
      await recordConversion({
        inputFilename: fileLabel,
        inputExt,
        outputFilename,
        outputExt: ext,
        outputPath: outPath,
        targetProfileId: `crop-${ratio.replace(":", "x")}`,
        timestamp: Date.now(),
        status: "success",
      });
      if (isImage) {
        const prev = await window.lfc.readFilePreview(outPath);
        if (prev.ok) outputPreviewUrl = prev.dataUrl;
      }
    } else {
      const unknown = get(_)("common.unknownError");
      const errMsg = r.ok === false ? (r.message ?? unknown) : unknown;
      toast = get(_)("common.errorWith", { values: { message: errMsg } });
      toastError = true;
      await recordConversion({
        inputFilename: fileLabel,
        inputExt,
        outputFilename,
        outputExt: ext,
        outputPath: outPath,
        targetProfileId: `crop-${ratio.replace(":", "x")}`,
        timestamp: Date.now(),
        status: "error",
        errorMessage: errMsg,
      });
    }
  }

  async function cancelCrop() {
    if (hasLfc) await window.lfc.cancelConvert();
    busy = false;
    progress = null;
    toast = get(_)("common.canceled");
    toastError = false;
  }

  const canStart = $derived(Boolean(filePath && !busy && hasLfc));
  const ratioVisual = $derived(() => {
    const ratio = selectedRatio === "custom" ? customRatio : selectedRatio;
    const parts = ratio.split(":");
    const w = Number(parts[0]);
    const h = Number(parts[1]);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return { width: 64, height: 64 };
    const maxW = 96;
    const maxH = 64;
    const scale = Math.min(maxW / w, maxH / h);
    return { width: Math.round(w * scale), height: Math.round(h * scale) };
  });
</script>

<div class="page">
  <header class="page-header">
    <h1 class="page-title">{$_("aspectRatio.title")}</h1>
    <p class="page-sub">{$_("aspectRatio.subtitle")}</p>
  </header>

  <!-- Dosya Seçici -->
  <section class="card">
    <h2 class="card-title">{$_("aspectRatio.inputFile")}</h2>
    <div
      class="drop-zone"
      class:drag={isDragging}
      class:has-file={!!filePath}
      role="button"
      tabindex="0"
      aria-label={$_("common.pickFileHint")}
      ondragover={(e) => { e.preventDefault(); isDragging = true; }}
      ondragleave={() => (isDragging = false)}
      ondrop={(e) => { e.preventDefault(); onDrop(e); }}
      onclick={onPick}
      onkeydown={(e) => e.key === "Enter" && onPick()}
    >
      {#if filePath}
        <div class="file-info">
          {#if inputPreviewUrl}
            <img class="preview-thumb" src={inputPreviewUrl} alt={$_("common.preview")} />
          {:else}
            <span class="file-icon" aria-hidden="true">🎬</span>
          {/if}
          <span class="file-name">{fileLabel}</span>
          <span class="change-hint">{$_("common.changeHint")}</span>
        </div>
      {:else}
        <div class="drop-hint">
          <span class="drop-icon" aria-hidden="true">📂</span>
          <span>{$_("aspectRatio.pickHint")}</span>
          <span class="drop-sub">{$_("aspectRatio.pickSub")}</span>
        </div>
      {/if}
    </div>
    <input
      type="file"
      accept="video/*,image/*"
      class="sr-only"
      onchange={onInputChange}
      tabindex="-1"
      aria-hidden="true"
    />
    {#if fileError}
      <p class="error-msg" role="alert">{fileError}</p>
    {/if}
  </section>

  <!-- Oran Seçici -->
  <section class="card">
    <h2 class="card-title">{$_("aspectRatio.ratio")}</h2>
    <div class="ratio-grid">
      {#each RATIO_OPTIONS as opt (opt.value)}
        <button
          type="button"
          class="ratio-btn"
          class:active={selectedRatio === opt.value}
          onclick={() => (selectedRatio = opt.value)}
        >
          <span class="ratio-label">{opt.label ?? $_("common.custom")}</span>
          <span class="ratio-desc">{$_(opt.descKey)}</span>
        </button>
      {/each}
    </div>

    {#if selectedRatio === "custom"}
      <div class="custom-ratio-row">
        <label for="custom-ratio" class="field-label">{$_("aspectRatio.customRatio")}</label>
        <input
          id="custom-ratio"
          class="text-input"
          type="text"
          placeholder={$_("aspectRatio.customPlaceholder")}
          bind:value={customRatio}
        />
      </div>
    {/if}

    <!-- Oran görsel önizlemesi -->
    <div class="ratio-preview-wrap" aria-hidden="true">
      <div
        class="ratio-preview-box"
        style="width:{ratioVisual().width}px; height:{ratioVisual().height}px"
      ></div>
      <span class="ratio-preview-label">
        {selectedRatio === "custom" ? customRatio : selectedRatio}
      </span>
    </div>
  </section>

  <!-- Çıktı Önizleme -->
  {#if outputPreviewUrl}
    <section class="card">
      <h2 class="card-title">{$_("aspectRatio.outputPreview")}</h2>
      <div class="output-preview">
        <img class="output-img" src={outputPreviewUrl} alt={$_("aspectRatio.outputAlt")} />
      </div>
    </section>
  {/if}

  <!-- Kontrol Paneli -->
  <section class="card action-card">
    {#if toast}
      <p class="toast" class:toast-error={toastError} role="status">{toast}</p>
    {/if}

    {#if outputPath && !busy}
      <button
        type="button"
        class="btn btn-secondary"
        onclick={() => hasLfc && window.lfc.showInFolder(outputPath!)}
      >
        {$_("common.showInDir")}
      </button>
    {/if}

    {#if busy}
      <div class="progress-wrap">
        <div class="progress-bar">
          <div
            class="progress-fill"
            style="width:{progress != null ? progress : 0}%"
            class:indeterminate={progress == null}
          ></div>
        </div>
        <span class="progress-label">
          {progress != null ? `%${Math.round(progress)}` : $_("common.processing")}
        </span>
      </div>
      <button type="button" class="btn btn-danger" onclick={cancelCrop}>{$_("common.cancel")}</button>
    {:else}
      <button
        type="button"
        class="btn btn-primary"
        disabled={!canStart}
        onclick={startCrop}
      >
        {filePath ? $_("aspectRatio.start") : $_("common.selectFileFirstBtn")}
      </button>
    {/if}
  </section>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    max-width: 640px;
  }

  .page-header {
    margin-bottom: 0.25rem;
  }

  .page-title {
    font-size: 1.45rem;
    font-weight: 700;
    margin: 0 0 0.3rem;
    background: linear-gradient(90deg, var(--accent-start), var(--accent-end));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .page-sub {
    font-size: 0.88rem;
    color: var(--muted);
    margin: 0;
  }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    padding: 1.25rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .card-title {
    font-size: 0.85rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--muted);
    margin: 0;
  }

  .drop-zone {
    border: 2px dashed var(--border);
    border-radius: var(--radius-button);
    padding: 2rem 1rem;
    text-align: center;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
    color: var(--muted);
    font-size: 0.9rem;
    user-select: none;
  }

  .drop-zone:hover,
  .drop-zone.drag {
    border-color: var(--accent-start);
    background: rgba(56, 189, 248, 0.05);
  }

  .drop-zone.has-file {
    border-style: solid;
    border-color: var(--border);
    padding: 1rem;
  }

  .file-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    justify-content: center;
    flex-wrap: wrap;
  }

  .file-icon {
    font-size: 1.5rem;
  }

  .preview-thumb {
    width: 3rem;
    height: 3rem;
    object-fit: cover;
    border-radius: 6px;
    border: 1px solid var(--border);
  }

  .file-name {
    font-weight: 600;
    font-size: 0.92rem;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 18ch;
  }

  .change-hint {
    font-size: 0.75rem;
    color: var(--muted);
  }

  .drop-hint {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
  }

  .drop-icon {
    font-size: 2rem;
    margin-bottom: 0.25rem;
  }

  .drop-sub {
    font-size: 0.78rem;
    color: var(--muted);
    opacity: 0.7;
  }

  .error-msg {
    color: var(--danger);
    font-size: 0.84rem;
    margin: 0;
    padding: 0.5rem 0.75rem;
    background: rgba(239, 68, 68, 0.08);
    border-radius: 8px;
    border: 1px solid rgba(239, 68, 68, 0.2);
  }

  .ratio-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.6rem;
  }

  .ratio-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    padding: 0.75rem 0.5rem;
    border-radius: var(--radius-button);
    border: 1px solid var(--border);
    background: var(--surface-elevated);
    color: var(--text);
    cursor: pointer;
    transition: border-color 0.12s, background 0.12s;
    text-align: center;
  }

  .ratio-btn:hover {
    border-color: var(--accent-start);
    background: var(--surface-hover);
  }

  .ratio-btn.active {
    border-color: var(--accent-start);
    background: rgba(56, 189, 248, 0.1);
    color: var(--accent-start);
  }

  .ratio-label {
    font-size: 1rem;
    font-weight: 700;
  }

  .ratio-desc {
    font-size: 0.7rem;
    color: var(--muted);
    line-height: 1.3;
  }

  .ratio-btn.active .ratio-desc {
    color: var(--accent-start);
    opacity: 0.8;
  }

  .custom-ratio-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .field-label {
    font-size: 0.84rem;
    color: var(--muted);
    white-space: nowrap;
  }

  .text-input {
    flex: 1;
    background: var(--surface-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-button);
    color: var(--text);
    font: inherit;
    font-size: 0.9rem;
    padding: 0.45rem 0.75rem;
  }

  .text-input:focus {
    outline: none;
    border-color: var(--accent-start);
  }

  .ratio-preview-wrap {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 0 0.25rem;
    border-top: 1px solid var(--border);
  }

  .ratio-preview-box {
    background: linear-gradient(135deg, var(--accent-start) 0%, var(--accent-end) 100%);
    border-radius: 6px;
    opacity: 0.7;
    transition: width 0.2s, height 0.2s;
    flex-shrink: 0;
  }

  .ratio-preview-label {
    font-size: 0.85rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .output-preview {
    display: flex;
    justify-content: center;
  }

  .output-img {
    max-width: 100%;
    max-height: 280px;
    border-radius: 10px;
    border: 1px solid var(--border);
    object-fit: contain;
  }

  .action-card {
    gap: 0.75rem;
  }

  .toast {
    margin: 0;
    padding: 0.55rem 0.85rem;
    border-radius: 8px;
    font-size: 0.87rem;
    background: rgba(34, 197, 94, 0.1);
    border: 1px solid rgba(34, 197, 94, 0.25);
    color: var(--success);
  }

  .toast.toast-error {
    background: rgba(239, 68, 68, 0.08);
    border-color: rgba(239, 68, 68, 0.2);
    color: var(--danger);
  }

  .progress-wrap {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .progress-bar {
    flex: 1;
    height: 6px;
    background: var(--surface-elevated);
    border-radius: 999px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent-start), var(--accent-end));
    border-radius: 999px;
    transition: width 0.25s ease;
  }

  .progress-fill.indeterminate {
    width: 40% !important;
    animation: slide 1.2s ease-in-out infinite;
  }

  @keyframes slide {
    0%   { transform: translateX(-120%); }
    100% { transform: translateX(350%); }
  }

  .progress-label {
    font-size: 0.82rem;
    color: var(--muted);
    white-space: nowrap;
    min-width: 4ch;
    font-variant-numeric: tabular-nums;
  }

  .btn {
    padding: 0.6rem 1.4rem;
    border-radius: var(--radius-button);
    border: 1px solid transparent;
    font: inherit;
    font-size: 0.92rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.12s, background 0.12s;
    align-self: flex-start;
  }

  .btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .btn-primary {
    background: linear-gradient(90deg, var(--accent-start), var(--accent-end));
    color: #fff;
    border-color: transparent;
  }

  .btn-primary:not(:disabled):hover {
    opacity: 0.88;
  }

  .btn-secondary {
    background: var(--surface-elevated);
    color: var(--text);
    border-color: var(--border);
  }

  .btn-secondary:hover {
    background: var(--surface-hover);
  }

  .btn-danger {
    background: rgba(239, 68, 68, 0.12);
    color: var(--danger);
    border-color: rgba(239, 68, 68, 0.3);
  }

  .btn-danger:hover {
    background: rgba(239, 68, 68, 0.2);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0,0,0,0);
    white-space: nowrap;
    border: 0;
  }
</style>
