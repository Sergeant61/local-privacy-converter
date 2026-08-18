<script lang="ts">
  import { browser } from "$app/environment";
  import { recordConversion } from "$lib/history/store";

  type MergeMode = "concat" | "mix";
  type OutputFormat = "mp3" | "m4a" | "wav" | "flac";

  const ENCODER_MAP: Record<OutputFormat, string> = {
    mp3: "libmp3lame",
    m4a: "aac",
    wav: "pcm_s16le",
    flac: "flac",
  };

  const FORMAT_OPTIONS: { value: OutputFormat; label: string; desc: string }[] = [
    { value: "mp3",  label: "MP3",  desc: "Evrensel uyumluluk" },
    { value: "m4a",  label: "M4A",  desc: "Apple / yüksek kalite" },
    { value: "wav",  label: "WAV",  desc: "Kayıpsız, büyük dosya" },
    { value: "flac", label: "FLAC", desc: "Kayıpsız, sıkıştırılmış" },
  ];

  const AUDIO_EXTS = new Set(["mp3","wav","flac","aac","m4a","m4b","ogg","oga","opus","wma","aiff","aif","ac3","eac3","dts","mka","ape","wv","caf","au"]);

  const hasLfc = browser && typeof window !== "undefined" && "lfc" in window && !!window.lfc;

  let files = $state<{ path: string; label: string }[]>([]);
  let isDragging = $state(false);
  let fileError = $state<string | null>(null);

  let mergeMode = $state<MergeMode>("concat");
  let outputFormat = $state<OutputFormat>("mp3");

  let busy = $state(false);
  let progress = $state<number | null>(null);
  let toast = $state<string | null>(null);
  let outputPath = $state<string | null>(null);

  function extOf(name: string) {
    return (name.split(".").pop() ?? "").toLowerCase();
  }

  function addFile(path: string, label: string) {
    fileError = null;
    if (!AUDIO_EXTS.has(extOf(label))) {
      fileError = `"${label}" desteklenmiyor. Yalnızca ses dosyaları eklenebilir.`;
      return;
    }
    if (files.find((f) => f.path === path)) return;
    files = [...files, { path, label }];
  }

  function removeFile(idx: number) {
    files = files.filter((_, i) => i !== idx);
  }

  async function onPick() {
    if (!hasLfc) return;
    const r = await window.lfc.showOpenMediaDialog();
    if (r.canceled === false) {
      const base = r.filePath.split(/[/\\]/).pop() ?? "dosya";
      addFile(r.filePath, base);
    }
  }

  function onDrop(e: DragEvent) {
    isDragging = false;
    if (!hasLfc) return;
    const items = e.dataTransfer?.files;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const file = items.item(i);
      if (!file) continue;
      try {
        addFile(window.lfc.getPathForFile(file), file.name);
      } catch {
        fileError = "Dosya yolu alınamadı.";
      }
    }
  }

  async function startMerge() {
    if (!hasLfc || files.length < 2) return;
    const dirResult = await window.lfc.getOutputDir();
    if (dirResult.ok === false) {
      toast = `Çıktı klasörü oluşturulamadı: ${dirResult.message}`;
      return;
    }
    const firstName = files[0]?.label ?? "birlesim";
    const dot = firstName.lastIndexOf(".");
    const base = dot >= 0 ? firstName.slice(0, dot) : firstName;
    const filename = `${base}-birlesim.${outputFormat}`;
    const sep = dirResult.dir.includes("\\") ? "\\" : "/";
    const outPath = `${dirResult.dir}${sep}${filename}`;

    busy = true;
    progress = null;
    toast = null;
    outputPath = null;

    const r = await window.lfc.audioMerge(
      {
        inputPaths: files.map((f) => f.path),
        outputPath: outPath,
        mode: mergeMode,
        outputEncoder: ENCODER_MAP[outputFormat],
      },
      (p) => { progress = p; }
    );
    busy = false;

    if (r.ok) {
      outputPath = outPath;
      toast = "Birleştirme tamamlandı!";
      await recordConversion({
        inputFilename: files.map((f) => f.label).join(" + "),
        inputExt: extOf(files[0]?.label ?? ""),
        outputFilename: filename,
        outputExt: outputFormat,
        outputPath: outPath,
        targetProfileId: `audio-merge-${mergeMode}`,
        timestamp: Date.now(),
        status: "success",
      });
    } else {
      const msg = r.ok === false ? (r.message ?? "Hata") : "Hata";
      toast = `Hata: ${msg}`;
    }
  }

  async function cancel() {
    if (hasLfc) await window.lfc.cancelConvert();
    busy = false;
    progress = null;
    toast = "İptal edildi.";
  }

  const canStart = $derived(files.length >= 2 && !busy && hasLfc);
