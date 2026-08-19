<script lang="ts">
  import { browser } from "$app/environment";
  import { _ } from "svelte-i18n";
  import { get } from "svelte/store";

  const VIDEO_EXTS = new Set(["mp4","m4v","mkv","webm","avi","mov","wmv","ts","m2ts","mts","3gp","flv","vob"]);
  const AUDIO_EXTS = new Set(["mp3","wav","m4a","flac","opus","aac","ogg","wma"]);

  const hasLfc = browser && typeof window !== "undefined" && "lfc" in window && !!window.lfc;

  let filePath = $state<string | null>(null);
  let fileLabel = $state<string | null>(null);
  let durationSec = $state<number | null>(null);
  let isDragging = $state(false);
  let fileError = $state<string | null>(null);

  let startH = $state(0);
  let startM = $state(0);
  let startS = $state(0);
  let endH = $state(0);
  let endM = $state(0);
  let endS = $state(0);
  let streamCopy = $state(true);

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

  function isMedia(name: string) {
    const e = extOf(name);
    return VIDEO_EXTS.has(e) || AUDIO_EXTS.has(e);
  }

  function secsToHMS(s: number) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return { h, m, sec };
  }

  async function loadFile(path: string, label: string) {
    fileError = null;
    toast = null;
    outputPath = null;
    if (!isMedia(label)) {
      fileError = get(_)("common.avOnly");
      return;
    }
    filePath = path;
    fileLabel = label;
    durationSec = null;

    if (!hasLfc) return;
    const r = await window.lfc.probeMedia({ inputPath: path });
    if (r.ok && r.summary.durationSec != null) {
      durationSec = r.summary.durationSec;
      startH = 0; startM = 0; startS = 0;
      const { h, m, sec } = secsToHMS(Math.floor(r.summary.durationSec));
      endH = h; endM = m; endS = sec;
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
      void loadFile(window.lfc.getPathForFile(file), file.name);
    } catch {
      fileError = get(_)("common.pathFailed");
    }
  }

  const startSec = $derived(startH * 3600 + startM * 60 + startS);
  const endSec = $derived(endH * 3600 + endM * 60 + endS);
  const durSec = $derived(endSec - startSec);

  function formatDuration(s: number): string {
    if (s <= 0) return "0s";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    const parts: string[] = [];
    if (h > 0) parts.push(`${h}s`);
    if (m > 0) parts.push(`${m}d`);
    parts.push(`${sec}sn`);
    return parts.join(" ");
  }

  const canTrim = $derived(
    Boolean(hasLfc && filePath && fileLabel && endSec > startSec && !busy)
  );

  async function trim() {
    if (!hasLfc || !filePath || !fileLabel) return;
    const dirResult = await window.lfc.getOutputDir();
    if (dirResult.ok === false) {
      toast = get(_)("common.outputDirFailed", { values: { message: dirResult.message } });
      toastError = true;
      return;
    }
    const dot = fileLabel.lastIndexOf(".");
    const base = dot >= 0 ? fileLabel.slice(0, dot) : fileLabel;
    const ext = dot >= 0 ? fileLabel.slice(dot) : "";
    const startTag = `${String(startH).padStart(2,"0")}${String(startM).padStart(2,"0")}${String(startS).padStart(2,"0")}`;
    const endTag = `${String(endH).padStart(2,"0")}${String(endM).padStart(2,"0")}${String(endS).padStart(2,"0")}`;
    const out = `${dirResult.dir}/${base}-trim-${startTag}-${endTag}${ext}`;

    busy = true;
    progress = null;
    toast = null;
    outputPath = null;

    const r = await window.lfc.videoTrim(
      { inputPath: filePath, outputPath: out, startSec, endSec, streamCopy },
      (p) => { progress = p; }
    );
    busy = false;
    progress = null;

    if (r.ok) {
      outputPath = out;
      toast = get(_)("trim.doneWith", { values: { file: out.split(/[/\\]/).pop() } });
      toastError = false;
    } else if (r.ok === false) {
      toast = get(_)("common.errorWith", { values: { message: r.message } });
      toastError = true;
    }
  }
</script>

