<script lang="ts">
  import { browser } from "$app/environment";
  import { _ } from "svelte-i18n";
  import { get } from "svelte/store";

  const VIDEO_EXTS = new Set(["mp4","m4v","mkv","webm","avi","mov","wmv","flv","ogv","mpg","mpeg","ts","m2ts","mts","3gp","3g2","asf","divx","vob","f4v","dv"]);

  const hasLfc = browser && typeof window !== "undefined" && "lfc" in window && !!window.lfc;

  let filePath = $state<string | null>(null);
  let fileLabel = $state<string | null>(null);
  let isDragging = $state(false);
  let fileError = $state<string | null>(null);

  let intervalSec = $state(1);
  let outputFormat = $state<"png" | "jpg">("png");

  let busy = $state(false);
  let progress = $state<number | null>(null);
  let toast = $state<string | null>(null);
  // Hata biçimi metnin içeriğinden değil bayraktan geliyor: `toast.startsWith("Hata")`
  // yalnızca Türkçede tutuyordu, İngilizcede hata mesajı normal renkte kalıyordu.
  let toastError = $state(false);
  let outputDir = $state<string | null>(null);

  function extOf(name: string) {
    return (name.split(".").pop() ?? "").toLowerCase();
  }

  async function loadFile(path: string, label: string) {
    fileError = null;
    if (!VIDEO_EXTS.has(extOf(label))) {
      fileError = get(_)("common.videoOnly");
      return;
    }
    filePath = path;
    fileLabel = label;
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
      void loadFile(window.lfc.getPathForFile(file), file.name);
    } catch {
      fileError = get(_)("common.pathFailed");
    }
  }

  async function startExtract() {
    if (!hasLfc || !filePath || !fileLabel) return;
    const dirResult = await window.lfc.getOutputDir();
    if (dirResult.ok === false) {
      toast = get(_)("common.outputDirFailed", { values: { message: dirResult.message } });
      toastError = true;
      return;
    }
    const dot = fileLabel.lastIndexOf(".");
    const base = dot >= 0 ? fileLabel.slice(0, dot) : fileLabel;
    const outDir = `${dirResult.dir}/${base}-kareler`;

    busy = true;
    progress = null;
    toast = null;
    outputDir = null;

    const r = await window.lfc.frameExtract(
      { inputPath: filePath, outputDir: outDir, intervalSec, format: outputFormat },
      (p) => { progress = p; }
    );
    busy = false;

    if (r.ok) {
      outputDir = r.outputDir;
      toast = get(_)("frames.success");
      toastError = false;
    } else {
      const msg = r.ok === false ? (r.message ?? "") : "";
      toast = get(_)("common.errorWith", { values: { message: msg || get(_)("common.error") } });
      toastError = true;
    }
  }

  async function cancel() {
    if (hasLfc) await window.lfc.cancelConvert();
    busy = false;
    progress = null;
    toast = get(_)("common.canceled");
    toastError = false;
  }

  const canStart = $derived(Boolean(filePath && !busy && hasLfc));
</script>

