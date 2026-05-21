<script lang="ts">
  import { browser } from "$app/environment";
  import { getTargetsForKind, targetProfileToJobHints } from "@lfc/media-formats";
  import type { TargetProfile } from "@lfc/media-formats";
  import type { MediaKind } from "@lfc/types";

  const hasLfc = browser && typeof window !== "undefined" && "lfc" in window && !!window.lfc;

  let filePath = $state<string | null>(null);
  let fileLabel = $state<string | null>(null);
  let isDragging = $state(false);
  let fileError = $state<string | null>(null);
  let mediaKind = $state<MediaKind>("video");

  let availableProfiles = $state<TargetProfile[]>([]);
  let selectedIds = $state<Set<string>>(new Set());

  type JobStatus = "pending" | "running" | "done" | "error";
  type OutputJob = {
    id: string;
    profileId: string;
    profileLabel: string;
    outputPath: string;
    status: JobStatus;
    progress: number | null;
    errorMsg?: string;
  };

  let jobs = $state<OutputJob[]>([]);
  let busy = $state(false);
  let toast = $state<string | null>(null);

  function extOf(name: string) {
    return (name.split(".").pop() ?? "").toLowerCase();
  }

  async function loadFile(p: string, label: string) {
    fileError = null;
    filePath = null;
    fileLabel = null;
    selectedIds = new Set();
    jobs = [];

    if (!hasLfc) return;
    let kind: MediaKind = "video";
    const ext = extOf(label);
    const AUDIO_EXTS = new Set(["mp3","wav","m4a","flac","opus","aac","ogg","wma"]);
    const IMAGE_EXTS = new Set(["png","jpg","jpeg","webp","avif","gif","bmp","tiff","tif"]);
    if (AUDIO_EXTS.has(ext)) kind = "audio";
    else if (IMAGE_EXTS.has(ext)) kind = "image-only";
    mediaKind = kind;
    availableProfiles = getTargetsForKind(kind).filter((pr) => !pr.id.startsWith("social-"));
    filePath = p;
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
      fileError = "Dosya yolu alınamadı.";
    }
  }

  function toggleProfile(id: string) {
    if (selectedIds.has(id)) {
      selectedIds.delete(id);
    } else {
      selectedIds.add(id);
    }
    selectedIds = new Set(selectedIds);
  }

  async function startAll() {
    if (!hasLfc || !filePath || !fileLabel || selectedIds.size === 0 || busy) return;
    const dirResult = await window.lfc.getOutputDir();
    if (dirResult.ok === false) {
      toast = `Çıktı klasörü oluşturulamadı: ${dirResult.message}`;
      return;
    }
    const sep = dirResult.dir.includes("\\") ? "\\" : "/";
    const dot = fileLabel.lastIndexOf(".");
    const base = dot >= 0 ? fileLabel.slice(0, dot) : fileLabel;

    const selectedProfiles = availableProfiles.filter((p) => selectedIds.has(p.id));
    jobs = selectedProfiles.map((p) => ({
      id: p.id,
      profileId: p.id,
      profileLabel: p.labelTr,
      outputPath: `${dirResult.dir}${sep}${base}-${p.id}.${p.outputExtension}`,
      status: "pending" as JobStatus,
      progress: null
    }));

    busy = true;
    toast = null;

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      if (!job) continue;
      jobs[i] = { ...job, status: "running" };
      jobs = [...jobs];

      const hints = targetProfileToJobHints(job.profileId as Parameters<typeof targetProfileToJobHints>[0]);
      const spec = {
        inputPath: filePath!,
        outputPath: job.outputPath,
        mode: hints.mode,
        audioOnlyOutput: hints.audioOnlyOutput,
        videoEncoder: hints.videoEncoder,
        audioEncoder: hints.audioEncoder
      };

      const r = await window.lfc.runConvertJob(
        { spec },
        (percent) => {
          jobs = jobs.map((j, idx) => idx === i ? { ...j, progress: percent } : j);
        }
      );

      jobs = jobs.map((j, idx) =>
        idx === i
          ? { ...j, status: r.ok ? "done" : "error", progress: null, errorMsg: r.ok ? undefined : (r.ok === false ? r.message : "Hata") }
          : j
      );
    }

    busy = false;
    const doneCount = jobs.filter((j) => j.status === "done").length;
    toast = `${doneCount}/${jobs.length} çıktı tamamlandı.`;
  }

  const canStart = $derived(selectedIds.size > 0 && !!filePath && !busy && hasLfc);

  function statusIcon(s: JobStatus) {
    if (s === "done") return "✓";
    if (s === "error") return "✗";
    if (s === "running") return "…";
    return "○";
  }
