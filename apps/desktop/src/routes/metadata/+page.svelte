<script lang="ts">
  import { browser } from "$app/environment";

  const MEDIA_EXTS = new Set(["mp4","m4v","mkv","webm","avi","mov","wmv","ts","mp3","wav","m4a","flac","opus","aac","ogg"]);

  const hasLfc = browser && typeof window !== "undefined" && "lfc" in window && !!window.lfc;

  let filePath = $state<string | null>(null);
  let fileLabel = $state<string | null>(null);
  let isDragging = $state(false);
  let fileError = $state<string | null>(null);

  let loading = $state(false);

  const TAG_FIELDS: { key: string; label: string; placeholder: string }[] = [
    { key: "title",   label: "Başlık",    placeholder: "Film / parça adı" },
    { key: "artist",  label: "Sanatçı",   placeholder: "Sanatçı veya yönetmen" },
    { key: "album",   label: "Albüm",     placeholder: "Albüm veya koleksiyon" },
    { key: "date",    label: "Yıl",       placeholder: "2024" },
    { key: "genre",   label: "Tür",       placeholder: "Pop, Rock, Belgesel…" },
    { key: "comment", label: "Yorum",     placeholder: "Ek açıklama" },
  ];

  let tags = $state<Record<string, string>>({
    title: "", artist: "", album: "", date: "", genre: "", comment: ""
  });

  let busy = $state(false);
  let toast = $state<string | null>(null);
  let outputPath = $state<string | null>(null);

  function extOf(name: string) {
    return (name.split(".").pop() ?? "").toLowerCase();
  }

  async function loadFile(path: string, label: string) {
    fileError = null;
    toast = null;
    outputPath = null;
    if (!MEDIA_EXTS.has(extOf(label))) {
      fileError = "Video veya ses dosyası seçin.";
      return;
    }
    filePath = path;
    fileLabel = label;
    loading = true;
    tags = { title: "", artist: "", album: "", date: "", genre: "", comment: "" };

    if (hasLfc) {
      const r = await window.lfc.metadataRead(path);
      if (r.ok) {
        for (const f of TAG_FIELDS) {
          tags[f.key] = r.tags[f.key] ?? "";
        }
      }
    }
    loading = false;
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
    try { void loadFile(window.lfc.getPathForFile(file), file.name); }
    catch { fileError = "Dosya yolu alınamadı."; }
  }

  const canSave = $derived(Boolean(hasLfc && filePath && fileLabel && !busy && !loading));

  async function save() {
    if (!hasLfc || !filePath || !fileLabel) return;
    const dirResult = await window.lfc.getOutputDir();
    if (dirResult.ok === false) {
      toast = `Çıktı klasörü oluşturulamadı: ${dirResult.message}`;
      return;
    }
    const dot = fileLabel.lastIndexOf(".");
    const base = dot >= 0 ? fileLabel.slice(0, dot) : fileLabel;
    const ext = dot >= 0 ? fileLabel.slice(dot) : "";
    const out = `${dirResult.dir}/${base}-tagged${ext}`;

    busy = true;
    toast = null;
    outputPath = null;

    const nonEmpty: Record<string, string> = {};
    for (const [k, v] of Object.entries(tags)) {
      if (v.trim()) nonEmpty[k] = v.trim();
    }

    const r = await window.lfc.metadataWrite({ inputPath: filePath, outputPath: out, tags: nonEmpty });
    busy = false;

    if (r.ok) {
      outputPath = out;
      toast = `Metadata kaydedildi: ${out.split(/[/\\]/).pop()}`;
    } else if (r.ok === false) {
      toast = `Hata: ${r.message}`;
    }
  }
</script>

<div class="page">
  <header class="page-header">
    <h1 class="page-title">Metadata Düzenleyici</h1>
    <p class="page-sub">Video veya ses dosyasının başlık, sanatçı, yıl gibi etiketlerini düzenle.</p>
  </header>

  <section class="card">
    <h2 class="card-title">Dosya</h2>
    <div
      class="drop-zone"
      class:drag={isDragging}
      class:has-file={!!filePath}
      role="button"
      tabindex="0"
      aria-label="Medya dosyası seç"
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
          <span class="change-hint">Değiştirmek için tıkla</span>
        </div>
      {:else}
        <div class="drop-hint">
          <span class="drop-icon" aria-hidden="true">🏷️</span>
          <span>Video veya ses dosyası seç (tıkla veya sürükle)</span>
        </div>
      {/if}
    </div>
    {#if fileError}
      <p class="error-msg" role="alert">{fileError}</p>
    {/if}
    {#if loading}
      <p class="loading-msg">Etiketler okunuyor…</p>
    {/if}
  </section>

  {#if filePath && !loading}
    <section class="card">
      <h2 class="card-title">Etiketler</h2>
      <div class="tags-grid">
        {#each TAG_FIELDS as field (field.key)}
          <label class="field-block">
            <span class="field-label">{field.label}</span>
            <input
              type="text"
              bind:value={tags[field.key]}
              placeholder={field.placeholder}
              class="text-input"
            />
          </label>
        {/each}
      </div>
      <p class="info-note">Boş bırakılan alanlar mevcut değerleriyle korunur. Çıktı dosyası orijinal ile aynı formatta kaydedilir (<code>-c copy</code>).</p>
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
    <button
      type="button"
      class="btn btn-primary"
      disabled={!canSave}
      onclick={save}
    >
      {#if busy}Kaydediliyor…{:else if !filePath}Önce Dosya Seç{:else}Kaydet{/if}
    </button>
  </section>
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 1.25rem; max-width: 600px; }
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
  .loading-msg { font-size: 0.84rem; color: var(--muted); margin: 0; font-style: italic; }
  .tags-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
  .field-block { display: flex; flex-direction: column; gap: 0.3rem; }
  .field-label { font-size: 0.84rem; font-weight: 600; color: var(--text); }
  .text-input { padding: 0.45rem 0.65rem; border: 1px solid var(--border); border-radius: var(--radius-button); background: var(--surface-elevated); color: var(--text); font: inherit; font-size: 0.9rem; width: 100%; }
  .text-input:focus { outline: none; border-color: var(--accent-start); }
  .info-note { font-size: 0.8rem; color: var(--muted); margin: 0; padding: 0.5rem 0.75rem; background: var(--surface-elevated); border-radius: 8px; border: 1px solid var(--border); }
  .info-note code { font-family: monospace; font-size: 0.85em; background: var(--surface); padding: 0.1rem 0.3rem; border-radius: 4px; border: 1px solid var(--border); }
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
