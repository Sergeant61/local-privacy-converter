<script lang="ts">
  import { browser } from "$app/environment";
  import { _ } from "svelte-i18n";
  import { get } from "svelte/store";

  const AUDIO_EXTS = new Set(["mp3","wav","m4a","flac","opus","aac","ogg","wma","mp4","mkv","mov","avi","webm"]);

  const hasLfc = browser && typeof window !== "undefined" && "lfc" in window && !!window.lfc;

  let filePath = $state<string | null>(null);
  let fileLabel = $state<string | null>(null);
  let isDragging = $state(false);
  let fileError = $state<string | null>(null);

  // EBU R128 defaults
  let targetLufs = $state(-14);
  let truePeak = $state(-1.0);
  let lra = $state(11);

  const PRESET_LABELS = [
    { labelKey: "normalize.pStreaming", lufs: -14, tp: -1.0, lra: 11 },
    { labelKey: "normalize.pBroadcast", lufs: -23, tp: -1.0, lra: 20 },
    { labelKey: "normalize.pPodcast", lufs: -16, tp: -1.0, lra: 14 },
    { labelKey: "normalize.pYoutube", lufs: -14, tp: -1.0, lra: 11 },
    { labelKey: "common.custom", lufs: null, tp: null, lra: null },
  ] as const;

  let selectedPreset = $state(0);

  function applyPreset(i: number) {
    selectedPreset = i;
    const p = PRESET_LABELS[i];
    if (p && p.lufs !== null && p.tp !== null && p.lra !== null) {
      targetLufs = p.lufs;
      truePeak = p.tp;
      lra = p.lra;
    }
  }

  let busy = $state(false);
  let progress = $state<number | null>(null);
  let toast = $state<string | null>(null);
  // Hata biçimi metnin içeriğinden değil bayraktan geliyor: eski
  // `toast.startsWith("Hata")` denetimi yalnızca Türkçede tutuyordu.
  let toastError = $state(false);
  let outputPath = $state<string | null>(null);

  function extOf(name: string) {
    return (name.split(".").pop() ?? "").toLowerCase();
  }

  async function loadFile(path: string, label: string) {
    fileError = null;
    toast = null;
    outputPath = null;
    if (!AUDIO_EXTS.has(extOf(label))) {
      fileError = get(_)("normalize.avOnly");
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

  const canNormalize = $derived(Boolean(hasLfc && filePath && fileLabel && !busy));

  async function normalize() {
    if (!hasLfc || !filePath || !fileLabel) return;
    const dirResult = await window.lfc.getOutputDir();
    if (dirResult.ok === false) {
      toast = get(_)("common.outputDirFailed", { values: { message: dirResult.message } });
      toastError = true;
      return;
    }
    const dot = fileLabel.lastIndexOf(".");
    const base = dot >= 0 ? fileLabel.slice(0, dot) : fileLabel;
    const ext = dot >= 0 ? fileLabel.slice(dot) : ".mp3";
    const out = `${dirResult.dir}/${base}-normalized${ext}`;

    busy = true;
    progress = null;
    toast = null;
    outputPath = null;

    const r = await window.lfc.audioNormalize(
      { inputPath: filePath, outputPath: out, targetLufs, truePeak, lra },
      (p) => { progress = p; }
    );
    busy = false;
    progress = null;

    if (r.ok) {
      outputPath = out;
      toast = get(_)("normalize.doneWith", { values: { file: out.split(/[/\\]/).pop() } });
      toastError = false;
    } else if (r.ok === false) {
      toast = get(_)("common.errorWith", { values: { message: r.message } });
      toastError = true;
    }
  }
</script>

<div class="page">
  <header class="page-header">
    <h1 class="page-title">{$_("normalize.title")}</h1>
    <p class="page-sub">{$_("normalize.pageSubtitle")}</p>
  </header>

  <section class="card">
    <h2 class="card-title">{$_("normalize.file")}</h2>
    <div
      class="drop-zone"
      class:drag={isDragging}
      class:has-file={!!filePath}
      role="button"
      tabindex="0"
      aria-label={$_("normalize.pickAudio")}
      ondragover={(e) => { e.preventDefault(); isDragging = true; }}
      ondragleave={() => (isDragging = false)}
      ondrop={(e) => { e.preventDefault(); onDrop(e); }}
      onclick={onPick}
      onkeydown={(e) => e.key === "Enter" && onPick()}
    >
      {#if filePath}
        <div class="file-info">
          <span class="file-icon" aria-hidden="true">🎵</span>
          <span class="file-name">{fileLabel}</span>
          <span class="change-hint">{$_("common.changeHint")}</span>
        </div>
      {:else}
        <div class="drop-hint">
          <span class="drop-icon" aria-hidden="true">🔊</span>
          <span>{$_("normalize.pickAudioHint")}</span>
        </div>
      {/if}
    </div>
    {#if fileError}
      <p class="error-msg" role="alert">{fileError}</p>
    {/if}
  </section>

  <section class="card">
    <h2 class="card-title">{$_("normalize.presets")}</h2>
    <div class="preset-list">
      {#each PRESET_LABELS as preset, i (i)}
        <button
          type="button"
          class="preset-btn"
          class:active={selectedPreset === i}
          onclick={() => applyPreset(i)}
        >{$_(preset.labelKey)}</button>
      {/each}
    </div>

    <div class="params-grid">
      <label class="param-field">
        <span class="param-label">{$_("normalize.lufsLabel")}</span>
        <div class="param-row">
          <input
            type="range"
            min="-35"
            max="-5"
            step="0.5"
            bind:value={targetLufs}
            oninput={() => (selectedPreset = 4)}
            class="range-input"
          />
          <span class="param-val">{targetLufs} LUFS</span>
        </div>
        <span class="param-hint">{$_("normalize.lufsHint")}</span>
      </label>

      <label class="param-field">
        <span class="param-label">{$_("normalize.peakLabel")}</span>
        <div class="param-row">
          <input
            type="range"
            min="-3"
            max="0"
            step="0.1"
            bind:value={truePeak}
            oninput={() => (selectedPreset = 4)}
            class="range-input"
          />
          <span class="param-val">{truePeak.toFixed(1)} dBTP</span>
        </div>
        <span class="param-hint">{$_("normalize.peakHint")}</span>
      </label>

      <label class="param-field">
        <span class="param-label">{$_("normalize.lraLabel")}</span>
        <div class="param-row">
          <input
            type="range"
            min="1"
            max="20"
            step="1"
            bind:value={lra}
            oninput={() => (selectedPreset = 4)}
            class="range-input"
          />
          <span class="param-val">{lra} LU</span>
        </div>
        <span class="param-hint">{$_("normalize.lraHint")}</span>
      </label>
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
      <p class="toast" class:toast-error={toastError} role="status">{toast}</p>
    {/if}
    {#if outputPath && !busy}
      <button
        type="button"
        class="btn btn-secondary"
        onclick={() => hasLfc && window.lfc.showInFolder(outputPath!)}
      >{$_("normalize.showInDir")}</button>
    {/if}
    <button
      type="button"
      class="btn btn-primary"
      disabled={!canNormalize}
      onclick={normalize}
    >
      {#if busy}{$_("normalize.normalizing")}{:else if !filePath}{$_("common.selectFileFirst")}{:else}{$_("normalize.normalize")}{/if}
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
  .drop-zone:hover, .drop-zone.drag { border-color: var(--accent-start); background: rgba(56,189,248,0.05); }
  .drop-zone.has-file { border-style: solid; border-color: var(--border); padding: 1rem; }
  .file-info { display: flex; align-items: center; gap: 0.75rem; justify-content: center; flex-wrap: wrap; }
  .file-icon { font-size: 1.5rem; }
  .file-name { font-weight: 600; font-size: 0.92rem; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 24ch; }
  .change-hint { font-size: 0.75rem; color: var(--muted); }
  .drop-hint { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; }
  .drop-icon { font-size: 2rem; margin-bottom: 0.25rem; }
  .error-msg { color: var(--danger); font-size: 0.84rem; margin: 0; padding: 0.5rem 0.75rem; background: rgba(239,68,68,0.08); border-radius: 8px; border: 1px solid rgba(239,68,68,0.2); }
  .preset-list { display: flex; flex-direction: column; gap: 0.3rem; }
  .preset-btn { text-align: left; padding: 0.5rem 0.85rem; border-radius: var(--radius-button); border: 1px solid var(--border); background: var(--surface-elevated); color: var(--text); cursor: pointer; font: inherit; font-size: 0.87rem; transition: border-color 0.12s, background 0.12s; }
  .preset-btn:hover { border-color: var(--accent-start); }
  .preset-btn.active { border-color: var(--accent-start); background: rgba(56,189,248,0.1); color: var(--accent-start); font-weight: 600; }
  .params-grid { display: flex; flex-direction: column; gap: 0.85rem; }
  .param-field { display: flex; flex-direction: column; gap: 0.3rem; }
  .param-label { font-size: 0.84rem; font-weight: 600; color: var(--text); }
  .param-row { display: flex; align-items: center; gap: 0.75rem; }
  .range-input { flex: 1; accent-color: var(--accent-start); }
  .param-val { font-size: 0.85rem; font-weight: 600; color: var(--accent-start); min-width: 7ch; text-align: right; }
  .param-hint { font-size: 0.76rem; color: var(--muted); }
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
