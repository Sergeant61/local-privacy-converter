<script lang="ts">
  import { browser } from "$app/environment";
  import { _ } from "svelte-i18n";
  import { get } from "svelte/store";

  const hasLfc = browser && typeof window !== "undefined" && "lfc" in window && !!window.lfc;

  let filePath = $state<string | null>(null);
  let fileLabel = $state<string | null>(null);
  let isDragging = $state(false);
  let fileError = $state<string | null>(null);

  let format = $state<"png" | "jpg" | "ppm">("png");
  let dpi = $state(150);

  const DPI_PRESETS = [
    { value: 72, key: "pdf.d72" },
    { value: 96, key: "pdf.d96" },
    { value: 150, key: "pdf.d150" },
    { value: 200, key: "pdf.d200" },
    { value: 300, key: "pdf.d300" },
  ];

  let busy = $state(false);
  let toast = $state<string | null>(null);
  // Hata biçimi metnin içeriğinden değil bayraktan geliyor: eski
  // `toast.startsWith("Hata")` denetimi yalnızca Türkçede tutuyordu.
  let toastError = $state(false);
  let outputDir = $state<string | null>(null);

  function extOf(name: string) {
    return (name.split(".").pop() ?? "").toLowerCase();
  }

  async function loadFile(p: string, label: string) {
    fileError = null;
    if (extOf(label) !== "pdf") {
      fileError = get(_)("pdf.pdfOnly");
      return;
    }
    filePath = p;
    fileLabel = label;
    outputDir = null;
    toast = null;
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

  async function startConvert() {
    if (!hasLfc || !filePath || busy) return;
    busy = true;
    toast = null;
    outputDir = null;

    const r = await window.lfc.pdfConvert({ inputPath: filePath, format, dpi });
    busy = false;

    if (r.ok) {
      outputDir = r.outputDir;
      toast = get(_)("pdf.saved", { values: { dir: r.outputDir } });
      toastError = false;
    } else if (r.ok === false) {
      toast = get(_)("common.errorWith", { values: { message: r.message } });
      toastError = true;
    }
  }

  const canStart = $derived(Boolean(filePath && !busy && hasLfc));
</script>

<div class="page">
  <header class="page-header">
    <h1 class="page-title">{$_("pdf.title")}</h1>
    <p class="page-sub">
      {$_("pdf.pageSubtitle")}
    </p>
  </header>

  <section class="card">
    <h2 class="card-title">{$_("pdf.inputFile")}</h2>
    <div
      class="drop-zone"
      class:drag={isDragging}
      class:has-file={!!filePath}
      role="button"
      tabindex="0"
      aria-label={$_("pdf.pickPdf")}
      ondragover={(e) => { e.preventDefault(); isDragging = true; }}
      ondragleave={() => (isDragging = false)}
      ondrop={(e) => { e.preventDefault(); onDrop(e); }}
      onclick={onPick}
      onkeydown={(e) => e.key === "Enter" && onPick()}
    >
      {#if filePath}
        <div class="file-info">
          <span class="file-icon" aria-hidden="true">📄</span>
          <span class="file-name">{fileLabel}</span>
          <span class="change-hint">{$_("common.changeHint")}</span>
        </div>
      {:else}
        <div class="drop-hint">
          <span class="drop-icon" aria-hidden="true">📑</span>
          <span>{$_("pdf.pickPdfHint")}</span>
        </div>
      {/if}
    </div>
    {#if fileError}
      <p class="error-msg" role="alert">{fileError}</p>
    {/if}
  </section>

  <section class="card">
    <h2 class="card-title">{$_("pdf.outputSettings")}</h2>

    <div class="setting-row">
      <span class="field-label">{$_("pdf.dpi")}</span>
      <div class="preset-group">
        {#each DPI_PRESETS as p (p.value)}
          <button
            type="button"
            class="preset-btn"
            class:active={dpi === p.value}
            onclick={() => (dpi = p.value)}
          >{$_(p.key)}</button>
        {/each}
      </div>
    </div>

    <div class="setting-row">
      <span class="field-label">{$_("pdf.formatLabel")}</span>
      <div class="format-group">
        {#each [["png","pdf.fPng"],["jpg","pdf.fJpg"],["ppm","pdf.fPpm"]] as [val,lbl] (val)}
          <button
            type="button"
            class="format-btn"
            class:active={format === val}
            onclick={() => (format = val as "png" | "jpg" | "ppm")}
          >{$_(lbl)}</button>
        {/each}
      </div>
    </div>

    <div class="info-box">
      {$_("pdf.info", { values: { dpi, format: format.toUpperCase() } })}
      <br/>
      <small>{$_("pdf.outDirNote")}</small>
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
          <div class="progress-fill indeterminate"></div>
        </div>
        <span class="progress-label">{$_("pdf.converting")}</span>
      </div>
    {:else}
      <button type="button" class="btn btn-primary" disabled={!canStart} onclick={() => void startConvert()}>
        {filePath ? $_("pdf.convertToImages") : $_("pdf.selectPdfFirst")}
      </button>
    {/if}
  </section>
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 1.25rem; max-width: 640px; }
  .page-header { margin-bottom: 0.25rem; }
  .page-title { font-size: 1.45rem; font-weight: 700; margin: 0 0 0.3rem; background: linear-gradient(90deg, var(--accent-start), var(--accent-end)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
  .page-sub { font-size: 0.88rem; color: var(--muted); margin: 0; line-height: 1.55; }
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
  .error-msg { color: var(--danger); font-size: 0.84rem; margin: 0; padding: 0.5rem 0.75rem; background: rgba(239,68,68,0.08); border-radius: 8px; border: 1px solid rgba(239,68,68,0.2); }
  .setting-row { display: flex; align-items: flex-start; gap: 0.75rem; flex-wrap: wrap; }
  .field-label { font-size: 0.84rem; color: var(--muted); white-space: nowrap; padding-top: 0.45rem; min-width: 9rem; }
  .preset-group, .format-group { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .preset-btn, .format-btn { font: inherit; font-size: 0.8rem; padding: 0.35rem 0.6rem; border-radius: var(--radius-button); border: 1px solid var(--border); background: var(--surface-elevated); color: var(--muted); cursor: pointer; transition: border-color 0.12s, background 0.12s; }
  .preset-btn:hover, .format-btn:hover { border-color: var(--accent-start); color: var(--text); }
  .preset-btn.active, .format-btn.active { border-color: var(--accent-start); background: rgba(56,189,248,0.1); color: var(--accent-start); }
  .info-box { padding: 0.65rem 0.85rem; background: var(--surface-elevated); border-radius: 8px; border: 1px solid var(--border); font-size: 0.84rem; color: var(--muted); line-height: 1.5; }
  .info-box small { font-size: 0.76rem; opacity: 0.75; }
  .action-card { gap: 0.75rem; }
  .toast { margin: 0; padding: 0.55rem 0.85rem; border-radius: 8px; font-size: 0.87rem; background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.25); color: var(--success); word-break: break-all; }
  .toast.toast-error { background: rgba(239,68,68,0.08); border-color: rgba(239,68,68,0.2); color: var(--danger); }
  .progress-wrap { display: flex; align-items: center; gap: 0.75rem; }
  .progress-bar { flex: 1; height: 6px; background: var(--surface-elevated); border-radius: 999px; overflow: hidden; }
  .progress-fill { height: 100%; background: linear-gradient(90deg, var(--accent-start), var(--accent-end)); border-radius: 999px; }
  .progress-fill.indeterminate { width: 40% !important; animation: slide 1.2s ease-in-out infinite; }
  @keyframes slide { 0% { transform: translateX(-120%); } 100% { transform: translateX(350%); } }
  .progress-label { font-size: 0.82rem; color: var(--muted); white-space: nowrap; }
  .btn { padding: 0.6rem 1.4rem; border-radius: var(--radius-button); border: 1px solid transparent; font: inherit; font-size: 0.92rem; font-weight: 600; cursor: pointer; transition: opacity 0.12s, background 0.12s; align-self: flex-start; }
  .btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .btn-primary { background: linear-gradient(90deg, var(--accent-start), var(--accent-end)); color: #fff; border-color: transparent; }
  .btn-primary:not(:disabled):hover { opacity: 0.88; }
  .btn-secondary { background: var(--surface-elevated); color: var(--text); border-color: var(--border); }
  .btn-secondary:hover { background: var(--surface-hover); }
</style>
