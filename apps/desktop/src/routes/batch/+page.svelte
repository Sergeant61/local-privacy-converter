<script lang="ts">
  import { browser } from "$app/environment";
  import { _ } from "svelte-i18n";
  import { get } from "svelte/store";
  import type { ConvertJobSpec } from "@lfc/types";
  import {
    isKnownInputExtension,
    normalizeExtension,
    buildProfileJobSpec,
    getTargetById,
    type TargetProfileId
  } from "@lfc/media-formats";
  import { recordConversion } from "$lib/history/store";

  const hasLfc = browser && typeof window !== "undefined" && "lfc" in window && !!window.lfc;

  type FileStatus = "pending" | "converting" | "done" | "error" | "skipped";

  interface BatchFile {
    id: number;
    path: string;
    label: string;
    status: FileStatus;
    progress: number | null;
    outputPath: string | null;
    errorMessage: string | null;
  }

  let nextId = 0;
  let files = $state<BatchFile[]>([]);
  let isDragging = $state(false);
  let fileError = $state<string | null>(null);

  let targetProfileId = $state<TargetProfileId>("mp4-h264-aac");
  let qualityPreset = $state<"high" | "compatible" | "balanced" | "small" | "very_small">("balanced");

  let busy = $state(false);
  let cancelled = $state(false);

  const OUTPUT_FORMATS: { id: TargetProfileId; label: string; group: string }[] = [
    { id: "mp4-h264-aac",   label: "MP4 (H.264 + AAC)",   group: "common.groupVideo" },
    { id: "webm-vp9-opus",  label: "WebM (VP9 + Opus)",    group: "common.groupVideo" },
    { id: "mkv-h264-aac",   label: "MKV (H.264 + AAC)",   group: "common.groupVideo" },
    { id: "remux-copy",     label: "Remux (stream copy)",  group: "common.groupVideo" },
    { id: "audio-mp3",      label: "MP3",                  group: "common.groupAudio" },
    { id: "audio-wav",      label: "WAV",                  group: "common.groupAudio" },
    { id: "audio-m4a-aac",  label: "M4A (AAC)",            group: "common.groupAudio" },
    { id: "audio-flac",     label: "FLAC",                 group: "common.groupAudio" },
    { id: "audio-opus",     label: "Opus",                 group: "common.groupAudio" },
    { id: "image-png",      label: "PNG",                  group: "common.groupImage" },
    { id: "image-jpeg",     label: "JPEG",                 group: "common.groupImage" },
    { id: "image-webp",     label: "WebP",                 group: "common.groupImage" },
  ];

  const QUALITY_OPTIONS = [
    { value: "high" as const,       key: "quality.highShort" },
    { value: "compatible" as const, key: "quality.compatibleShort" },
    { value: "balanced" as const,   key: "quality.balancedShort" },
    { value: "small" as const,      key: "quality.smallShort" },
    { value: "very_small" as const, key: "quality.verySmallShort" },
  ];

  function extOf(name: string): string {
    return (name.split(".").pop() ?? "").toLowerCase();
  }

  function addFile(path: string, label: string) {
    fileError = null;
    const ext = normalizeExtension(label);
    if (!isKnownInputExtension(ext)) {
      fileError = get(_)("batch.unsupported", { values: { name: label } });
      return;
    }
    if (files.find((f) => f.path === path)) return;
    files = [...files, {
      id: nextId++,
      path,
      label,
      status: "pending",
      progress: null,
      outputPath: null,
      errorMessage: null,
    }];
  }

  function removeFile(id: number) {
    files = files.filter((f) => f.id !== id);
  }

  function clearDone() {
    files = files.filter((f) => f.status === "pending" || f.status === "converting");
  }

  let dragFromId = $state<number | null>(null);
  let dragOverId = $state<number | null>(null);

  function onItemDragStart(e: DragEvent, id: number) {
    dragFromId = id;
    e.dataTransfer!.effectAllowed = "move";
  }

  function onItemDragOver(e: DragEvent, id: number) {
    e.preventDefault();
    e.dataTransfer!.dropEffect = "move";
    dragOverId = id;
  }

  function onItemDrop(_e: DragEvent, toId: number) {
    if (dragFromId === null || dragFromId === toId) {
      dragFromId = null;
      dragOverId = null;
      return;
    }
    const fromIdx = files.findIndex((f) => f.id === dragFromId);
    const toIdx = files.findIndex((f) => f.id === toId);
    if (fromIdx < 0 || toIdx < 0) { dragFromId = null; dragOverId = null; return; }
    const next = [...files];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved!);
    files = next;
    dragFromId = null;
    dragOverId = null;
  }

  function onItemDragEnd() {
    dragFromId = null;
    dragOverId = null;
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
        fileError = get(_)("common.pathFailed");
      }
    }
  }

  // Ortak kurallayıcı: sosyal presetlerin zorunlu çözünürlüğü ve boyut limiti
  // burada da geçerli. Eskiden bu ekran ikisini de yok sayıyordu, aynı preset
  // seçildiği ekrana göre farklı çıktı veriyordu (DENETIM.md D-10).
  function buildSpec(f: BatchFile, outPath: string): ConvertJobSpec {
    return buildProfileJobSpec(targetProfileId, {
      inputPath: f.path,
      outputPath: outPath,
      qualityPreset
    });
  }

  async function startBatch() {
    if (!hasLfc || files.length === 0 || busy) return;

    const dirResult = await window.lfc.getOutputDir();
    if (dirResult.ok === false) {
      fileError = get(_)("common.outputDirFailed", { values: { message: dirResult.message } });
      return;
    }

    const profile = getTargetById(targetProfileId);
    const ext = profile?.outputExtension ?? "mp4";
    const sep = dirResult.dir.includes("\\") ? "\\" : "/";

    busy = true;
    cancelled = false;

    const pendingFiles = files.filter((f) => f.status === "pending");
    for (let i = 0; i < pendingFiles.length; i++) {
      if (cancelled) break;
      const f = pendingFiles[i]!;
      const dot = f.label.lastIndexOf(".");
      const base = dot >= 0 ? f.label.slice(0, dot) : f.label;
      const outPath = `${dirResult.dir}${sep}${base}-donusum.${ext}`;
      const inputExt = extOf(f.label);

      files = files.map((x) =>
        x.id === f.id ? { ...x, status: "converting", progress: null, errorMessage: null } : x
      );

      const spec = buildSpec(f, outPath);
      const r = await window.lfc.runConvertJob(
        { spec },
        (percent) => {
          files = files.map((x) =>
            x.id === f.id ? { ...x, progress: percent } : x
          );
        }
      );

      if (r.ok) {
        files = files.map((x) =>
          x.id === f.id ? { ...x, status: "done", outputPath: outPath, progress: 100 } : x
        );
        void recordConversion({
          timestamp: Date.now(),
          inputFilename: f.label,
          inputExt,
          outputFilename: `${base}-donusum.${ext}`,
          outputExt: ext,
          outputPath: outPath,
          targetProfileId,
          status: "success"
        });
      } else {
        const fallback = get(_)("common.error");
        const msg = r.ok === false ? (r.message ?? fallback) : fallback;
        files = files.map((x) =>
          x.id === f.id ? { ...x, status: cancelled ? "skipped" : "error", errorMessage: msg } : x
        );
        if (!cancelled) {
          void recordConversion({
            timestamp: Date.now(),
            inputFilename: f.label,
            inputExt,
            outputFilename: `${base}-donusum.${ext}`,
            outputExt: ext,
            outputPath: outPath,
            targetProfileId,
            status: "error",
            errorMessage: msg
          });
        }
      }
    }

    busy = false;
  }

  async function cancelBatch() {
    cancelled = true;
    if (hasLfc) await window.lfc.cancelConvert();
  }

  const pendingCount = $derived(files.filter((f) => f.status === "pending").length);
  const doneCount = $derived(files.filter((f) => f.status === "done").length);
  const errorCount = $derived(files.filter((f) => f.status === "error").length);
  const canStart = $derived(pendingCount > 0 && !busy && hasLfc);

  const groupedFormats = $derived(
    OUTPUT_FORMATS.reduce<{ group: string; items: typeof OUTPUT_FORMATS }[]>((acc, f) => {
      const last = acc[acc.length - 1];
      if (last && last.group === f.group) {
        last.items.push(f);
      } else {
        acc.push({ group: f.group, items: [f] });
      }
      return acc;
    }, [])
  );
