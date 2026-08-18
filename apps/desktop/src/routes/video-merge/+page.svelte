<script lang="ts">
  import { browser } from "$app/environment";
  import { recordConversion } from "$lib/history/store";

  const VIDEO_EXTS = new Set(["mp4","m4v","mkv","webm","avi","mov","wmv","flv","ogv","mpg","mpeg","ts","m2ts","mts","3gp","3g2","asf","divx","vob","f4v","dv"]);

  const hasLfc = browser && typeof window !== "undefined" && "lfc" in window && !!window.lfc;

  let files = $state<{ path: string; label: string }[]>([]);
  let isDragging = $state(false);
  let fileError = $state<string | null>(null);

  let busy = $state(false);
  let progress = $state<number | null>(null);
  let toast = $state<string | null>(null);
  let outputPath = $state<string | null>(null);

  function extOf(name: string) {
    return (name.split(".").pop() ?? "").toLowerCase();
  }

  function addFile(path: string, label: string) {
    fileError = null;
    if (!VIDEO_EXTS.has(extOf(label))) {
      fileError = `"${label}" desteklenmiyor. Yalnızca video dosyaları eklenebilir.`;
      return;
    }
    if (files.find((f) => f.path === path)) return;
    files = [...files, { path, label }];
  }

  function removeFile(idx: number) {
    files = files.filter((_, i) => i !== idx);
  }

  function moveFile(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    if (next < 0 || next >= files.length) return;
    const arr = [...files];
    const tmp = arr[idx];
    arr[idx] = arr[next]!;
    arr[next] = tmp!;
    files = arr;
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
    const firstName = files[0]?.label ?? "video";
    const dot = firstName.lastIndexOf(".");
    const base = dot >= 0 ? firstName.slice(0, dot) : firstName;
    const ext = extOf(firstName) || "mp4";
    const filename = `${base}-birlesim.${ext}`;
    const sep = dirResult.dir.includes("\\") ? "\\" : "/";
    const outPath = `${dirResult.dir}${sep}${filename}`;

    busy = true;
    progress = null;
    toast = null;
    outputPath = null;

    const r = await window.lfc.videoMerge(
      { inputPaths: files.map((f) => f.path), outputPath: outPath },
      (p) => { progress = p; }
    );
    busy = false;

    if (r.ok) {
      outputPath = outPath;
      toast = "Video birleştirme tamamlandı!";
      await recordConversion({
        inputFilename: files.map((f) => f.label).join(" + "),
        inputExt: ext,
        outputFilename: filename,
        outputExt: ext,
        outputPath: outPath,
        targetProfileId: "video-merge-concat",
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
    <h1 class="page-title">Video Birleştirme</h1>
    <p class="page-sub">Video dosyalarını sırayla birleştirir. Tüm dosyalar aynı codec ve çözünürlükte olmalıdır (aksi takdirde stream copy başarısız olabilir).</p>
  </header>

  <section class="card">
    <h2 class="card-title">Video Dosyaları ({files.length}/∞ — en az 2)</h2>

    <div
      class="drop-zone"
      class:drag={isDragging}
      role="button"
      tabindex="0"
      aria-label="Video dosyası ekle"
      ondragover={(e) => { e.preventDefault(); isDragging = true; }}
      ondragleave={() => (isDragging = false)}
      ondrop={(e) => { e.preventDefault(); onDrop(e); }}
      onclick={onPick}
      onkeydown={(e) => e.key === "Enter" && onPick()}
    >
      <span class="drop-icon" aria-hidden="true">🎬</span>
      <span>Video dosyası ekle (tıkla veya sürükle)</span>
      <span class="drop-sub">MP4, MKV, MOV, AVI ve daha fazlası</span>
    </div>

    {#if fileError}
      <p class="error-msg" role="alert">{fileError}</p>
    {/if}

    {#if files.length > 0}
      <p class="hint">Sırayı değiştirmek için ↑↓ butonlarını kullan.</p>
      <ul class="file-list">
        {#each files as f, i (f.path)}
          <li class="file-item">
            <span class="file-idx">{i + 1}</span>
            <span class="file-name">{f.label}</span>
            <div class="file-actions">
              <button type="button" class="order-btn" disabled={i === 0} onclick={() => moveFile(i, -1)} aria-label="Yukarı taşı">↑</button>
              <button type="button" class="order-btn" disabled={i === files.length - 1} onclick={() => moveFile(i, 1)} aria-label="Aşağı taşı">↓</button>
              <button type="button" class="remove-btn" onclick={() => removeFile(i)} aria-label="Kaldır">✕</button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="card info-card">
    <p class="info-text">
      ℹ️ Video birleştirme <strong>stream copy</strong> modunda çalışır — yeniden kodlama yapılmaz, çok hızlıdır.
      Tüm dosyaların aynı codec (ör. H.264) ve ses formatında olması gerekir.
    </p>
  </section>

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
          <div class="progress-fill" style="width:{progress ?? 0}%" class:indeterminate={progress == null}></div>
        </div>
        <span class="progress-label">{progress != null ? `%${Math.round(progress)}` : "İşleniyor…"}</span>
      </div>
      <button type="button" class="btn btn-danger" onclick={cancel}>İptal</button>
    {:else}
      <button type="button" class="btn btn-primary" disabled={!canStart} onclick={startMerge}>
        {files.length < 2 ? "En az 2 video ekle" : "Birleştirmeyi Başlat"}
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
  .drop-zone { border: 2px dashed var(--border); border-radius: var(--radius-button); padding: 1.5rem 1rem; text-align: center; cursor: pointer; color: var(--muted); font-size: 0.9rem; transition: border-color 0.15s, background 0.15s; user-select: none; display: flex; flex-direction: column; align-items: center; gap: 0.3rem; }
  .drop-zone:hover, .drop-zone.drag { border-color: var(--accent-start); background: rgba(56,189,248,0.05); }
  .drop-icon { font-size: 1.8rem; }
  .drop-sub { font-size: 0.78rem; opacity: 0.7; }
  .error-msg { color: var(--danger); font-size: 0.84rem; margin: 0; padding: 0.5rem 0.75rem; background: rgba(239,68,68,0.08); border-radius: 8px; border: 1px solid rgba(239,68,68,0.2); }
  .hint { font-size: 0.8rem; color: var(--muted); margin: 0; font-style: italic; }
  .file-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
  .file-item { display: flex; align-items: center; gap: 0.6rem; padding: 0.5rem 0.65rem; border-radius: 8px; border: 1px solid var(--border); background: var(--surface-elevated); }
  .file-idx { font-size: 0.78rem; color: var(--muted); min-width: 1.2rem; text-align: right; font-variant-numeric: tabular-nums; }
  .file-name { flex: 1; font-size: 0.88rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .file-actions { display: flex; gap: 0.25rem; }
  .order-btn { background: none; border: 1px solid var(--border); color: var(--muted); cursor: pointer; font-size: 0.8rem; padding: 0.15rem 0.35rem; border-radius: 4px; }
  .order-btn:not(:disabled):hover { color: var(--text); border-color: var(--accent-start); }
  .order-btn:disabled { opacity: 0.3; cursor: not-allowed; }
  .remove-btn { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 0.78rem; padding: 0.1rem 0.3rem; border-radius: 4px; }
  .remove-btn:hover { color: var(--danger); background: rgba(239,68,68,0.1); }
  .info-card { background: rgba(56,189,248,0.04); border-color: rgba(56,189,248,0.2); }
  .info-text { font-size: 0.84rem; color: var(--muted); margin: 0; line-height: 1.5; }
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
