<script lang="ts">
  import { browser } from "$app/environment";
  import { onMount } from "svelte";
  import { recordConversion } from "$lib/history/store";
  import { normalizeExtension } from "@lfc/media-formats";
  import type { VideoEncoderChoice, AudioEncoderChoice } from "@lfc/types";

  type ResolutionPreset = "360p" | "480p" | "720p" | "1080p" | "1440p" | "2160p" | "custom";

  const PRESET_OPTIONS: { value: ResolutionPreset; label: string; desc: string; width: number }[] = [
    { value: "360p",  label: "360p",       desc: "640 × 360 — düşük bant",   width: 640  },
    { value: "480p",  label: "480p",       desc: "854 × 480 — SD",            width: 854  },
    { value: "720p",  label: "720p HD",    desc: "1280 × 720 — HD",           width: 1280 },
    { value: "1080p", label: "1080p FHD",  desc: "1920 × 1080 — Full HD",     width: 1920 },
    { value: "1440p", label: "1440p 2K",   desc: "2560 × 1440 — 2K / QHD",   width: 2560 },
    { value: "2160p", label: "2160p 4K",   desc: "3840 × 2160 — 4K / UHD",   width: 3840 },
    { value: "custom",label: "Özel",       desc: "Kendi genişliğini gir",     width: 0    },
  ];

  const VIDEO_EXTS = new Set(["mp4","m4v","mkv","webm","avi","mov","wmv","flv","ogv","mpg","mpeg","ts","m2ts","mts","3gp","3g2","asf","divx","vob","f4v","dv"]);
  const IMAGE_EXTS = new Set(["png","jpg","jpeg","webp","bmp","tif","tiff","heic","heif","avif","gif"]);

  const hasLfc = browser && typeof window !== "undefined" && "lfc" in window && !!window.lfc;

  let filePath = $state<string | null>(null);
  let fileLabel = $state<string | null>(null);
  let isDragging = $state(false);
  let fileError = $state<string | null>(null);
  let isImage = $state(false);
  let inputPreviewUrl = $state<string | null>(null);

  let selectedPreset = $state<ResolutionPreset>("720p");
  let customWidth = $state<number>(1280);
  let keepAspect = $state(true);

  let busy = $state(false);
  let progress = $state<number | null>(null);
  let toast = $state<string | null>(null);
  let outputPath = $state<string | null>(null);
  let outputPreviewUrl = $state<string | null>(null);

  onMount(() => {});

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
      fileError = "Desteklenmeyen dosya türü. Yalnızca video ve görüntü dosyaları kabul edilir.";
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
      fileError = "Dosya yolu alınamadı.";
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
      fileError = "Dosya yolu alınamadı.";
    }
    input.value = "";
  }

  function effectiveWidth(): number {
    if (selectedPreset === "custom") return customWidth;
    return PRESET_OPTIONS.find((p) => p.value === selectedPreset)?.width ?? 1280;
  }

  function suggestOutputName(input: string, ext: string): string {
    const dot = input.lastIndexOf(".");
    const base = dot >= 0 ? input.slice(0, dot) : input;
    return `${base}-${effectiveWidth()}px.${ext}`;
  }

  async function startResize() {
    if (!hasLfc || !filePath || !fileLabel) return;
    const width = effectiveWidth();
    if (!width || width <= 0 || width > 7680) {
      toast = "Geçersiz genişlik. 1–7680 arasında bir değer gir.";
      return;
    }

    const ext = normalizeExtension(fileLabel);
    const dirResult = await window.lfc.getOutputDir();
    if (dirResult.ok === false) {
      toast = `Çıktı klasörü oluşturulamadı: ${dirResult.message}`;
      return;
    }
    const filename = suggestOutputName(fileLabel, ext);
    const sep = dirResult.dir.includes("\\") ? "\\" : "/";
    const outPath = `${dirResult.dir}${sep}${filename}`;

    const videoEncoder: VideoEncoderChoice = isImage
      ? (ext === "jpg" || ext === "jpeg" ? "mjpeg" : ext === "webp" ? "libwebp" : "png")
      : "libx264";
    const audioEncoder: AudioEncoderChoice | undefined = isImage ? undefined : "copy";

    busy = true;
    progress = null;
    toast = null;
    outputPath = null;
    outputPreviewUrl = null;

    // keepAspect: height = -2 (proportional), else fixed width only
    const spec = {
      inputPath: filePath,
      outputPath: outPath,
      mode: "transcode" as const,
      videoEncoder,
      audioEncoder,
      videoHints: {
        width,
        ...(keepAspect ? {} : {}),
        qualityPreset: "balanced" as const,
      },
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
      toast = "Yeniden boyutlandırma tamamlandı!";
      await recordConversion({
        inputFilename: fileLabel,
        inputExt,
        outputFilename,
        outputExt: ext,
        outputPath: outPath,
        targetProfileId: `resize-${width}px`,
        timestamp: Date.now(),
        status: "success",
      });
      if (isImage) {
        const prev = await window.lfc.readFilePreview(outPath);
        if (prev.ok) outputPreviewUrl = prev.dataUrl;
      }
    } else {
      const errMsg = r.ok === false ? (r.message ?? "Bilinmeyen hata") : "Bilinmeyen hata";
      toast = `Hata: ${errMsg}`;
      await recordConversion({
        inputFilename: fileLabel,
        inputExt,
        outputFilename,
        outputExt: ext,
        outputPath: outPath,
        targetProfileId: `resize-${width}px`,
        timestamp: Date.now(),
        status: "error",
        errorMessage: errMsg,
      });
    }
  }

  async function cancelResize() {
    if (hasLfc) await window.lfc.cancelConvert();
    busy = false;
    progress = null;
    toast = "İptal edildi.";
  }

  const canStart = $derived(Boolean(filePath && !busy && hasLfc));
  const currentWidth = $derived(effectiveWidth());