</script>

<div class="page">
  <header class="page-header">
    <h1 class="page-title">Ses Birleştirme</h1>
    <p class="page-sub">Birden fazla ses dosyasını tek parçaya birleştirir. Sıralı (concat) veya eş zamanlı (mix) mod seçilebilir.</p>
  </header>

  <!-- Dosya Listesi -->
  <section class="card">
    <h2 class="card-title">Ses Dosyaları ({files.length}/∞ — en az 2)</h2>

    <div
      class="drop-zone"
      class:drag={isDragging}
      role="button"
      tabindex="0"
      aria-label="Ses dosyası eklemek için tıkla veya sürükle"
      ondragover={(e) => { e.preventDefault(); isDragging = true; }}
      ondragleave={() => (isDragging = false)}
      ondrop={(e) => { e.preventDefault(); onDrop(e); }}
      onclick={onPick}
      onkeydown={(e) => e.key === "Enter" && onPick()}
    >
      <span class="drop-icon" aria-hidden="true">🎵</span>
      <span>Ses dosyası ekle (tıkla veya sürükle)</span>
      <span class="drop-sub">MP3, WAV, FLAC, M4A, OGG ve daha fazlası</span>
    </div>

    {#if fileError}
      <p class="error-msg" role="alert">{fileError}</p>
    {/if}

    {#if files.length > 0}
      <ul class="file-list">
        {#each files as f, i (f.path)}
          <li class="file-item">
            <span class="file-idx">{i + 1}</span>
            <span class="file-name">{f.label}</span>
            <button
              type="button"
              class="remove-btn"
              aria-label="Kaldır"
              onclick={() => removeFile(i)}
            >✕</button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <!-- Ayarlar -->
  <section class="card">
    <h2 class="card-title">Birleştirme Ayarları</h2>

    <div class="setting-group">
      <span class="field-label">Mod</span>
      <div class="toggle-pair">
        <button
          type="button"
          class="toggle-btn"
          class:active={mergeMode === "concat"}
          onclick={() => (mergeMode = "concat")}
        >
          <strong>Sıralı (Concat)</strong>
          <small>Dosyalar art arda çalar</small>
        </button>
        <button
          type="button"
          class="toggle-btn"
          class:active={mergeMode === "mix"}
          onclick={() => (mergeMode = "mix")}
        >
          <strong>Karıştır (Mix)</strong>
          <small>Dosyalar eş zamanlı çalar</small>
        </button>
      </div>
    </div>

    <div class="setting-group">
      <span class="field-label">Çıktı Formatı</span>
      <div class="format-grid">
        {#each FORMAT_OPTIONS as opt (opt.value)}
          <button
            type="button"
            class="format-btn"
            class:active={outputFormat === opt.value}
            onclick={() => (outputFormat = opt.value)}
          >
            <span class="format-label">{opt.label}</span>
            <span class="format-desc">{opt.desc}</span>
          </button>
        {/each}
      </div>
    </div>
  </section>

  <!-- Kontrol -->
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

    {#if busy}
      <div class="progress-wrap">
        <div class="progress-bar">
          <div
            class="progress-fill"
            style="width:{progress != null ? progress : 0}%"
            class:indeterminate={progress == null}
          ></div>
        </div>
        <span class="progress-label">{progress != null ? `%${Math.round(progress)}` : "İşleniyor…"}</span>
      </div>
      <button type="button" class="btn btn-danger" onclick={cancel}>İptal</button>
    {:else}
      <button
        type="button"
        class="btn btn-primary"
        disabled={!canStart}
        onclick={startMerge}
      >
        {files.length < 2 ? "En az 2 dosya ekle" : "Birleştirmeyi Başlat"}
      </button>
    {/if}
  </section>
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 1.25rem; max-width: 640px; }
  .page-header { margin-bottom: 0.25rem; }
  .page-title {
    font-size: 1.45rem; font-weight: 700; margin: 0 0 0.3rem;
    background: linear-gradient(90deg, var(--accent-start), var(--accent-end));
    -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
  }
  .page-sub { font-size: 0.88rem; color: var(--muted); margin: 0; }
  .card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-card); padding: 1.25rem 1.5rem;
    display: flex; flex-direction: column; gap: 1rem;
  }
  .card-title { font-size: 0.85rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); margin: 0; }
  .drop-zone {
    border: 2px dashed var(--border); border-radius: var(--radius-button); padding: 1.5rem 1rem;
    text-align: center; cursor: pointer; color: var(--muted); font-size: 0.9rem;
    transition: border-color 0.15s, background 0.15s; user-select: none;
    display: flex; flex-direction: column; align-items: center; gap: 0.3rem;
  }
  .drop-zone:hover, .drop-zone.drag { border-color: var(--accent-start); background: rgba(56,189,248,0.05); }
  .drop-icon { font-size: 1.8rem; }
  .drop-sub { font-size: 0.78rem; opacity: 0.7; }
  .error-msg { color: var(--danger); font-size: 0.84rem; margin: 0; padding: 0.5rem 0.75rem; background: rgba(239,68,68,0.08); border-radius: 8px; border: 1px solid rgba(239,68,68,0.2); }
  .file-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
  .file-item {
    display: flex; align-items: center; gap: 0.6rem;
    padding: 0.5rem 0.65rem; border-radius: 8px;
    border: 1px solid var(--border); background: var(--surface-elevated);
  }
  .file-idx { font-size: 0.78rem; color: var(--muted); min-width: 1.2rem; text-align: right; font-variant-numeric: tabular-nums; }
  .file-name { flex: 1; font-size: 0.88rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .remove-btn { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 0.78rem; padding: 0.1rem 0.3rem; border-radius: 4px; }
  .remove-btn:hover { color: var(--danger); background: rgba(239,68,68,0.1); }
  .setting-group { display: flex; flex-direction: column; gap: 0.5rem; }
  .field-label { font-size: 0.84rem; color: var(--muted); }
  .toggle-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
  .toggle-btn {
    display: flex; flex-direction: column; align-items: center; gap: 0.15rem;
    padding: 0.7rem 0.5rem; border-radius: var(--radius-button);
    border: 1px solid var(--border); background: var(--surface-elevated);
    color: var(--text); cursor: pointer; transition: border-color 0.12s, background 0.12s;
  }
  .toggle-btn:hover { border-color: var(--accent-start); background: var(--surface-hover); }
  .toggle-btn.active { border-color: var(--accent-start); background: rgba(56,189,248,0.1); color: var(--accent-start); }
  .toggle-btn strong { font-size: 0.9rem; }
  .toggle-btn small { font-size: 0.72rem; color: var(--muted); }
  .toggle-btn.active small { color: var(--accent-start); opacity: 0.8; }
  .format-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; }
  .format-btn {
    display: flex; flex-direction: column; align-items: center; gap: 0.15rem;
    padding: 0.6rem 0.35rem; border-radius: var(--radius-button);
    border: 1px solid var(--border); background: var(--surface-elevated);
    color: var(--text); cursor: pointer; transition: border-color 0.12s, background 0.12s; text-align: center;
  }
  .format-btn:hover { border-color: var(--accent-start); background: var(--surface-hover); }
  .format-btn.active { border-color: var(--accent-start); background: rgba(56,189,248,0.1); color: var(--accent-start); }
  .format-label { font-size: 0.9rem; font-weight: 700; }
  .format-desc { font-size: 0.68rem; color: var(--muted); }
  .format-btn.active .format-desc { color: var(--accent-start); opacity: 0.8; }
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
