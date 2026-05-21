<script lang="ts">
  import { onMount } from "svelte";
  import Sidebar from "./Sidebar.svelte";

  const { children } = $props<{ children: () => unknown }>();

  let mobile = $state(false);
  let drawerOpen = $state(false);
  let isDark = $state(true);

  function applyTheme(dark: boolean) {
    if (dark) {
      document.documentElement.classList.remove("light");
    } else {
      document.documentElement.classList.add("light");
    }
    isDark = dark;
    localStorage.setItem("lpc-theme", dark ? "dark" : "light");
  }

  function toggleTheme() {
    applyTheme(!isDark);
  }

  onMount(() => {
    const stored = localStorage.getItem("lpc-theme");
    if (stored) {
      applyTheme(stored === "dark");
    } else {
      applyTheme(!window.matchMedia("(prefers-color-scheme: light)").matches);
    }
    const mq = window.matchMedia("(max-width: 720px)");
    const sync = () => {
      const matches = mq.matches;
      mobile = matches;
      if (!matches) {
        drawerOpen = false;
      }
    };
    sync();
    mq.addEventListener("change", sync);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (drawerOpen) {
          drawerOpen = false;
        } else if ("lfc" in window && window.lfc) {
          void window.lfc.cancelConvert();
        }
        return;
      }
      const ctrl = event.ctrlKey || event.metaKey;
      if (ctrl && event.key === "o") {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("lfc:open-file"));
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      mq.removeEventListener("change", sync);
      window.removeEventListener("keydown", onKey);
    };
  });

  function openDrawer() {
    drawerOpen = true;
  }
</script>

<div class="app-shell" class:mobile>
  {#if mobile}
    <button
      type="button"
      class="backdrop"
      class:is-open={drawerOpen}
      aria-label="Menüyü kapat"
      aria-hidden={!drawerOpen}
      tabindex={drawerOpen ? 0 : -1}
      onclick={() => (drawerOpen = false)}
    ></button>
  {/if}

  <Sidebar bind:drawerOpen {mobile} />

  {#if mobile && !drawerOpen}
    <button
      type="button"
      class="fab-menu"
      onclick={openDrawer}
      aria-controls="app-sidebar"
      aria-expanded="false"
    >
      <span class="fab-icon" aria-hidden="true">☰</span>
      <span class="sr-only">Menüyü aç</span>
    </button>
  {/if}

  <div class="main-surface" class:pad-mobile={mobile}>
    {@render children()}
  </div>

  <button
    type="button"
    class="theme-toggle"
    aria-label={isDark ? "Açık temaya geç" : "Karanlık temaya geç"}
    title={isDark ? "Açık tema" : "Karanlık tema"}
    onclick={toggleTheme}
  >
    {isDark ? "☀️" : "🌙"}
  </button>
</div>

<style>
  .app-shell {
    display: flex;
    align-items: stretch;
    min-height: 100vh;
    height: 100vh;
    overflow: hidden;
    position: relative;
    background: var(--bg);
  }

  .main-surface {
    flex: 1;
    min-width: 0;
    overflow: auto;
    padding: 1.5rem 2rem 2.5rem;
  }

  .main-surface.pad-mobile {
    padding-top: 4.25rem;
  }

  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 65;
    border: 0;
    padding: 0;
    margin: 0;
    background: var(--backdrop);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
  }

  .backdrop.is-open {
    opacity: 1;
    pointer-events: auto;
  }

  .fab-menu {
    position: fixed;
    top: 12px;
    left: 12px;
    z-index: 68;
    width: 2.85rem;
    height: 2.85rem;
    border-radius: var(--radius-button);
    border: 1px solid var(--border);
    background: var(--surface-elevated);
    color: var(--text);
    cursor: pointer;
    box-shadow: var(--shadow-card);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .fab-menu:hover {
    background: var(--surface-hover);
  }

  .fab-icon {
    font-size: 1.1rem;
    line-height: 1;
  }

  .theme-toggle {
    position: fixed;
    bottom: 16px;
    right: 16px;
    z-index: 70;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    border: 1px solid var(--border);
    background: var(--surface-elevated);
    cursor: pointer;
    box-shadow: var(--shadow-card);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 1.1rem;
    line-height: 1;
    transition: background 0.15s, transform 0.1s;
  }

  .theme-toggle:hover {
    background: var(--surface-hover);
    transform: scale(1.08);
  }
</style>
