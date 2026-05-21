<script lang="ts">
  import { browser } from "$app/environment";

  const VIDEO_EXTS = new Set(["mp4","m4v","mkv","webm","avi","mov","wmv","ts","m2ts","mts","3gp","vob"]);

  const hasLfc = browser && typeof window !== "undefined" && "lfc" in window && !!window.lfc;

  interface SubtitleStream {
    index: number;
    codecName: string;
    title: string;
    language: string;
  }

  let filePath = $state<string | null>(null);
  let fileLabel = $state<string | null>(null);
  let isDragging = $state(false);
  let fileError = $state<string | null>(null);

  let probing = $state(false);
  let streams = $state<SubtitleStream[]>([]);
  let selectedIndex = $state<number | null>(null);
  let outputFormat = $state<"srt" | "ass" | "vtt">("srt");

  let busy = $state(false);
  let toast = $state<string | null>(null);
  let outputPath = $state<string | null>(null);

  function extOf(name: string) {
    return (name.split(".").pop() ?? "").toLowerCase();
  }

  async function loadFile(path: string, label: string) {
    fileError = null;
    streams = [];
    selectedIndex = null;
    toast = null;
    outputPath = null;
    if (!VIDEO_EXTS.has(extOf(label))) {
      fileError = "Yalnızca video konteyneri desteklenir (MKV, MP4, TS vs.).";
      return;
    }
    filePath = path;
    fileLabel = label;
    await probe(path);
  }

  async function probe(path: string) {
    if (!hasLfc) return;
    probing = true;
    const r = await window.lfc.subtitleProbe(path);
    probing = false;
    if (r.ok === false) {
      fileError = `Akış bilgisi alınamadı: ${r.message}`;
      return;
    }
    streams = r.streams;
    if (streams.length > 0) selectedIndex = streams[0]!.index;
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
      fileError = "Dosya yolu alınamadı.";
    }
  }

  async function extract() {
    if (!hasLfc || !filePath || !fileLabel || selectedIndex === null) return;
    const dirResult = await window.lfc.getOutputDir();
    if (dirResult.ok === false) {
      toast = `Çıktı klasörü oluşturulamadı: ${dirResult.message}`;
      return;
    }
    const dot = fileLabel.lastIndexOf(".");
    const base = dot >= 0 ? fileLabel.slice(0, dot) : fileLabel;
    const stream = streams.find((s) => s.index === selectedIndex);
    const suffix = stream?.language ? `-${stream.language}` : `-sub${selectedIndex}`;
    const outPath = `${dirResult.dir}/${base}${suffix}.${outputFormat}`;

    busy = true;
    toast = null;
    outputPath = null;

    const r = await window.lfc.subtitleExtract({
      inputPath: filePath,
      streamIndex: selectedIndex,
      outputPath: outPath
    });
    busy = false;

    if (r.ok) {
      outputPath = outPath;
      toast = `Altyazı çıkarıldı: ${outPath.split(/[/\\]/).pop()}`;
    } else {
      const msg = r.ok === false ? (r.message ?? "Hata") : "Hata";
      toast = `Hata: ${msg}`;
    }
  }

  function streamLabel(s: SubtitleStream): string {
    const parts: string[] = [];
    if (s.language) parts.push(s.language.toUpperCase());
    if (s.title) parts.push(s.title);
    if (!parts.length) parts.push(`Akış #${s.index}`);
    parts.push(`(${s.codecName})`);
    return parts.join(" · ");
  }

  const canExtract = $derived(Boolean(filePath && selectedIndex !== null && !busy && !probing && hasLfc && streams.length > 0));
</script>