<div class="page">
  <header class="page-header">
    <h1 class="page-title">{$_("frames.title")}</h1>
    <p class="page-sub">{$_("frames.subtitle")}</p>
  </header>

  <section class="card">
    <h2 class="card-title">{$_("frames.inputFile")}</h2>
    <div
      class="drop-zone"
      class:drag={isDragging}
      class:has-file={!!filePath}
      role="button"
      tabindex="0"
      aria-label={$_("common.pickVideo")}
      ondragover={(e) => { e.preventDefault(); isDragging = true; }}
      ondragleave={() => (isDragging = false)}
      ondrop={(e) => { e.preventDefault(); onDrop(e); }}
      onclick={onPick}
      onkeydown={(e) => e.key === "Enter" && onPick()}
    >
      {#if filePath}
        <div class="file-info">
          <span class="file-icon" aria-hidden="true">🎬</span>
          <span class="file-name">{fileLabel}</span>
          <span class="change-hint">{$_("common.changeHint")}</span>
        </div>
      {:else}
        <div class="drop-hint">
          <span class="drop-icon" aria-hidden="true">📹</span>
          <span>{$_("common.pickVideoHint")}</span>
          <span class="drop-sub">{$_("common.videoExts")}</span>
        </div>
      {/if}
    </div>
    {#if fileError}
      <p class="error-msg" role="alert">{fileError}</p>
    {/if}
  </section>

  <section class="card">
    <h2 class="card-title">{$_("frames.settings")}</h2>

    <div class="setting-row">
      <label for="interval" class="field-label">{$_("frames.intervalLabel")}</label>
      <input
        id="interval"
        type="number"
        class="num-input"
        min="0.1"
        max="3600"
        step="0.5"
        bind:value={intervalSec}
      />
      <span class="field-unit">{$_("frames.seconds")}</span>
    </div>

    <div class="setting-row">
      <span class="field-label">{$_("frames.imageFormat")}</span>
      <div class="format-pair">
        <button
          type="button"
          class="format-btn"
          class:active={outputFormat === "png"}
          onclick={() => (outputFormat = "png")}
        >
          <strong>PNG</strong>
          <small>{$_("frames.lossless")}</small>
        </button>
        <button
          type="button"
          class="format-btn"
          class:active={outputFormat === "jpg"}
          onclick={() => (outputFormat = "jpg")}
        >
          <strong>JPG</strong>
          <small>{$_("frames.smaller")}</small>
        </button>
      </div>
    </div>

    <div class="info-box">
      {$_("frames.info", { values: { interval: intervalSec, format: outputFormat.toUpperCase() } })}
    </div>
  </section>

  <section class="card action-card">
    {#if toast}
      <p class="toast" class:toast-error={toastError} role="status">{toast}</p>
    {/if}

    {#if outputDir && !busy}
      <button
        type="button"
        class="btn btn-secondary"
        onclick={() => hasLfc && window.lfc.showInFolder(outputDir!)}
      >{$_("common.openFolder")}</button>
    {/if}

    {#if busy}
      <div class="progress-wrap">
        <div class="progress-bar">
          <div class="progress-fill" style="width:{progress ?? 0}%" class:indeterminate={progress == null}></div>
        </div>
        <span class="progress-label">{progress != null ? `%${Math.round(progress)}` : $_("common.processing")}</span>
      </div>
      <button type="button" class="btn btn-danger" onclick={cancel}>{$_("common.cancel")}</button>
    {:else}
      <button type="button" class="btn btn-primary" disabled={!canStart} onclick={startExtract}>
        {filePath ? $_("frames.extract") : $_("common.selectVideoFirst")}
      </button>
    {/if}
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
  .drop-zone:hover, .drop-zone.drag { border-color: var(--accent-start); background: rgba(56,189,248,0.05); }
  .drop-zone.has-file { border-style: solid; border-color: var(--border); padding: 1rem; }
  .file-info { display: flex; align-items: center; gap: 0.75rem; justify-content: center; flex-wrap: wrap; }
  .file-icon { font-size: 1.5rem; }
  .file-name { font-weight: 600; font-size: 0.92rem; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 18ch; }
  .change-hint { font-size: 0.75rem; color: var(--muted); }
  .drop-hint { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; }
  .drop-icon { font-size: 2rem; margin-bottom: 0.25rem; }
  .drop-sub { font-size: 0.78rem; color: var(--muted); opacity: 0.7; }
  .error-msg { color: var(--danger); font-size: 0.84rem; margin: 0; padding: 0.5rem 0.75rem; background: rgba(239,68,68,0.08); border-radius: 8px; border: 1px solid rgba(239,68,68,0.2); }
  .setting-row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
  .field-label { font-size: 0.84rem; color: var(--muted); white-space: nowrap; }
  .num-input { width: 6rem; background: var(--surface-elevated); border: 1px solid var(--border); border-radius: var(--radius-button); color: var(--text); font: inherit; font-size: 0.9rem; padding: 0.45rem 0.75rem; text-align: right; }
  .num-input:focus { outline: none; border-color: var(--accent-start); }
  .field-unit { font-size: 0.84rem; color: var(--muted); }
  .format-pair { display: flex; gap: 0.5rem; }
  .format-btn { display: flex; flex-direction: column; align-items: center; gap: 0.1rem; padding: 0.55rem 0.9rem; border-radius: var(--radius-button); border: 1px solid var(--border); background: var(--surface-elevated); color: var(--text); cursor: pointer; transition: border-color 0.12s, background 0.12s; }
  .format-btn:hover { border-color: var(--accent-start); background: var(--surface-hover); }
  .format-btn.active { border-color: var(--accent-start); background: rgba(56,189,248,0.1); color: var(--accent-start); }
  .format-btn strong { font-size: 0.88rem; }
  .format-btn small { font-size: 0.68rem; color: var(--muted); }
  .format-btn.active small { color: var(--accent-start); opacity: 0.8; }
  .info-box { padding: 0.65rem 0.85rem; background: var(--surface-elevated); border-radius: 8px; border: 1px solid var(--border); font-size: 0.84rem; color: var(--muted); }
  .action-card { gap: 0.75rem; }
  .toast { margin: 0; padding: 0.55rem 0.85rem; border-radius: 8px; font-size: 0.87rem; background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.25); color: var(--success); }
  .toast.toast-error { background: rgba(239,68,68,0.08); border-color: rgba(239,68,68,0.2); color: var(--danger); }
  .progress-wrap { display: flex; align-items: center; gap: 0.75rem; }
  .progress-bar { flex: 1; height: 6px; background: var(--surface-elevated); border-radius: 999px; overflow: hidden; }
  .progress-fill { height: 100%; background: linear-gradient(90deg, var(--accent-start), var(--accent-end)); border-radius: 999px; transition: width 0.25s ease; }
  .progress-fill.indeterminate { width: 40% !important; animation: slide 1.2s ease-in-out infinite; }
  @keyframes slide { 0% { transform: translateX(-120%); } 100% { transform: translateX(350%); } }
  .progress-label { font-size: 0.82rem; color: var(--muted); white-space: nowrap; min-width: 4ch; font-variant-numeric: tabular-nums; }
  .btn { padding: 0.6rem 1.4rem; border-radius: var(--radius-button); border: 1px solid transparent; font: inherit; font-size: 0.92rem; font-weight: 600; cursor: pointer; transition: opacity 0.12s, background 0.12s; align-self: flex-start; }
  .btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .btn-primary { background: linear-gradient(90deg, var(--accent-start), var(--accent-end)); color: #fff; border-color: transparent; }
  .btn-primary:not(:disabled):hover { opacity: 0.88; }
  .btn-secondary { background: var(--surface-elevated); color: var(--text); border-color: var(--border); }
  .btn-secondary:hover { background: var(--surface-hover); }
  .btn-danger { background: rgba(239,68,68,0.12); color: var(--danger); border-color: rgba(239,68,68,0.3); }
  .btn-danger:hover { background: rgba(239,68,68,0.2); }
</style>