</script>

<div class="page">
  <header class="page-header">
    <h1 class="page-title">{$_("batch.title")}</h1>
    <p class="page-sub">{$_("batch.pageSubtitle")}</p>
  </header>

  <section class="card">
    <h2 class="card-title">{$_("batch.filesTitle", { values: { count: files.length } })}</h2>

    <div
      class="drop-zone"
      class:drag={isDragging}
      role="button"
      tabindex="0"
      aria-label={$_("batch.addFiles")}
      ondragover={(e) => { e.preventDefault(); isDragging = true; }}
      ondragleave={() => (isDragging = false)}
      ondrop={(e) => { e.preventDefault(); onDrop(e); }}
      onclick={onPick}
      onkeydown={(e) => e.key === "Enter" && onPick()}
    >
      <span class="drop-icon" aria-hidden="true">📂</span>
      <span>{$_("batch.addHint")}</span>
      <span class="drop-sub">{$_("batch.addSub")}</span>
    </div>

    {#if fileError}
      <p class="error-msg" role="alert">{fileError}</p>
    {/if}

    {#if files.length > 0}
      <ul class="file-list">
        {#each files as f (f.id)}
          <li
            class="file-item"
            class:drag-over={dragOverId === f.id && dragFromId !== f.id}
            data-status={f.status}
            draggable={f.status === "pending" && !busy}
            ondragstart={(e) => onItemDragStart(e, f.id)}
            ondragover={(e) => onItemDragOver(e, f.id)}
            ondrop={(e) => onItemDrop(e, f.id)}
            ondragend={onItemDragEnd}
          >
            <div class="file-row">
              <span class="drag-handle" aria-hidden="true" title={$_("batch.dragHandle")}>⠿</span>
              <span class="file-idx-icon" aria-hidden="true">
                {#if f.status === "pending"}⏳{:else if f.status === "converting"}⚙️{:else if f.status === "done"}✅{:else if f.status === "error"}❌{:else}⏭️{/if}
              </span>
              <span class="file-name" title={f.label}>{f.label}</span>
              <div class="file-actions">
                {#if f.status === "done" && hasLfc && f.outputPath}
                  <button
                    type="button"
                    class="file-action-btn"
                    onclick={() => window.lfc.showInFolder(f.outputPath!)}
                    title={$_("batch.showInFolder")}
                  >{$_("batch.showBtn")}</button>
                {/if}
                {#if f.status === "pending"}
                  <button
                    type="button"
                    class="file-remove-btn"
                    onclick={() => removeFile(f.id)}
                    aria-label={$_("common.remove")}
                    disabled={busy}
                  >✕</button>
                {/if}
              </div>
            </div>
            {#if f.status === "converting"}
              <div class="file-progress">
                <div class="progress-bar">
                  <div
                    class="progress-fill"
                    style="width:{f.progress ?? 0}%"
                    class:indeterminate={f.progress == null}
                  ></div>
                </div>
                <span class="progress-label">{f.progress != null ? `%${Math.round(f.progress)}` : $_("common.processing")}</span>
              </div>
            {/if}
            {#if f.status === "error" && f.errorMessage}
              <p class="file-error">{f.errorMessage.slice(0, 80)}{f.errorMessage.length > 80 ? "…" : ""}</p>
            {/if}
          </li>
        {/each}
      </ul>

      {#if doneCount > 0 || errorCount > 0}
        <button type="button" class="clear-btn" onclick={clearDone} disabled={busy}>
          {$_("batch.clearDone")}
        </button>
      {/if}
    {/if}
  </section>

  <section class="card">
    <h2 class="card-title">{$_("batch.outputSettings")}</h2>

    <div class="setting-row">
      <label for="format" class="field-label">{$_("batch.targetFormat")}</label>
      <select id="format" class="select" bind:value={targetProfileId} disabled={busy}>
        {#each groupedFormats as grp (grp.group)}
          <optgroup label={$_(grp.group)}>
            {#each grp.items as opt (opt.id)}
              <option value={opt.id}>{opt.label}</option>
            {/each}
          </optgroup>
        {/each}
      </select>
    </div>

    <div class="setting-row">
      <label for="quality" class="field-label">{$_("batch.quality")}</label>
      <select id="quality" class="select" bind:value={qualityPreset} disabled={busy}>
        {#each QUALITY_OPTIONS as opt (opt.value)}
          <option value={opt.value}>{$_(opt.key)}</option>
        {/each}
      </select>
    </div>
  </section>

  <section class="card action-card">
    {#if busy}
      <p class="status-msg">
        {$_("batch.running", { values: { done: doneCount, error: errorCount, pending: pendingCount } })}
      </p>
    {:else if !busy && files.length > 0 && pendingCount === 0}
      <p class="status-msg status-done">
        {$_("batch.allDone", { values: { done: doneCount, errorSuffix: errorCount > 0 ? $_("batch.errorSuffix", { values: { error: errorCount } }) : "" } })}
      </p>
    {/if}

    {#if busy}
      <button type="button" class="btn btn-danger" onclick={cancelBatch}>{$_("common.cancel")}</button>
    {:else}
      <button type="button" class="btn btn-primary" disabled={!canStart} onclick={startBatch}>
        {pendingCount > 0 ? $_("batch.convertN", { values: { count: pendingCount } }) : $_("batch.addFiles")}
      </button>
    {/if}
  </section>
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 1.25rem; max-width: 720px; }
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
  .file-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
  .file-item { padding: 0.6rem 0.75rem; border-radius: 8px; border: 1px solid var(--border); background: var(--surface-elevated); display: flex; flex-direction: column; gap: 0.35rem; transition: border-color 0.12s, background 0.12s; }
  .file-item[draggable="true"] { cursor: grab; }
  .file-item[draggable="true"]:active { cursor: grabbing; }
  .file-item.drag-over { border-color: var(--accent-start); background: rgba(56,189,248,0.08); }
  .drag-handle { color: var(--muted); font-size: 1rem; cursor: grab; flex-shrink: 0; opacity: 0.5; }
  .file-item[draggable="true"]:hover .drag-handle { opacity: 1; }
  .file-item[data-status="done"] { border-color: rgba(34,197,94,0.3); }
  .file-item[data-status="error"] { border-color: rgba(239,68,68,0.3); }
  .file-item[data-status="converting"] { border-color: rgba(56,189,248,0.4); }
  .file-row { display: flex; align-items: center; gap: 0.6rem; }
  .file-idx-icon { font-size: 0.9rem; flex-shrink: 0; }
  .file-name { flex: 1; font-size: 0.88rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .file-actions { display: flex; gap: 0.35rem; flex-shrink: 0; }
  .file-action-btn { font: inherit; font-size: 0.72rem; color: var(--muted); background: none; border: 1px solid var(--border); border-radius: 5px; cursor: pointer; padding: 0.15rem 0.4rem; }
  .file-action-btn:hover { color: var(--text); border-color: var(--accent-start); }
  .file-remove-btn { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 0.78rem; padding: 0.1rem 0.3rem; border-radius: 4px; }
  .file-remove-btn:hover { color: var(--danger); background: rgba(239,68,68,0.1); }
  .file-remove-btn:disabled { opacity: 0.3; cursor: not-allowed; }
  .file-progress { display: flex; align-items: center; gap: 0.6rem; padding: 0 0.15rem; }
  .progress-bar { flex: 1; height: 5px; background: var(--surface); border-radius: 999px; overflow: hidden; }
  .progress-fill { height: 100%; background: linear-gradient(90deg, var(--accent-start), var(--accent-end)); border-radius: 999px; transition: width 0.25s ease; }
  .progress-fill.indeterminate { width: 40% !important; animation: slide 1.2s ease-in-out infinite; }
  @keyframes slide { 0% { transform: translateX(-120%); } 100% { transform: translateX(350%); } }
  .progress-label { font-size: 0.78rem; color: var(--muted); white-space: nowrap; min-width: 4.5ch; font-variant-numeric: tabular-nums; }
  .file-error { margin: 0; font-size: 0.78rem; color: var(--danger); padding: 0 0.15rem; }
  .clear-btn { font: inherit; font-size: 0.78rem; color: var(--muted); background: none; border: 1px solid var(--border); border-radius: var(--radius-button); cursor: pointer; padding: 0.35rem 0.75rem; align-self: flex-start; }
  .clear-btn:hover { color: var(--text); border-color: var(--accent-start); }
  .setting-row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
  .field-label { font-size: 0.84rem; color: var(--muted); white-space: nowrap; min-width: 9rem; }
  .select { background: var(--surface-elevated); border: 1px solid var(--border); border-radius: var(--radius-button); color: var(--text); font: inherit; font-size: 0.9rem; padding: 0.45rem 0.75rem; cursor: pointer; }
  .select:focus { outline: none; border-color: var(--accent-start); }
  .select:disabled { opacity: 0.5; cursor: not-allowed; }
  .action-card { gap: 0.75rem; }
  .status-msg { margin: 0; font-size: 0.87rem; color: var(--muted); }
  .status-done { color: var(--success); }
  .btn { padding: 0.6rem 1.4rem; border-radius: var(--radius-button); border: 1px solid transparent; font: inherit; font-size: 0.92rem; font-weight: 600; cursor: pointer; transition: opacity 0.12s, background 0.12s; align-self: flex-start; }
  .btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .btn-primary { background: linear-gradient(90deg, var(--accent-start), var(--accent-end)); color: #fff; border-color: transparent; }
  .btn-primary:not(:disabled):hover { opacity: 0.88; }
  .btn-danger { background: rgba(239,68,68,0.12); color: var(--danger); border-color: rgba(239,68,68,0.3); }
  .btn-danger:hover { background: rgba(239,68,68,0.2); }
</style>
