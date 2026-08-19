<script lang="ts">
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { _ } from "svelte-i18n";
  import NavFeatureIcon from "./NavFeatureIcon.svelte";
  import { NAV_ITEMS } from "$lib/nav-items";

  type Props = {
    mobile: boolean;
    drawerOpen?: boolean;
  };

  let { mobile, drawerOpen = $bindable(false) }: Props = $props();

  function closeDrawerAfterNav() {
    if (mobile) drawerOpen = false;
  }

  /**
   * Açık olan sayfanın menüde seçili görünmesi. Önceden hiç yoktu: gezinme
   * bağlantılarının yalnızca `:hover` durumu vardı, bu yüzden fare başka yere
   * gittiği anda kullanıcının hangi ekranda olduğu arayüzden okunamıyordu.
   *
   * Karşılaştırma `page.route.id` ile yapılıyor, adresle DEĞİL: uygulama hash
   * yönlendirmesi kullanıyor (`svelte.config.js` → `router.type: "hash"`), yani
   * `resolve("/frames")` `#/frames` üretiyor ve `location.pathname` her zaman
   * `/` kalıyor. Rota kimliği ise iki modda da buradaki `href` değerlerinin
   * aynısı: `/`, `/frames`, `/pdf` …
   */
  const isActive = (href: string) => page.route.id === href;
</script>

<aside
  id="app-sidebar"
  class="sidebar"
  class:drawer-open={mobile && drawerOpen}
  role="navigation"
  aria-label={$_("nav.appMenu")}
>
  <div class="sidebar-top">
    <span class="brand-compact">LPC</span>
  </div>

  <div class="nav-block">
    <p class="nav-heading">{$_("nav.features")}</p>
    <ul class="nav-list">
      {#each NAV_ITEMS as item (item.labelKey)}
        <li>
          <a
            href={resolve(item.href as "/")}
            class="nav-link"
            class:active={isActive(item.href)}
            aria-current={isActive(item.href) ? "page" : undefined}
            data-sveltekit-preload-data="off"
            onclick={closeDrawerAfterNav}
          >
            <span class="nav-label-group">
              <NavFeatureIcon id={item.icon} />
              <span class="nav-text-full">{$_(item.labelKey)}</span>
            </span>
          </a>
        </li>
      {/each}
    </ul>
  </div>

  <!-- Geçmiş buradan üst çubuğa taşındı; alt şeritte artık sürüm duruyor —
       masaüstü uygulamalarında bu köşenin alışıldık içeriği. -->
  <footer class="sidebar-foot">
    <span class="version">{$_("nav.version", { values: { version: __APP_VERSION__ } })}</span>
  </footer>
</aside>

<style>
  .sidebar {
    width: var(--sidebar-expanded);
    min-height: 100vh;
    height: 100%;
    border-right: 1px solid var(--border);
    /* macOS kenar çubuğu tonu: ana yüzeyden bir tık açık, ayrı bir yüzey gibi. */
    background: var(--bg-sidebar);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    transition: transform 0.18s ease;
  }

  .sidebar-top {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    /* Trafik ışıkları bu şeridin üstünde duruyor: soldan yer açılıyor. */
    padding: 0.5rem 0.6rem 0.5rem calc(0.6rem + var(--titlebar-height) * 2.4);
    min-height: calc(var(--titlebar-height) + 1.1rem);
    /* Üst çubukla aynı yükseklik + aynı ince çizgi: ikisi tek bir başlık
       şeridi gibi okunsun. */
    border-bottom: 1px solid var(--border);
    /* Bu şerit pencereyi sürüklüyor. Sürükleme bölgesi Chromium'da isabet
       testini kapatıyor: kenar çubuğunun tamamına verilince gezinme
       bağlantıları ne tıklanıyor ne de vurgulanıyordu. */
    -webkit-app-region: drag;
    position: relative;
    z-index: 2;
  }

  .brand-compact {
    font-weight: 600;
    font-size: 0.72rem;
    letter-spacing: 0.05em;
    color: var(--muted);
  }

  .nav-block {
    padding: 0.25rem 0.55rem 0.75rem;
    flex: 1;
    overflow: auto;
    min-height: 0;
  }

  .nav-heading {
    margin: 0.35rem 0 0.3rem 0.5rem;
    font-size: 0.68rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
  }

  .nav-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
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
    padding: 0.3rem 0.5rem;
    border-radius: var(--radius-button);
    text-decoration: none;
    color: var(--text);
    border: 1px solid transparent;
    font-size: 0.82rem;
    white-space: nowrap;
  }

  .nav-link:hover {
    background: var(--surface-hover);
  }

  /* Açık sayfa — Finder/Mail'deki seçili satır: vurgu dolgusu, beyaz metin.
     Pencere arkaya düştüğünde `--accent` griye çevrildiği için satır da
     kendiliğinden macOS'un pasif seçim rengine dönüyor. */
  .nav-link.active,
  .nav-link.active:hover {
    background: var(--accent);
    color: var(--accent-text);
    font-weight: 500;
  }

  .nav-link.active :global(svg) {
    color: var(--accent-text);
    opacity: 1;
  }

  .sidebar-foot {
    border-top: 1px solid var(--border);
    padding: 0.5rem 0.85rem;
    flex-shrink: 0;
  }

  .version {
    font-size: 0.7rem;
    color: var(--muted);
    letter-spacing: 0.01em;
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
  }
</style>
