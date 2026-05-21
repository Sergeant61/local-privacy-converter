<script lang="ts">
  import { resolve } from "$app/paths";
  import { browser } from "$app/environment";
  import { onMount } from "svelte";
  import { _ } from "svelte-i18n";
  import NavFeatureIcon from "./NavFeatureIcon.svelte";
  import { historyItems, loadHistory, clearHistory } from "$lib/history/store";

  type Props = {
    mobile: boolean;
    drawerOpen?: boolean;
  };

  let { mobile, drawerOpen = $bindable(false) }: Props = $props();

  let collapsed = $state(false);
  const hasLfc = browser && typeof window !== "undefined" && "lfc" in window && !!window.lfc;

  onMount(() => {
    if (!browser) return;
    const stored = localStorage.getItem("lpc-sidebar-collapsed");
    if (stored === "1") collapsed = true;
    void loadHistory();
  });

  function persistCollapsed(value: boolean) {
    if (browser) localStorage.setItem("lpc-sidebar-collapsed", value ? "1" : "0");
  }

  function togglePanel() {
    if (mobile) {
      drawerOpen = !drawerOpen;
      return;
    }
    collapsed = !collapsed;
    persistCollapsed(collapsed);
  }

  function closeDrawerAfterNav() {
    if (mobile) drawerOpen = false;
  }

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

  type IconId = "convert" | "aspect" | "resolution" | "audioMerge" | "videoMerge" | "frames" | "batch" | "gif" | "apng" | "multiOutput" | "pdf" | "settings" | "trim" | "normalize" | "watermark" | "metadata";
  type FeatureItem = { href: string; labelKey: string; soon: boolean; icon: IconId };
  const features: FeatureItem[] = [
    { href: "/", labelKey: "nav.convert", soon: false, icon: "convert" },
    { href: "/aspect-ratio", labelKey: "nav.aspectRatio", soon: false, icon: "aspect" },
    { href: "/resolution", labelKey: "nav.resolution", soon: false, icon: "resolution" },
    { href: "/audio-merge", labelKey: "nav.audioMerge", soon: false, icon: "audioMerge" },
    { href: "/video-merge", labelKey: "nav.videoMerge", soon: false, icon: "videoMerge" },
    { href: "/frames", labelKey: "nav.frames", soon: false, icon: "frames" },
    { href: "/batch", labelKey: "nav.batch", soon: false, icon: "batch" },
    { href: "/gif", labelKey: "nav.gif", soon: false, icon: "gif" },
    { href: "/apng", labelKey: "nav.apng", soon: false, icon: "apng" },
    { href: "/multi-output", labelKey: "nav.multiOutput", soon: false, icon: "multiOutput" },
    { href: "/pdf", labelKey: "nav.pdf", soon: false, icon: "pdf" },
    { href: "/trim", labelKey: "nav.trim", soon: false, icon: "trim" },
    { href: "/normalize", labelKey: "nav.normalize", soon: false, icon: "normalize" },
    { href: "/watermark", labelKey: "nav.watermark", soon: false, icon: "watermark" },
    { href: "/metadata", labelKey: "nav.metadata", soon: false, icon: "metadata" },
    { href: "/settings", labelKey: "nav.settings", soon: false, icon: "settings" },
  ];
</script>

<aside
  id="app-sidebar"
  class="sidebar"
  class:drawer-open={mobile && drawerOpen}
  data-collapsed={!mobile && collapsed ? "true" : "false"}
  role="navigation"
  aria-label={$_("nav.appMenu")}