<div class="page">
  <header class="page-header">
    <h1 class="page-title">{$_("trim.title")}</h1>
    <p class="page-sub">{$_("trim.pageSubtitle")}</p>
  </header>

  <section class="card">
    <h2 class="card-title">{$_("common.file")}</h2>
    <div
      class="drop-zone"
      class:drag={isDragging}
      class:has-file={!!filePath}
      role="button"
      tabindex="0"
      aria-label={$_("common.pickFile")}
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
          {#if durationSec != null}
            <span class="file-dur">{formatDuration(durationSec)}</span>
          {/if}
          <span class="change-hint">{$_("common.changeHint")}</span>
        </div>
      {:else}
        <div class="drop-hint">
          <span class="drop-icon" aria-hidden="true">✂️</span>
          <span>{$_("common.pickMediaHint")}</span>
        </div>
      {/if}
    </div>
    {#if fileError}
      <p class="error-msg" role="alert">{fileError}</p>
    {/if}
  </section>

  {#if filePath}
    <section class="card">
      <h2 class="card-title">{$_("trim.range")}</h2>

      <div class="time-row">
        <div class="time-group">
          <span class="time-label">{$_("trim.start")}</span>
          <div class="time-inputs">
            <label class="time-field">
              <span>{$_("common.hours")}</span>
              <input type="number" min="0" max="99" bind:value={startH} class="time-input" />
            </label>
            <span class="time-sep">:</span>
            <label class="time-field">
              <span>{$_("common.minutes")}</span>
              <input type="number" min="0" max="59" bind:value={startM} class="time-input" />
            </label>
            <span class="time-sep">:</span>
            <label class="time-field">
              <span>{$_("common.seconds")}</span>
              <input type="number" min="0" max="59" bind:value={startS} class="time-input" />
            </label>
          </div>
        </div>

        <div class="time-arrow" aria-hidden="true">→</div>

        <div class="time-group">
          <span class="time-label">{$_("trim.end")}</span>
          <div class="time-inputs">
            <label class="time-field">
              <span>{$_("common.hours")}</span>
              <input type="number" min="0" max="99" bind:value={endH} class="time-input" />
            </label>
            <span class="time-sep">:</span>
            <label class="time-field">
              <span>{$_("common.minutes")}</span>
              <input type="number" min="0" max="59" bind:value={endM} class="time-input" />
            </label>
            <span class="time-sep">:</span>
            <label class="time-field">
              <span>{$_("common.seconds")}</span>
              <input type="number" min="0" max="59" bind:value={endS} class="time-input" />
            </label>
          </div>
        </div>
      </div>

      {#if durSec > 0}
        <p class="duration-hint">{$_("trim.selectedDuration", { values: { duration: formatDuration(durSec) } })}</p>
      {:else if endSec <= startSec}
        <p class="error-msg" role="alert">{$_("trim.endAfterStart")}</p>
      {/if}

      <div class="option-row">
        <label class="checkbox-label">
          <input type="checkbox" bind:checked={streamCopy} />
          <span>{$_("trim.streamCopy")}</span>
        </label>
        {#if !streamCopy}
          <p class="info-note">{$_("trim.reencodeNote")}</p>
        {/if}
      </div>
    </section>
  {/if}

  <section class="card action-card">
    {#if busy}
      <div class="progress-row">
        <div class="progress-bar">
          <div
            class="progress-fill"
            style="width: {progress != null ? progress : 0}%"
          ></div>
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
      >{$_("common.showInDir")}</button>
    {/if}
    <button
      type="button"
      class="btn btn-primary"
      disabled={!canTrim}
      onclick={trim}
    >
      {#if busy}{$_("trim.trimming")}{:else if !filePath}{$_("common.selectFileFirst")}{:else}{$_("trim.trim")}{/if}
    </button>
  </section>
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 1.25rem; max-width: 680px; }
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
  .file-name { font-weight: 600; font-size: 0.92rem; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 22ch; }
  .file-dur { font-size: 0.8rem; color: var(--muted); background: var(--surface-elevated); padding: 0.15rem 0.5rem; border-radius: 999px; border: 1px solid var(--border); }
  .change-hint { font-size: 0.75rem; color: var(--muted); }
  .drop-hint { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; }
  .drop-icon { font-size: 2rem; margin-bottom: 0.25rem; }
  .error-msg { color: var(--danger); font-size: 0.84rem; margin: 0; padding: 0.5rem 0.75rem; background: rgba(239,68,68,0.08); border-radius: 8px; border: 1px solid rgba(239,68,68,0.2); }
  .time-row { display: flex; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
  .time-group { display: flex; flex-direction: column; gap: 0.4rem; }
  .time-label { font-size: 0.84rem; font-weight: 600; color: var(--muted); }
  .time-inputs { display: flex; align-items: center; gap: 0.3rem; }
  .time-field { display: flex; flex-direction: column; align-items: center; gap: 0.2rem; }
  .time-field span { font-size: 0.7rem; color: var(--muted); }
  .time-input { width: 3.2rem; text-align: center; padding: 0.35rem 0.4rem; border: 1px solid var(--border); border-radius: var(--radius-button); background: var(--surface-elevated); color: var(--text); font: inherit; font-size: 1rem; }
  .time-input:focus { outline: none; border-color: var(--accent-start); }
  .time-sep { font-size: 1.2rem; font-weight: 700; color: var(--muted); margin-top: 1.1rem; }
  .time-arrow { font-size: 1.5rem; color: var(--muted); margin-top: 1.5rem; }
  .duration-hint { font-size: 0.88rem; color: var(--muted); margin: 0; }
  .option-row { display: flex; flex-direction: column; gap: 0.4rem; }
  .checkbox-label { display: flex; align-items: center; gap: 0.6rem; font-size: 0.88rem; color: var(--text); cursor: pointer; user-select: none; }
  .checkbox-label input { width: 1rem; height: 1rem; accent-color: var(--accent-start); }
  .info-note { font-size: 0.8rem; color: var(--muted); margin: 0; padding: 0.4rem 0.6rem; background: var(--surface-elevated); border-radius: 6px; border: 1px solid var(--border); }
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