<div class="page">
  <header class="page-header">
    <h1 class="page-title">Altyazı Çıkarma</h1>
    <p class="page-sub">Video dosyasındaki altyazı akışlarını SRT, ASS veya VTT formatında dışa aktarır.</p>
  </header>

  <section class="card">
    <h2 class="card-title">Video Dosyası</h2>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="drop-zone"
      class:drag={isDragging}
      class:has-file={!!filePath}
      role="button"
      tabindex="0"
      aria-label="Video dosyası seç"
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
          <span class="change-hint">Değiştirmek için tıkla</span>
        </div>
      {:else}
        <div class="drop-hint">
          <span class="drop-icon" aria-hidden="true">📄</span>
          <span>Video dosyası seç (tıkla veya sürükle)</span>
          <span class="drop-sub">MKV, MP4, TS ve altyazı akışı içeren konteynerleri</span>
        </div>
      {/if}
    </div>
    {#if fileError}
      <p class="error-msg" role="alert">{fileError}</p>
    {/if}
    {#if probing}
      <p class="probing-msg">Akışlar taranıyor…</p>
    {/if}
  </section>

  {#if filePath && !probing}
    <section class="card">
      <h2 class="card-title">Altyazı Akışları</h2>
      {#if streams.length === 0}
        <p class="no-streams">Bu dosyada altyazı akışı bulunamadı.</p>
      {:else}
        <div class="streams-list">
          {#each streams as s (s.index)}
            <label class="stream-item" class:selected={selectedIndex === s.index}>
              <input
                type="radio"
                name="subtitle-stream"
                value={s.index}
                bind:group={selectedIndex}
                class="sr-only"
              />
              <span class="stream-icon" aria-hidden="true">💬</span>
              <span class="stream-label">{streamLabel(s)}</span>
            </label>
          {/each}
        </div>

        <div class="setting-row">
          <span class="field-label">Çıktı Formatı</span>
          <div class="format-group">
            {#each (["srt", "ass", "vtt"] as const) as fmt (fmt)}
              <button
                type="button"
                class="format-btn"
                class:active={outputFormat === fmt}
                onclick={() => (outputFormat = fmt)}
              >
                <strong>{fmt.toUpperCase()}</strong>
              </button>
            {/each}
          </div>
        </div>

        <div class="info-box">
          {#if outputFormat === "srt"}
            <strong>SRT</strong> — En yaygın format; metin tabanlı, zamanlama ve stil desteği sınırlı.
          {:else if outputFormat === "ass"}
            <strong>ASS/SSA</strong> — Gelişmiş stil ve konumlandırma desteği; anime altyazıları için yaygın.
          {:else}
            <strong>VTT</strong> — Web tarayıcıları için oluşturulmuş format; HTML5 video ile uyumlu.
          {/if}
          <br/><small>Not: Kaynak kodek doğrudan desteklenmiyorsa FFmpeg dönüşüm yapar.</small>
        </div>
      {/if}
    </section>
  {/if}

  <section class="card action-card">
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
    <button type="button" class="btn btn-primary" disabled={!canExtract} onclick={extract}>
      {#if !filePath}Önce Video Seç{:else if streams.length === 0}Altyazı Yok{:else}Altyazıyı Çıkar{/if}
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
  .file-name { font-weight: 600; font-size: 0.92rem; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 20ch; }
  .change-hint { font-size: 0.75rem; color: var(--muted); }
  .drop-hint { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; }
  .drop-icon { font-size: 2rem; margin-bottom: 0.25rem; }
  .drop-sub { font-size: 0.78rem; color: var(--muted); opacity: 0.7; }
  .error-msg { color: var(--danger); font-size: 0.84rem; margin: 0; padding: 0.5rem 0.75rem; background: rgba(239,68,68,0.08); border-radius: 8px; border: 1px solid rgba(239,68,68,0.2); }
  .probing-msg { font-size: 0.84rem; color: var(--muted); margin: 0; font-style: italic; }
  .no-streams { font-size: 0.88rem; color: var(--muted); margin: 0; font-style: italic; }
  .streams-list { display: flex; flex-direction: column; gap: 0.4rem; }
  .stream-item { display: flex; align-items: center; gap: 0.6rem; padding: 0.55rem 0.75rem; border-radius: var(--radius-button); border: 1px solid var(--border); background: var(--surface-elevated); cursor: pointer; transition: border-color 0.12s, background 0.12s; }
  .stream-item:hover { border-color: var(--accent-start); }
  .stream-item.selected { border-color: var(--accent-start); background: rgba(56,189,248,0.1); }
  .stream-icon { font-size: 1rem; flex-shrink: 0; }
  .stream-label { font-size: 0.88rem; color: var(--text); }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
  .setting-row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
  .field-label { font-size: 0.84rem; color: var(--muted); white-space: nowrap; }
  .format-group { display: flex; gap: 0.4rem; }
  .format-btn { display: flex; align-items: center; gap: 0.1rem; padding: 0.45rem 0.75rem; border-radius: var(--radius-button); border: 1px solid var(--border); background: var(--surface-elevated); color: var(--text); cursor: pointer; transition: border-color 0.12s, background 0.12s; }
  .format-btn:hover { border-color: var(--accent-start); }
  .format-btn.active { border-color: var(--accent-start); background: rgba(56,189,248,0.1); color: var(--accent-start); }
  .format-btn strong { font-size: 0.85rem; }
  .info-box { padding: 0.65rem 0.85rem; background: var(--surface-elevated); border-radius: 8px; border: 1px solid var(--border); font-size: 0.84rem; color: var(--muted); line-height: 1.5; }
  .info-box strong { color: var(--text); }
  .info-box small { font-size: 0.76rem; opacity: 0.75; }
  .action-card { gap: 0.75rem; }
  .toast { margin: 0; padding: 0.55rem 0.85rem; border-radius: 8px; font-size: 0.87rem; background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.25); color: var(--success); }
  .toast.toast-error { background: rgba(239,68,68,0.08); border-color: rgba(239,68,68,0.2); color: var(--danger); }
  .btn { padding: 0.6rem 1.4rem; border-radius: var(--radius-button); border: 1px solid transparent; font: inherit; font-size: 0.92rem; font-weight: 600; cursor: pointer; transition: opacity 0.12s, background 0.12s; align-self: flex-start; }
  .btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .btn-primary { background: linear-gradient(90deg, var(--accent-start), var(--accent-end)); color: #fff; border-color: transparent; }
  .btn-primary:not(:disabled):hover { opacity: 0.88; }
  .btn-secondary { background: var(--surface-elevated); color: var(--text); border-color: var(--border); }
  .btn-secondary:hover { background: var(--surface-hover); }
</style>
