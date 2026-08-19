<script lang="ts">
  import { onMount } from "svelte";
  import { _ } from "svelte-i18n";
  import Sidebar from "./Sidebar.svelte";
  import Topbar from "./Topbar.svelte";

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
    const root = document.documentElement;

    // macOS'ta pencere kabuğu farklı: başlık çubuğu gizli, trafik ışıkları
    // içeriğin üstünde ve arka plan vibrancy ile saydam. Bu üçü yalnızca
    // orada geçerli, o yüzden platform CSS'e bir kez bayrak olarak veriliyor.
    if (/Mac/i.test(navigator.userAgent)) {
      root.dataset.platform = "mac";
    }

    // Pencere arkaya düştüğünde macOS tüm vurgu renklerini griye çeker.
    const syncWindowActive = () => root.classList.toggle("window-inactive", !document.hasFocus());
    syncWindowActive();
    window.addEventListener("focus", syncWindowActive);
    window.addEventListener("blur", syncWindowActive);

    const stored = localStorage.getItem("lpc-theme");
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
    if (stored) {
      applyTheme(stored === "dark");
    } else {
      applyTheme(systemDark.matches);
    }
    // Kullanıcı elle seçim yapmadıysa sistem temasını izle.
    const syncSystemTheme = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem("lpc-theme")) applyTheme(e.matches);
    };
    systemDark.addEventListener("change", syncSystemTheme);

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
      window.removeEventListener("focus", syncWindowActive);
      window.removeEventListener("blur", syncWindowActive);
      systemDark.removeEventListener("change", syncSystemTheme);
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
      aria-label={$_("nav.closeMenu")}
      aria-hidden={!drawerOpen}
      tabindex={drawerOpen ? 0 : -1}
      onclick={() => (drawerOpen = false)}
    ></button>
  {/if}

  <Sidebar bind:drawerOpen {mobile} />

  <div class="main-surface">
    <Topbar {mobile} {isDark} onToggleTheme={toggleTheme} onOpenDrawer={openDrawer} />
    <div class="content">
      {@render children()}
    </div>
  </div>

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

  /* Üst çubuk sabit, içerik onun altında kayıyor: sürükleme şeridi ve gezinme
     her zaman görünür kalmalı. Bu yüzden yüzey dikey bir kolon. */
  .main-surface {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg);
    position: relative;
  }

  .content {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 1.5rem 2rem 2.5rem;
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

</style>
