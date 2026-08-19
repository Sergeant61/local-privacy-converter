<script lang="ts">
  import { browser } from "$app/environment";
  import { onMount } from "svelte";
  import { _ } from "svelte-i18n";
  import { historyItems, loadHistory, clearHistory } from "$lib/history/store";

  const hasLfc = browser && typeof window !== "undefined" && "lfc" in window && !!window.lfc;

  onMount(() => {
    void loadHistory();
  });

  function formatTime(ts: number): string {
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function downloadBlob(content: string, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportJson() {
    const data = $historyItems.map((r) => ({
      id: r.id,
      timestamp: new Date(r.timestamp).toISOString(),
      inputFilename: r.inputFilename,
      outputFilename: r.outputFilename,
      outputPath: r.outputPath,
      targetProfileId: r.targetProfileId,
      status: r.status,
      errorMessage: r.errorMessage ?? null
    }));
    downloadBlob(JSON.stringify(data, null, 2), "lpc-gecmis.json", "application/json");
  }

  function exportCsv() {
    const header = "id,timestamp,inputFilename,outputFilename,outputPath,targetProfileId,status,errorMessage";
    const esc = (v: string | undefined | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = $historyItems.map((r) =>
      [r.id ?? "", new Date(r.timestamp).toISOString(), r.inputFilename, r.outputFilename, r.outputPath, r.targetProfileId, r.status, r.errorMessage ?? ""]
        .map((v) => esc(String(v))).join(",")
    );
    downloadBlob([header, ...rows].join("\r\n"), "lpc-gecmis.csv", "text/csv;charset=utf-8");
  }
</script>

<section class="page">
  <header class="page-header">
    <h1 class="page-title">{$_("history.title")}</h1>
    <p class="page-sub">{$_("history.subtitle")}</p>
  </header>

  <div class="toolbar-row">
    <span class="count">{$_("history.count", { values: { count: $historyItems.length } })}</span>
    {#if $historyItems.length > 0}
      <div class="actions">
        <button type="button" class="hist-btn" title={$_("history.exportJson")} onclick={exportJson}>JSON</button>
        <button type="button" class="hist-btn" title={$_("history.exportCsv")} onclick={exportCsv}>CSV</button>
        <button type="button" class="hist-btn danger" onclick={() => void clearHistory()}>{$_("history.clear")}</button>
      </div>
    {/if}
  </div>

  {#if $historyItems.length === 0}
    <div class="card empty">
      <p class="empty-title">{$_("history.empty")}</p>
      <p class="empty-hint">{$_("history.emptyHint")}</p>
    </div>
  {:else}
    <!-- Geniş ekranda tablo, dar ekranda kart: aynı işaretleme, `td`'ler
         `data-label` ile kendi başlıklarını taşıyor (bkz. alttaki medya
         sorgusu). Böylece iki ayrı görünüm bakımı gerekmiyor. -->
    <div class="table-wrap card">
      <table>
        <thead>
          <tr>
            <th>{$_("history.colInput")}</th>
            <th>{$_("history.colOutput")}</th>
            <th>{$_("history.colTarget")}</th>
            <th>{$_("history.colStatus")}</th>
            <th>{$_("history.colDate")}</th>
            <th class="col-action"><span class="sr-only">{$_("history.colActions")}</span></th>
          </tr>
        </thead>
        <tbody>
          {#each $historyItems as row (row.id)}
            <tr class:is-error={row.status === "error"}>
              <td data-label={$_("history.colInput")}>
                <span class="cell-strong" title={row.inputFilename}>{row.inputFilename}</span>
              </td>
              <td data-label={$_("history.colOutput")}>
                <span title={row.outputPath}>{row.outputFilename}</span>
                {#if row.status === "error" && row.errorMessage}
                  <span class="err-msg" title={row.errorMessage}>{row.errorMessage}</span>
                {/if}
              </td>
              <td data-label={$_("history.colTarget")}>
                <span class="profile">{row.targetProfileId}</span>
              </td>
              <td data-label={$_("history.colStatus")}>
                <span class="status" data-status={row.status === "success" ? "done" : "error"}>
                  {row.status === "success" ? $_("history.ok") : $_("history.error")}
                </span>
              </td>
              <td data-label={$_("history.colDate")}>
                <span class="time">{formatTime(row.timestamp)}</span>
              </td>
              <td class="col-action">
                {#if row.status === "success" && hasLfc}
                  <button
                    type="button"
                    class="hist-btn"
                    onclick={() => void window.lfc.showInFolder(row.outputPath)}
                  >{$_("history.showInFolder")}</button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<style>
  .page { display: flex; flex-direction: column; gap: 1rem; max-width: 1100px; }
  .page-header { margin-bottom: 0.25rem; }
  .page-title { font-size: 1.45rem; font-weight: 700; margin: 0 0 0.3rem; color: var(--text); }
  .page-sub { font-size: 0.88rem; color: var(--muted); margin: 0; }

  .toolbar-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .count { font-size: 0.8rem; color: var(--muted); }
  .actions { display: flex; gap: 0.3rem; }

  .hist-btn {
    font: inherit;
    font-size: 0.76rem;
    color: var(--muted);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-button);
    padding: 0.2rem 0.55rem;
  }

  .hist-btn:hover { color: var(--text); background: var(--surface-hover); }
  .hist-btn.danger:hover { color: var(--danger); border-color: var(--danger); }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
  }

  .empty { padding: 2rem 1.5rem; text-align: center; }
  .empty-title { margin: 0 0 0.3rem; font-size: 0.95rem; font-weight: 600; }
  .empty-hint { margin: 0; font-size: 0.82rem; color: var(--muted); }

  .table-wrap { overflow: auto; padding: 0; }

  table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }

  th {
    text-align: left;
    font-weight: 600;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
    padding: 0.55rem 0.75rem;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }

  td {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
    max-width: 22ch;
  }

  tbody tr:last-child td { border-bottom: 0; }
  tbody tr:hover { background: var(--surface-hover); }

  td span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cell-strong { font-weight: 600; }
  .profile { color: var(--muted); font-variant-numeric: tabular-nums; }
  .time { color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .err-msg { font-size: 0.72rem; color: var(--danger); opacity: 0.85; }

  .status[data-status="done"] { color: var(--success); }
  .status[data-status="error"] { color: var(--danger); }

  .col-action { text-align: right; white-space: nowrap; }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }

  /* Dar ekran: her satır bir kart. Başlık satırı gizleniyor, hücreler
     `data-label` ile kendi etiketini gösteriyor. */
  @media (max-width: 820px) {
    thead { display: none; }
    table, tbody, tr, td { display: block; width: 100%; }

    .table-wrap {
      border: 0;
      background: none;
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
    }

    tr {
      border: 1px solid var(--border);
      border-radius: var(--radius-card);
      background: var(--surface);
      padding: 0.35rem 0;
    }

    td {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 1rem;
      max-width: none;
      border-bottom: 0;
      padding: 0.28rem 0.85rem;
    }

    td[data-label]::before {
      content: attr(data-label);
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--muted);
      flex-shrink: 0;
    }

    td span { text-align: right; }
    .col-action { justify-content: flex-end; }
  }
</style>
