<script lang="ts">
  import { resolve } from "$app/paths";
  import { browser } from "$app/environment";
  import { onMount } from "svelte";
  import NavFeatureIcon from "./NavFeatureIcon.svelte";

  type HistoryItem = {
    id: string;
    label: string;
    status: "done" | "error" | "queued";
    at: string;
  };

  type Props = {
    mobile: boolean;
    drawerOpen?: boolean;
  };

  let { mobile, drawerOpen = $bindable(false) }: Props = $props();

  let collapsed = $state(false);

  onMount(() => {
    if (!browser) {
      return;
    }
    const stored = localStorage.getItem("lpc-sidebar-collapsed");
    if (stored === "1") {
      collapsed = true;
    }
  });

  function persistCollapsed(value: boolean) {
    if (browser) {
      localStorage.setItem("lpc-sidebar-collapsed", value ? "1" : "0");
    }
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
    if (mobile) {
      drawerOpen = false;
    }
  }

  const features = [
    { href: "/", label: "Dönüştür / sıkıştır", soon: false, icon: "convert" },
    { href: "#", label: "En-boy oranı", soon: true, icon: "aspect" },
    { href: "#", label: "Çözünürlük", soon: true, icon: "resolution" },
    { href: "#", label: "Ses birleştirme", soon: true, icon: "audioMerge" },
    { href: "#", label: "Video birleştirme", soon: true, icon: "videoMerge" },
    { href: "#", label: "Kare çıkarma", soon: true, icon: "frames" }
  ] as const;

  const defaultHistory: HistoryItem[] = [
    {
      id: "demo-1",
      label: "tatil.mp4 → webm",
      status: "done",
      at: "09.05.2026 14:22"
    },
    {
      id: "demo-2",
      label: "kayit.wav → mp3",
      status: "error",
      at: "08.05.2026 10:01"
    }
  ];

  const rows = $derived(defaultHistory);
</script>

<aside
  id="app-sidebar"
  class="sidebar"
  class:drawer-open={mobile && drawerOpen}
  data-collapsed={!mobile && collapsed ? "true" : "false"}
  role="navigation"
  aria-label="Uygulama menüsü"
>
  <div class="sidebar-top">
    <button
      type="button"
      class="icon-btn"
      aria-label={mobile ? (drawerOpen ? "Menüyü kapat" : "Menüyü aç") : collapsed ? "Menüyü genişlet" : "Menüyü daralt"}
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
    <p class="nav-heading">Özellikler</p>
    <ul class="nav-list">
      {#each features as item (item.label)}
        <li>
          {#if item.soon}
            <span class="nav-link disabled" title="Yakında">
              <span class="nav-label-group">
                <NavFeatureIcon id={item.icon} />
                <span class="nav-text-full">{item.label}</span>
              </span>
              <span class="badge">Yakında</span>
            </span>
          {:else}
            <a href={resolve("/")} class="nav-link" data-sveltekit-preload-data="off" onclick={closeDrawerAfterNav}>
              <span class="nav-label-group">
                <NavFeatureIcon id={item.icon} />
                <span class="nav-text-full">{item.label}</span>
              </span>
            </a>
          {/if}
        </li>
      {/each}
    </ul>
  </div>

  <div class="history-block">
    <p class="nav-heading">Geçmiş</p>
    <ul class="history-list">
      {#each rows as row (row.id)}
        <li class="history-item">
          <span class="history-label">{row.label}</span>
          <span class="history-meta">
            <span class="status" data-status={row.status}>
              {row.status === "done" ? "Tamam" : row.status === "error" ? "Hata" : "Sırada"}
            </span>
            <span class="time">{row.at}</span>
          </span>
        </li>
      {/each}
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

  .history-list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
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