</script>

<div class="page">
  <header class="page-header">
    <h1 class="page-title">Çözünürlük Ölçekleme</h1>
    <p class="page-sub">Videoyu veya görüntüyü belirtilen genişliğe yeniden boyutlandırır. En-boy oranı korunur.</p>
  </header>

  <!-- Dosya Seçici -->
  <section class="card">
    <h2 class="card-title">Dosya Seç</h2>
    <div
      class="drop-zone"
      class:drag={isDragging}
      class:has-file={!!filePath}
      role="button"
      tabindex="0"
      aria-label="Dosya seçmek için tıkla veya sürükle bırak"
      ondragover={(e) => { e.preventDefault(); isDragging = true; }}
      ondragleave={() => (isDragging = false)}
      ondrop={(e) => { e.preventDefault(); onDrop(e); }}
      onclick={onPick}
      onkeydown={(e) => e.key === "Enter" && onPick()}
    >
      {#if filePath}
        <div class="file-info">
          {#if inputPreviewUrl}
            <img class="preview-thumb" src={inputPreviewUrl} alt="Önizleme" />
          {:else}
            <span class="file-icon" aria-hidden="true">🎬</span>
          {/if}
          <span class="file-name">{fileLabel}</span>
          <span class="change-hint">Değiştirmek için tıkla</span>
        </div>
      {:else}
        <div class="drop-hint">
          <span class="drop-icon" aria-hidden="true">📂</span>
          <span>Video veya görüntü dosyasını sürükle ya da tıkla</span>
          <span class="drop-sub">MP4, MKV, MOV, PNG, JPG, WebP ve daha fazlası</span>
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

  <!-- Çözünürlük Seçici -->
  <section class="card">
    <h2 class="card-title">Hedef Çözünürlük</h2>

    <div class="preset-grid">
      {#each PRESET_OPTIONS as opt (opt.value)}
        <button
          type="button"
          class="preset-btn"
          class:active={selectedPreset === opt.value}
          onclick={() => (selectedPreset = opt.value)}
        >
          <span class="preset-label">{opt.label}</span>
          <span class="preset-desc">{opt.desc}</span>
        </button>
      {/each}
    </div>

    {#if selectedPreset === "custom"}
      <div class="custom-row">
        <label for="custom-width" class="field-label">Genişlik (px)</label>
        <input
          id="custom-width"
          class="num-input"
          type="number"
          min="1"
          max="7680"
          step="2"
          bind:value={customWidth}
        />
        <span class="field-unit">px</span>
      </div>
    {/if}

    <!-- Oran bilgisi -->
    <div class="info-row">
      <span class="info-label">Seçili genişlik:</span>
      <span class="info-value">{currentWidth} px</span>
      <span class="info-label" style="margin-left:1rem">Yükseklik:</span>
      <span class="info-value">orantılı (otomatik)</span>
    </div>

    <!-- En boy oranı koruma -->
    <label class="toggle-row">
      <input type="checkbox" bind:checked={keepAspect} class="sr-only" />
      <span class="toggle-switch" class:on={keepAspect} role="switch" aria-checked={keepAspect}></span>
      <span class="toggle-label">En-boy oranını koru (önerilen)</span>
    </label>
  </section>

  <!-- Çıktı Önizleme -->
  {#if outputPreviewUrl}
    <section class="card">
      <h2 class="card-title">Çıktı Önizlemesi</h2>
      <div class="output-preview">
        <img class="output-img" src={outputPreviewUrl} alt="Yeniden boyutlandırılmış çıktı" />
      </div>
    </section>
  {/if}

  <!-- Kontrol Paneli -->
  <section class="card action-card">
    {#if toast}
      <p class="toast" class:toast-error={toast.startsWith("Hata")} role="status">{toast}</p>
    {/if}

    {#if outputPath && !busy}
      <button
        type="button"
        class="btn btn-secondary"
        onclick={() => hasLfc && window.lfc.showInFolder(outputPath!)}
      >
        Dizinde Göster
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
          {progress != null ? `%${Math.round(progress)}` : "İşleniyor…"}
        </span>
      </div>
      <button type="button" class="btn btn-danger" onclick={cancelResize}>İptal</button>
    {:else}
      <button
        type="button"
        class="btn btn-primary"
        disabled={!canStart}
        onclick={startResize}
      >
        {filePath ? "Yeniden Boyutlandır" : "Önce Dosya Seç"}
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

  .page-header { margin-bottom: 0.25rem; }

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

  .file-icon { font-size: 1.5rem; }

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

  .change-hint { font-size: 0.75rem; color: var(--muted); }

  .drop-hint {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
  }

  .drop-icon { font-size: 2rem; margin-bottom: 0.25rem; }

  .drop-sub { font-size: 0.78rem; color: var(--muted); opacity: 0.7; }

  .error-msg {
    color: var(--danger);
    font-size: 0.84rem;
    margin: 0;
    padding: 0.5rem 0.75rem;
    background: rgba(239, 68, 68, 0.08);
    border-radius: 8px;
    border: 1px solid rgba(239, 68, 68, 0.2);
  }

  .preset-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;
  }

  .preset-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    padding: 0.65rem 0.35rem;
    border-radius: var(--radius-button);
    border: 1px solid var(--border);
    background: var(--surface-elevated);
    color: var(--text);
    cursor: pointer;
    transition: border-color 0.12s, background 0.12s;
    text-align: center;
  }

  .preset-btn:hover {
    border-color: var(--accent-start);
    background: var(--surface-hover);
  }

  .preset-btn.active {
    border-color: var(--accent-start);
    background: rgba(56, 189, 248, 0.1);
    color: var(--accent-start);
  }

  .preset-label {
    font-size: 0.9rem;
    font-weight: 700;
    white-space: nowrap;
  }

  .preset-desc {
    font-size: 0.67rem;
    color: var(--muted);
    line-height: 1.3;
  }

  .preset-btn.active .preset-desc {
    color: var(--accent-start);
    opacity: 0.8;
  }

  .custom-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .field-label {
    font-size: 0.84rem;
    color: var(--muted);
    white-space: nowrap;
  }

  .num-input {
    width: 7rem;
    background: var(--surface-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-button);
    color: var(--text);
    font: inherit;
    font-size: 0.9rem;
    padding: 0.45rem 0.75rem;
    text-align: right;
  }

  .num-input:focus {
    outline: none;
    border-color: var(--accent-start);
  }

  .field-unit {
    font-size: 0.84rem;
    color: var(--muted);
  }

  .info-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
    padding: 0.65rem 0.85rem;
    background: var(--surface-elevated);
    border-radius: 8px;
    border: 1px solid var(--border);
    font-size: 0.84rem;
  }

  .info-label { color: var(--muted); }
  .info-value { font-weight: 600; font-variant-numeric: tabular-nums; }

  .toggle-row {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    cursor: pointer;
    user-select: none;
  }

  .toggle-switch {
    width: 2.2rem;
    height: 1.2rem;
    border-radius: 999px;
    background: var(--border);
    position: relative;
    transition: background 0.15s;
    flex-shrink: 0;
  }

  .toggle-switch::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 0.85rem;
    height: 0.85rem;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.15s;
  }

  .toggle-switch.on {
    background: var(--accent-start);
  }

  .toggle-switch.on::after {
    transform: translateX(1rem);
  }

  .toggle-label { font-size: 0.88rem; color: var(--text); }

  .output-preview { display: flex; justify-content: center; }

  .output-img {
    max-width: 100%;
    max-height: 280px;
    border-radius: 10px;
    border: 1px solid var(--border);
    object-fit: contain;
  }

  .action-card { gap: 0.75rem; }

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

  .btn:disabled { opacity: 0.45; cursor: not-allowed; }

  .btn-primary {
    background: linear-gradient(90deg, var(--accent-start), var(--accent-end));
    color: #fff;
    border-color: transparent;
  }

  .btn-primary:not(:disabled):hover { opacity: 0.88; }

  .btn-secondary {
    background: var(--surface-elevated);
    color: var(--text);
    border-color: var(--border);
  }

  .btn-secondary:hover { background: var(--surface-hover); }

  .btn-danger {
    background: rgba(239, 68, 68, 0.12);
    color: var(--danger);
    border-color: rgba(239, 68, 68, 0.3);
  }

  .btn-danger:hover { background: rgba(239, 68, 68, 0.2); }

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