>
  <div class="sidebar-top">
    <button
      type="button"
      class="icon-btn"
      aria-label={mobile ? (drawerOpen ? $_("nav.closeMenu") : $_("nav.openMenu")) : collapsed ? $_("nav.expandMenu") : $_("nav.collapseMenu")}
      aria-expanded={mobile ? drawerOpen : !collapsed}
      aria-controls="app-sidebar"
      onclick={togglePanel}
    >
      <span class="burger" aria-hidden="true"></span>
    </button>
    {#if !mobile && !collapsed}
      <span class="brand-compact">LPC</span>
    {/if}
  </div>

  <div class="nav-block">
    <p class="nav-heading">{$_("nav.features")}</p>
    <ul class="nav-list">
      {#each features as item (item.labelKey)}
        <li>
          {#if item.soon}
            <span class="nav-link disabled" title={$_("nav.soon")}>
              <span class="nav-label-group">
                <NavFeatureIcon id={item.icon} />
                <span class="nav-text-full">{$_(item.labelKey)}</span>
              </span>
              <span class="badge">{$_("nav.soon")}</span>
            </span>
          {:else}
            <a href={item.href === "#" ? "#" : resolve(item.href as "/")} class="nav-link" data-sveltekit-preload-data="off" onclick={closeDrawerAfterNav}>
              <span class="nav-label-group">
                <NavFeatureIcon id={item.icon} />
                <span class="nav-text-full">{$_(item.labelKey)}</span>
              </span>
            </a>
          {/if}
        </li>
      {/each}
    </ul>
  </div>

  <div class="history-block">
    <div class="history-heading-row">
      <p class="nav-heading">{$_("nav.history")}</p>
      {#if $historyItems.length > 0}
        <div class="history-btns">
          <button
            type="button"
            class="hist-btn export-btn"
            title={$_("history.exportJson")}
            onclick={exportJson}
          >JSON</button>
          <button
            type="button"
            class="hist-btn export-btn"
            title={$_("history.exportCsv")}
            onclick={exportCsv}
          >CSV</button>
          <button
            type="button"
            class="hist-btn clear-btn"
            title={$_("history.clear")}
            onclick={() => void clearHistory()}
          >{$_("history.delete")}</button>
        </div>
      {/if}
    </div>
    <ul class="history-list">
      {#if $historyItems.length === 0}
        <li class="history-empty">{$_("history.empty")}</li>
      {:else}
        {#each $historyItems as row (row.id)}
          <li class="history-item">
            <span class="history-label" title="{row.inputFilename} → {row.outputExt}">
              {row.inputFilename} → {row.outputExt}
            </span>
            <span class="history-meta">
              <span class="status" data-status={row.status === "success" ? "done" : "error"}>
                {row.status === "success" ? $_("history.ok") : $_("history.error")}
              </span>
              <span class="time">{formatTime(row.timestamp)}</span>
            </span>
            {#if row.status === "success" && hasLfc}
              <button
                type="button"
                class="history-folder-btn"
                onclick={() => void window.lfc.showInFolder(row.outputPath)}
              >{$_("history.showInFolder")}</button>
            {/if}
            {#if row.status === "error" && row.errorMessage}
              <span class="history-error-msg" title={row.errorMessage}>
                {row.errorMessage.slice(0, 60)}{row.errorMessage.length > 60 ? "…" : ""}
              </span>
            {/if}
          </li>
        {/each}
      {/if}
    </ul>
  </div>
</aside>

<style>
  .sidebar {
    width: var(--sidebar-expanded);
    min-height: 100vh;
    height: 100%;
    border-right: 1px solid var(--border);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent 40%);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    transition:
      width 0.2s ease,
      transform 0.22s ease;
  }

  .sidebar[data-collapsed="true"] {
    width: var(--sidebar-collapsed);
  }

  .sidebar-top {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.85rem 0.75rem;
    border-bottom: 1px solid var(--border);
    min-height: 3.25rem;
  }

  .brand-compact {
    font-weight: 800;
    font-size: 0.78rem;
    letter-spacing: 0.06em;
    color: var(--muted);
  }

  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: var(--radius-button);
    border: 1px solid var(--border);
    background: var(--surface-elevated);
    color: var(--text);
    cursor: pointer;
    flex-shrink: 0;
  }

  .icon-btn:hover {
    background: var(--surface-hover);
  }

  .burger {
    display: block;
    width: 1.1rem;
    height: 2px;
    background: var(--text);
    position: relative;
    border-radius: 2px;
  }

  .burger::before,
  .burger::after {
    content: "";
    position: absolute;
    left: 0;
    width: 100%;
    height: 2px;
    background: var(--text);
    border-radius: 2px;
  }

  .burger::before {
    top: -6px;
  }

  .burger::after {
    top: 6px;
  }

  .sidebar[data-collapsed="true"] .nav-heading,
  .sidebar[data-collapsed="true"] .nav-text-full,
  .sidebar[data-collapsed="true"] .badge,
  .sidebar[data-collapsed="true"] .history-block {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .sidebar[data-collapsed="true"] .nav-list {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.25rem;
  }

  .sidebar[data-collapsed="true"] .nav-list li {
    width: 100%;
    display: flex;
    justify-content: center;
  }

  .sidebar[data-collapsed="true"] .nav-label-group {
    flex: 0;
    width: 100%;
    justify-content: center;
    gap: 0;
  }

  .sidebar[data-collapsed="true"] .nav-link {
    justify-content: center;
    padding: 0.55rem;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: var(--radius-button);
  }

  .nav-block {
    padding: 0.75rem;
    flex: 1;
    overflow: auto;
    min-height: 0;
  }

  .nav-heading {
    margin: 0 0 0.5rem;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
  }

  .nav-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .nav-text-full {
    flex: 1;
    min-width: 0;
  }

  .nav-label-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    min-width: 0;
  }

  .nav-link {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.55rem 0.65rem;
    border-radius: var(--radius-button);
    text-decoration: none;
    color: var(--text);
    border: 1px solid transparent;
    font-size: 0.92rem;
  }

  .nav-link:not(.disabled):hover {
    background: var(--surface-hover);
    border-color: var(--border);
  }

  .nav-link.disabled {
    color: var(--muted);
    cursor: not-allowed;
    opacity: 0.85;
  }

  .badge {
    font-size: 0.68rem;
    padding: 0.15rem 0.45rem;
    border-radius: var(--radius-pill);
    background: var(--surface-elevated);
    border: 1px solid var(--border);
    color: var(--muted);
  }

  .history-block {
    border-top: 1px solid var(--border);
    padding: 0.75rem;
    max-height: 38vh;
    min-height: 8rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    background: rgba(0, 0, 0, 0.12);
  }

  .history-heading-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .history-heading-row .nav-heading {
    margin: 0;
  }

  .history-btns {
    display: flex;
    align-items: center;
    gap: 0.2rem;
  }

  .hist-btn {
    font: inherit;
    font-size: 0.68rem;
    color: var(--muted);
    background: none;
    border: 1px solid transparent;
    cursor: pointer;
    padding: 0.1rem 0.35rem;
    border-radius: 4px;
  }

  .export-btn:hover {
    color: var(--accent-start);
    border-color: var(--accent-start);
    background: rgba(56, 189, 248, 0.08);
  }

  .clear-btn:hover {
    color: var(--danger);
    background: rgba(239, 68, 68, 0.08);
  }

  .history-list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .history-empty {
    font-size: 0.82rem;
    color: var(--muted);
    padding: 0.5rem 0.25rem;
    font-style: italic;
  }

  .history-item {
    padding: 0.55rem 0.5rem;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--surface);
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .history-label {
    font-size: 0.86rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .history-meta {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: var(--muted);
  }

  .status[data-status="done"] {
    color: var(--success);
  }

  .status[data-status="error"] {
    color: var(--danger);
  }

  .time {
    white-space: nowrap;
  }

  .history-folder-btn {
    font: inherit;
    font-size: 0.72rem;
    color: var(--muted);
    background: none;
    border: 1px solid var(--border);
    border-radius: 5px;
    cursor: pointer;
    padding: 0.15rem 0.4rem;
    align-self: flex-start;
  }

  .history-folder-btn:hover {
    color: var(--text);
    border-color: var(--accent-start);
  }

  .history-error-msg {
    font-size: 0.72rem;
    color: var(--danger);
    opacity: 0.8;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 720px) {
    .sidebar {
      position: fixed;
      left: 0;
      top: 0;
      z-index: 70;
      width: min(300px, 88vw);
      transform: translateX(-100%);
      box-shadow: 12px 0 40px rgba(0, 0, 0, 0.35);
    }

    .sidebar.drawer-open {
      transform: translateX(0);
    }

    .sidebar[data-collapsed="true"] {
      width: min(300px, 88vw);
    }

    .sidebar[data-collapsed="true"] .nav-heading,
    .sidebar[data-collapsed="true"] .nav-text-full,
    .sidebar[data-collapsed="true"] .badge,
    .sidebar[data-collapsed="true"] .history-block {
      position: static;
      width: auto;
      height: auto;
      overflow: visible;
      clip: auto;
      white-space: normal;
    }

    .sidebar[data-collapsed="true"] .nav-list {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      padding: 0;
    }

    .sidebar[data-collapsed="true"] .nav-link {
      width: auto;
      height: auto;
      justify-content: space-between;
    }
  }
</style>
