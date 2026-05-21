<script lang="ts">
  import { browser } from "$app/environment";

  const VIDEO_EXTS = new Set(["mp4","m4v","mkv","webm","avi","mov","wmv","ts","m2ts","mts","3gp"]);
  const IMAGE_EXTS = new Set(["png","jpg","jpeg","webp","gif"]);

  const hasLfc = browser && typeof window !== "undefined" && "lfc" in window && !!window.lfc;

  let filePath = $state<string | null>(null);
  let fileLabel = $state<string | null>(null);
  let isDraggingVideo = $state(false);
  let fileError = $state<string | null>(null);

  type WatermarkMode = "text" | "image";
  let mode = $state<WatermarkMode>("text");

  let wmText = $state("© Filigran");
  let fontSize = $state(36);
  let fontColor = $state("white");
  let opacity = $state(0.6);

  let imagePath = $state<string | null>(null);
  let imageLabel = $state<string | null>(null);
  let isDraggingImage = $state(false);
  let imageError = $state<string | null>(null);

  type Position = "topleft" | "topright" | "bottomleft" | "bottomright" | "center";
  let position = $state<Position>("bottomright");

  const POSITIONS: { value: Position; label: string }[] = [
    { value: "topleft",     label: "Sol Üst" },
    { value: "topright",    label: "Sağ Üst" },
    { value: "center",      label: "Merkez" },
    { value: "bottomleft",  label: "Sol Alt" },
    { value: "bottomright", label: "Sağ Alt" },
  ];

  let busy = $state(false);
  let progress = $state<number | null>(null);
  let toast = $state<string | null>(null);
  let outputPath = $state<string | null>(null);

  function extOf(name: string) {
    return (name.split(".").pop() ?? "").toLowerCase();
  }

  async function loadVideoFile(path: string, label: string) {
    fileError = null;
    toast = null;
    outputPath = null;
    if (!VIDEO_EXTS.has(extOf(label))) {
      fileError = "Yalnızca video dosyası desteklenir.";
      return;
    }
    filePath = path;
    fileLabel = label;
  }

  async function onPickVideo() {
    if (!hasLfc) return;
    const r = await window.lfc.showOpenMediaDialog();
    if (r.canceled === false) {
      const base = r.filePath.split(/[/\\]/).pop() ?? "dosya";
      await loadVideoFile(r.filePath, base);
    }
  }

  function onDropVideo(e: DragEvent) {
    isDraggingVideo = false;
    if (!hasLfc) return;
    const file = e.dataTransfer?.files.item(0);
    if (!file) return;
    try { void loadVideoFile(window.lfc.getPathForFile(file), file.name); }
    catch { fileError = "Dosya yolu alınamadı."; }
  }

  function loadImageFile(path: string, label: string) {
    imageError = null;
    if (!IMAGE_EXTS.has(extOf(label))) {
      imageError = "PNG, JPG veya WebP görsel seçin.";
      return;
    }
    imagePath = path;
    imageLabel = label;
  }

  function onDropImage(e: DragEvent) {
    isDraggingImage = false;
    if (!hasLfc) return;
    const file = e.dataTransfer?.files.item(0);
    if (!file) return;
    try { loadImageFile(window.lfc.getPathForFile(file), file.name); }
    catch { imageError = "Dosya yolu alınamadı."; }
  }

  const canApply = $derived(Boolean(
    hasLfc && filePath && fileLabel && !busy &&
    (mode === "text" ? wmText.trim().length > 0 : imagePath !== null)
  ));

  async function apply() {
    if (!hasLfc || !filePath || !fileLabel) return;
    const dirResult = await window.lfc.getOutputDir();
    if (dirResult.ok === false) {
      toast = `Çıktı klasörü oluşturulamadı: ${dirResult.message}`;
      return;
    }
    const dot = fileLabel.lastIndexOf(".");
    const base = dot >= 0 ? fileLabel.slice(0, dot) : fileLabel;
    const ext = dot >= 0 ? fileLabel.slice(dot) : ".mp4";
    const out = `${dirResult.dir}/${base}-watermarked${ext}`;

    busy = true;
    progress = null;
    toast = null;
    outputPath = null;

    const r = await window.lfc.watermark(
      {
        inputPath: filePath,
        outputPath: out,
        mode,
        text: wmText,
        imagePath: imagePath ?? undefined,
        position,
        opacity,
        fontSize,
        fontColor,
      },
      (p) => { progress = p; }
    );
    busy = false;
    progress = null;

    if (r.ok) {
      outputPath = out;
      toast = `Filigran eklendi: ${out.split(/[/\\]/).pop()}`;
    } else if (r.ok === false) {
      toast = `Hata: ${r.message}`;
    }
  }
