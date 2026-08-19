<script lang="ts">
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { _ } from "svelte-i18n";
  import { HISTORY_ROUTE, labelKeyForRoute } from "$lib/nav-items";

  type Props = {
    mobile: boolean;
    isDark: boolean;
    onToggleTheme: () => void;
    onOpenDrawer: () => void;
  };

  let { mobile, isDark, onToggleTheme, onOpenDrawer }: Props = $props();

  /** Açık ekranın adı — kenar çubuğuyla aynı listeden geliyor. */
  const titleKey = $derived(labelKeyForRoute(page.route.id));
  const historyActive = $derived(page.route.id === HISTORY_ROUTE);
</script>

<!-- Üst çubuk: başlık çubuğu gizli olduğu için pencere buradan da sürükleniyor
     (`drag`), düğmeler tek tek `no-drag` ile geri alınıyor. Yüksekliği kenar
     çubuğunun üst şeridiyle aynı, böylece ikisi tek bir başlık şeridi gibi
     okunuyor ve trafik ışıklarıyla aynı hizada duruyor. -->
<header class="topbar">
  <div class="tb-left">
    {#if mobile}
      <button
        type="button"
        class="tb-btn icon-only"
        aria-label={$_("nav.openMenu")}
        aria-controls="app-sidebar"
        onclick={onOpenDrawer}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          {#each [4, 8, 12] as y (y)}
            <line x1="2.5" y1={y} x2="13.5" y2={y} stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          {/each}
        </svg>
      </button>
    {/if}
    {#if titleKey}
      <h2 class="tb-title">{$_(titleKey)}</h2>
    {/if}
  </div>

  <nav class="tb-right" aria-label={$_("nav.appMenu")}>
    <a
      href={resolve("/history")}
      class="tb-btn"
      class:active={historyActive}
      aria-current={historyActive ? "page" : undefined}
      data-sveltekit-preload-data="off"
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.4" />
        <path d="M8 4.4V8l2.4 1.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span>{$_("nav.history")}</span>
    </a>

    <button
      type="button"
      class="tb-btn icon-only"
      aria-label={isDark ? $_("common.themeLight") : $_("common.themeDark")}
      title={isDark ? $_("common.themeLight") : $_("common.themeDark")}
      onclick={onToggleTheme}
    >
      <!-- Emoji yerine tek renkli çizim: emoji her platformda farklı görünüyor
           ve masaüstü araç çubuğu simgesi gibi durmuyor. -->
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        {#if isDark}
          <circle cx="8" cy="8" r="3.1" fill="currentColor" />
          {#each [0, 45, 90, 135, 180, 225, 270, 315] as deg (deg)}
            <line
              x1="8" y1="1.6" x2="8" y2="3.4"
              stroke="currentColor" stroke-width="1.4" stroke-linecap="round"
              transform="rotate({deg} 8 8)"
            />
          {/each}
        {:else}
          <path d="M13.2 10.3A5.6 5.6 0 0 1 5.7 2.8a5.6 5.6 0 1 0 7.5 7.5Z" fill="currentColor" />
        {/if}
      </svg>
    </button>
  </nav>
</header>

<style>
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-shrink: 0;
    min-height: calc(var(--titlebar-height) + 1.1rem);
    padding: 0.35rem 0.9rem;
    border-bottom: 1px solid var(--border);
    background: var(--bg-sidebar);
    -webkit-app-region: drag;
  }

  .tb-left,
  .tb-right {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    min-width: 0;
  }

  .tb-title {
    margin: 0;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tb-btn {
    -webkit-app-region: no-drag;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    height: 24px;
    padding: 0 0.5rem;
    border: 1px solid transparent;
    border-radius: var(--radius-button);
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: 0.78rem;
    text-decoration: none;
    white-space: nowrap;
  }

  .tb-btn.icon-only {
    padding: 0;
    width: 24px;
    justify-content: center;
  }

  .tb-btn:hover {
    background: var(--surface-hover);
    color: var(--text);
  }

  .tb-btn:active {
    background: var(--border-strong);
  }

  /* Geçmiş açıkken düğme, kenar çubuğundaki seçili satırla aynı dili konuşuyor. */
  .tb-btn.active,
  .tb-btn.active:hover {
    background: var(--accent);
    color: var(--accent-text);
  }
</style>