</script>

<div class="page">
  <header class="page-header">
    <h1 class="page-title">Çoklu Çıktı Formatı</h1>
    <p class="page-sub">
      Tek bir giriş dosyasından aynı anda birden fazla format üretir.
      Her seçilen profil için ayrı bir çıktı dosyası oluşturulur.
    </p>
  </header>

  <section class="card">
    <h2 class="card-title">Giriş Dosyası</h2>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="drop-zone"
      class:drag={isDragging}
      class:has-file={!!filePath}
      role="button"
      tabindex="0"
      aria-label="Dosya seç"
      ondragover={(e) => { e.preventDefault(); isDragging = true; }}
      ondragleave={() => (isDragging = false)}
      ondrop={(e) => { e.preventDefault(); onDrop(e); }}
      onclick={onPick}
      onkeydown={(e) => e.key === "Enter" && onPick()}
    >
      {#if filePath}
        <div class="file-info">
          <span class="file-icon" aria-hidden="true">📁</span>
          <span class="file-name">{fileLabel}</span>
          <span class="change-hint">Değiştirmek için tıkla</span>
        </div>
      {:else}
        <div class="drop-hint">
          <span class="drop-icon" aria-hidden="true">📂</span>
          <span>Dosya seç (tıkla veya sürükle)</span>
          <span class="drop-sub">Video, ses veya görüntü</span>
        </div>
      {/if}
    </div>
    {#if fileError}
      <p class="error-msg" role="alert">{fileError}</p>
    {/if}
  </section>

  {#if filePath && availableProfiles.length > 0}
    <section class="card">
      <h2 class="card-title">Çıktı Formatları</h2>
      <p class="select-hint">Birden fazla format seçebilirsiniz.</p>
      <div class="profile-grid">
        {#each availableProfiles as p (p.id)}
          <button
            type="button"
            class="profile-chip"
            class:selected={selectedIds.has(p.id)}
            onclick={() => toggleProfile(p.id)}
          >
            <span class="chip-label">{p.labelTr}</span>
            <span class="chip-ext">.{p.outputExtension}</span>
          </button>
        {/each}
      </div>
      <p class="select-count">
        {selectedIds.size} format seçili
        {#if selectedIds.size > 0}
          — {[...selectedIds].join(", ")}
        {/if}
      </p>
    </section>
  {/if}

  {#if jobs.length > 0}
    <section class="card">
      <h2 class="card-title">Çıktılar</h2>
      <ul class="job-list">
        {#each jobs as job (job.id)}
          <li class="job-item" data-status={job.status}>
            <span class="job-icon" aria-hidden="true">{statusIcon(job.status)}</span>
            <div class="job-info">
              <span class="job-label">{job.profileLabel}</span>
              {#if job.status === "running" && job.progress != null}
                <div class="job-bar">
                  <div class="job-fill" style="width:{job.progress}%"></div>
                </div>
                <span class="job-pct">%{Math.round(job.progress)}</span>
              {:else if job.status === "running"}
                <span class="job-pct">İşleniyor…</span>
              {:else if job.status === "done"}
                <button
                  type="button"
                  class="open-btn"
                  onclick={() => hasLfc && window.lfc.showInFolder(job.outputPath)}
                >Klasörde göster</button>
              {:else if job.status === "error"}
                <span class="job-error">{job.errorMsg ?? "Hata"}</span>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <section class="card action-card">
    {#if toast}
      <p class="toast" class:toast-error={toast.includes("0/")} role="status">{toast}</p>
    {/if}

    <button
      type="button"
      class="btn btn-primary"
      disabled={!canStart}
      onclick={() => void startAll()}
    >
      {busy ? "Dönüştürülüyor…" : `${selectedIds.size} Format Oluştur`}
    </button>
  </section>
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 1.25rem; max-width: 680px; }
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
  .file-name { font-weight: 600; font-size: 0.92rem; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 20ch; }
  .change-hint { font-size: 0.75rem; color: var(--muted); }
  .drop-hint { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; }
  .drop-icon { font-size: 2rem; margin-bottom: 0.25rem; }
  .drop-sub { font-size: 0.78rem; color: var(--muted); opacity: 0.7; }
  .error-msg { color: var(--danger); font-size: 0.84rem; margin: 0; padding: 0.5rem 0.75rem; background: rgba(239,68,68,0.08); border-radius: 8px; border: 1px solid rgba(239,68,68,0.2); }
  /* Profile grid */
  .select-hint { font-size: 0.82rem; color: var(--muted); margin: 0; }
  .profile-grid { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .profile-chip { display: flex; flex-direction: column; align-items: flex-start; gap: 0.1rem; padding: 0.45rem 0.7rem; border-radius: var(--radius-button); border: 1px solid var(--border); background: var(--surface-elevated); cursor: pointer; transition: border-color 0.12s, background 0.12s; font: inherit; }
  .profile-chip:hover { border-color: var(--accent-start); }
  .profile-chip.selected { border-color: var(--accent-start); background: rgba(56,189,248,0.12); }
  .chip-label { font-size: 0.82rem; color: var(--text); font-weight: 500; }
  .chip-ext { font-size: 0.7rem; color: var(--muted); font-variant-numeric: tabular-nums; }
  .profile-chip.selected .chip-label { color: var(--accent-start); }
  .select-count { font-size: 0.8rem; color: var(--muted); margin: 0; }
  /* Job list */
  .job-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
  .job-item { display: flex; align-items: flex-start; gap: 0.6rem; padding: 0.5rem 0.6rem; border-radius: 8px; background: var(--surface-elevated); border: 1px solid var(--border); }
  .job-item[data-status="done"] { border-color: rgba(34,197,94,0.3); }
  .job-item[data-status="error"] { border-color: rgba(239,68,68,0.3); }
  .job-item[data-status="running"] { border-color: rgba(56,189,248,0.3); }
  .job-icon { font-size: 0.9rem; margin-top: 0.15rem; font-family: monospace; min-width: 1.2rem; text-align: center; }
  .job-item[data-status="done"] .job-icon { color: var(--success); }
  .job-item[data-status="error"] .job-icon { color: var(--danger); }
  .job-item[data-status="running"] .job-icon { color: var(--accent-start); }
  .job-info { flex: 1; display: flex; flex-direction: column; gap: 0.25rem; }
  .job-label { font-size: 0.84rem; font-weight: 500; color: var(--text); }
  .job-bar { height: 4px; background: var(--border); border-radius: 999px; overflow: hidden; }
  .job-fill { height: 100%; background: linear-gradient(90deg, var(--accent-start), var(--accent-end)); border-radius: 999px; transition: width 0.2s; }
  .job-pct { font-size: 0.76rem; color: var(--muted); font-variant-numeric: tabular-nums; }
  .job-error { font-size: 0.76rem; color: var(--danger); }
  .open-btn { font: inherit; font-size: 0.76rem; padding: 0.15rem 0.5rem; border: 1px solid var(--border); border-radius: 4px; background: transparent; color: var(--muted); cursor: pointer; align-self: flex-start; }
  .open-btn:hover { color: var(--text); }
  /* Action */
  .action-card { gap: 0.75rem; }
  .toast { margin: 0; padding: 0.55rem 0.85rem; border-radius: 8px; font-size: 0.87rem; background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.25); color: var(--success); }
  .toast.toast-error { background: rgba(239,68,68,0.08); border-color: rgba(239,68,68,0.2); color: var(--danger); }
  .btn { padding: 0.6rem 1.4rem; border-radius: var(--radius-button); border: 1px solid transparent; font: inherit; font-size: 0.92rem; font-weight: 600; cursor: pointer; transition: opacity 0.12s, background 0.12s; align-self: flex-start; }
  .btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .btn-primary { background: linear-gradient(90deg, var(--accent-start), var(--accent-end)); color: #fff; border-color: transparent; }
  .btn-primary:not(:disabled):hover { opacity: 0.88; }
</style>