</script>

<div class="page">
  <header class="page-header">
    <h1 class="page-title">Filigran Ekleme</h1>
    <p class="page-sub">Video dosyasına metin veya görsel filigran (watermark) ekle.</p>
  </header>

  <section class="card">
    <h2 class="card-title">Video Dosyası</h2>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="drop-zone"
      class:drag={isDraggingVideo}
      class:has-file={!!filePath}
      role="button"
      tabindex="0"
      aria-label="Video dosyası seç"
      ondragover={(e) => { e.preventDefault(); isDraggingVideo = true; }}
      ondragleave={() => (isDraggingVideo = false)}
      ondrop={(e) => { e.preventDefault(); onDropVideo(e); }}
      onclick={onPickVideo}
      onkeydown={(e) => e.key === "Enter" && onPickVideo()}
    >
      {#if filePath}
        <div class="file-info">
          <span class="file-icon" aria-hidden="true">🎬</span>
          <span class="file-name">{fileLabel}</span>
          <span class="change-hint">Değiştirmek için tıkla</span>
        </div>
      {:else}
        <div class="drop-hint">
          <span class="drop-icon" aria-hidden="true">🎞️</span>
          <span>Video dosyası seç (tıkla veya sürükle)</span>
        </div>
      {/if}
    </div>
    {#if fileError}
      <p class="error-msg" role="alert">{fileError}</p>
    {/if}
  </section>

  <section class="card">
    <h2 class="card-title">Filigran Tipi</h2>
    <div class="mode-group">
      <button
        type="button"
        class="mode-btn"
        class:active={mode === "text"}
        onclick={() => (mode = "text")}
      >Metin</button>
      <button
        type="button"
        class="mode-btn"
        class:active={mode === "image"}
        onclick={() => (mode = "image")}
      >Görsel</button>
    </div>

    {#if mode === "text"}
      <label class="field-block">
        <span class="field-label">Metin</span>
        <input type="text" bind:value={wmText} class="text-input" placeholder="© Filigran" maxlength="100" />
      </label>
      <div class="two-col">
        <label class="field-block">
          <span class="field-label">Yazı Boyutu</span>
          <div class="param-row">
            <input type="range" min="12" max="120" step="2" bind:value={fontSize} class="range-input" />
            <span class="param-val">{fontSize}px</span>
          </div>
        </label>
        <label class="field-block">
          <span class="field-label">Yazı Rengi</span>
          <div class="color-row">
            {#each ["white","black","yellow","red","cyan"] as c (c)}
              <button
                type="button"
                class="color-swatch"
                class:active={fontColor === c}
                style="background: {c};"
                aria-label={c}
                onclick={() => (fontColor = c)}
              ></button>
            {/each}
          </div>
        </label>
      </div>
    {:else}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="drop-zone drop-zone-sm"
        class:drag={isDraggingImage}
        class:has-file={!!imagePath}
        role="button"
        tabindex="0"
        aria-label="Görsel seç"
        ondragover={(e) => { e.preventDefault(); isDraggingImage = true; }}
        ondragleave={() => (isDraggingImage = false)}
        ondrop={(e) => { e.preventDefault(); onDropImage(e); }}
        onclick={() => {
          if (!hasLfc) return;
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "image/png,image/jpeg,image/webp";
          input.onchange = () => {
            const f = input.files?.item(0);
            if (f) loadImageFile(window.lfc.getPathForFile(f), f.name);
          };
          input.click();
        }}
        onkeydown={(e) => e.key === "Enter" && e.currentTarget.click()}
      >
        {#if imagePath}
          <div class="file-info">
            <span class="file-icon" aria-hidden="true">🖼️</span>
            <span class="file-name">{imageLabel}</span>
            <span class="change-hint">Değiştirmek için tıkla</span>
          </div>
        {:else}
          <div class="drop-hint">
            <span>PNG / JPG / WebP seç</span>
          </div>
        {/if}
      </div>
      {#if imageError}
        <p class="error-msg" role="alert">{imageError}</p>
      {/if}
    {/if}

    <label class="field-block">
      <span class="field-label">Opaklık — {Math.round(opacity * 100)}%</span>
      <input type="range" min="0.05" max="1" step="0.05" bind:value={opacity} class="range-input" />
    </label>

    <div class="field-block">
      <span class="field-label">Konum</span>
      <div class="position-grid">
        {#each POSITIONS as pos (pos.value)}
          <button
            type="button"
            class="pos-btn"
            class:active={position === pos.value}
            onclick={() => (position = pos.value)}
          >{pos.label}</button>
        {/each}
      </div>
    </div>
  </section>

  <section class="card action-card">
    {#if busy}
      <div class="progress-row">
        <div class="progress-bar">
          <div class="progress-fill" style="width: {progress != null ? progress : 0}%"></div>
        </div>
        <span class="progress-pct">{progress != null ? `${Math.round(progress)}%` : "…"}</span>
      </div>
    {/if}
    {#if toast}
      <p class="toast" class:toast-error={toast.startsWith("Hata")} role="status">{toast}</p>
    {/if}
    {#if outputPath && !busy}
      <button
        type="button"
        class="btn btn-secondary"
        onclick={() => hasLfc && window.lfc.showInFolder(outputPath!)}
      >Dizinde Göster</button>
    {/if}
    <button
      type="button"
      class="btn btn-primary"
      disabled={!canApply}
      onclick={apply}
    >
      {#if busy}Ekleniyor…{:else if !filePath}Önce Video Seç{:else}Filigran Ekle{/if}
    </button>
  </section>
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 1.25rem; max-width: 640px; }
  .page-header { margin-bottom: 0.25rem; }
  .page-title { font-size: 1.45rem; font-weight: 700; margin: 0 0 0.3rem; background: linear-gradient(90deg, var(--accent-start), var(--accent-end)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
  .page-sub { font-size: 0.88rem; color: var(--muted); margin: 0; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 1.25rem 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
  .card-title { font-size: 0.85rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); margin: 0; }
  .drop-zone { border: 2px dashed var(--border); border-radius: var(--radius-button); padding: 2rem 1rem; text-align: center; cursor: pointer; transition: border-color 0.15s, background 0.15s; color: var(--muted); font-size: 0.9rem; user-select: none; }
  .drop-zone.drop-zone-sm { padding: 1.25rem 1rem; }
  .drop-zone:hover, .drop-zone.drag { border-color: var(--accent-start); background: rgba(56,189,248,0.05); }
  .drop-zone.has-file { border-style: solid; border-color: var(--border); padding: 1rem; }
  .file-info { display: flex; align-items: center; gap: 0.75rem; justify-content: center; flex-wrap: wrap; }
  .file-icon { font-size: 1.5rem; }
  .file-name { font-weight: 600; font-size: 0.92rem; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 22ch; }
  .change-hint { font-size: 0.75rem; color: var(--muted); }
  .drop-hint { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; }
  .drop-icon { font-size: 2rem; margin-bottom: 0.25rem; }
  .error-msg { color: var(--danger); font-size: 0.84rem; margin: 0; padding: 0.5rem 0.75rem; background: rgba(239,68,68,0.08); border-radius: 8px; border: 1px solid rgba(239,68,68,0.2); }
  .mode-group { display: flex; gap: 0.4rem; }
  .mode-btn { padding: 0.45rem 1rem; border-radius: var(--radius-button); border: 1px solid var(--border); background: var(--surface-elevated); color: var(--text); cursor: pointer; font: inherit; font-size: 0.88rem; font-weight: 500; transition: border-color 0.12s, background 0.12s; }
  .mode-btn:hover { border-color: var(--accent-start); }
  .mode-btn.active { border-color: var(--accent-start); background: rgba(56,189,248,0.1); color: var(--accent-start); font-weight: 600; }
  .field-block { display: flex; flex-direction: column; gap: 0.3rem; }
  .field-label { font-size: 0.84rem; font-weight: 600; color: var(--text); }
  .text-input { padding: 0.45rem 0.65rem; border: 1px solid var(--border); border-radius: var(--radius-button); background: var(--surface-elevated); color: var(--text); font: inherit; font-size: 0.9rem; width: 100%; }
  .text-input:focus { outline: none; border-color: var(--accent-start); }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  .param-row { display: flex; align-items: center; gap: 0.75rem; }
  .range-input { flex: 1; accent-color: var(--accent-start); }
  .param-val { font-size: 0.85rem; font-weight: 600; color: var(--accent-start); min-width: 4ch; text-align: right; }
  .color-row { display: flex; gap: 0.4rem; margin-top: 0.2rem; }
  .color-swatch { width: 1.5rem; height: 1.5rem; border-radius: 50%; border: 2px solid var(--border); cursor: pointer; transition: transform 0.1s, border-color 0.1s; }
  .color-swatch:hover { transform: scale(1.15); }
  .color-swatch.active { border-color: var(--accent-start); transform: scale(1.2); }
  .position-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.35rem; max-width: 280px; }
  .pos-btn { padding: 0.4rem 0.5rem; border-radius: var(--radius-button); border: 1px solid var(--border); background: var(--surface-elevated); color: var(--text); cursor: pointer; font: inherit; font-size: 0.8rem; text-align: center; transition: border-color 0.12s, background 0.12s; }
  .pos-btn:hover { border-color: var(--accent-start); }
  .pos-btn.active { border-color: var(--accent-start); background: rgba(56,189,248,0.1); color: var(--accent-start); font-weight: 600; }
  .action-card { gap: 0.75rem; }
  .progress-row { display: flex; align-items: center; gap: 0.75rem; }
  .progress-bar { flex: 1; height: 8px; background: var(--surface-elevated); border-radius: 999px; overflow: hidden; border: 1px solid var(--border); }
  .progress-fill { height: 100%; background: linear-gradient(90deg, var(--accent-start), var(--accent-end)); border-radius: 999px; transition: width 0.3s; }
  .progress-pct { font-size: 0.82rem; color: var(--muted); min-width: 3ch; text-align: right; }
  .toast { margin: 0; padding: 0.55rem 0.85rem; border-radius: 8px; font-size: 0.87rem; background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.25); color: var(--success); }
  .toast.toast-error { background: rgba(239,68,68,0.08); border-color: rgba(239,68,68,0.2); color: var(--danger); }
  .btn { padding: 0.6rem 1.4rem; border-radius: var(--radius-button); border: 1px solid transparent; font: inherit; font-size: 0.92rem; font-weight: 600; cursor: pointer; transition: opacity 0.12s, background 0.12s; align-self: flex-start; }
  .btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .btn-primary { background: linear-gradient(90deg, var(--accent-start), var(--accent-end)); color: #fff; border-color: transparent; }
  .btn-primary:not(:disabled):hover { opacity: 0.88; }
  .btn-secondary { background: var(--surface-elevated); color: var(--text); border-color: var(--border); }
  .btn-secondary:hover { background: var(--surface-hover); }
</style>
