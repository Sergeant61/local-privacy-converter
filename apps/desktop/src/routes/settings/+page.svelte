<script lang="ts">
  import { browser } from "$app/environment";
  import { onMount } from "svelte";
  import { _, locale } from "svelte-i18n";
  import { setLocale, SUPPORTED_LOCALES, type SupportedLocale } from "$lib/i18n";

  const hasLfc = browser && typeof window !== "undefined" && "lfc" in window && !!window.lfc;

  type QualityPreset = "high" | "compatible" | "balanced" | "small" | "very_small";

  let outputDir = $state("");
  let ffmpegBinary = $state("");
  let defaultQuality = $state<QualityPreset>("balanced");
  let loading = $state(true);
  let saving = $state(false);
  let toast = $state<string | null>(null);
  let toastError = $state(false);

  const QUALITY_OPTIONS: { value: QualityPreset; labelKey: string; descKey: string }[] = [
    { value: "high",       labelKey: "quality.high",       descKey: "quality.highDesc" },
    { value: "compatible", labelKey: "quality.compatible",  descKey: "quality.compatibleDesc" },
    { value: "balanced",   labelKey: "quality.balanced",    descKey: "quality.balancedDesc" },
    { value: "small",      labelKey: "quality.small",       descKey: "quality.smallDesc" },
    { value: "very_small", labelKey: "quality.verySmall",   descKey: "quality.verySmallDesc" },
  ];

  onMount(async () => {
    if (!hasLfc) { loading = false; return; }
    const s = await window.lfc.getSettings();
    outputDir = s.outputDir ?? "";
    ffmpegBinary = s.ffmpegBinary ?? "";
    defaultQuality = (s.defaultQuality as QualityPreset | undefined) ?? "balanced";
    loading = false;
  });

  async function pickOutputDir() {
    if (!hasLfc) return;
    const r = await window.lfc.setSettings({ pickOutputDir: true });
    if (r.ok) {
      const s = await window.lfc.getSettings();
      outputDir = s.outputDir ?? "";
      showToast($_("settings.outputDirUpdated"), false);
    }
  }

  async function save() {
    if (!hasLfc) return;
    saving = true;
    const r = await window.lfc.setSettings({
      outputDir: outputDir.trim() || undefined,
      ffmpegBinary: ffmpegBinary.trim() || undefined,
      defaultQuality: defaultQuality,
    });
    saving = false;
    if (r.ok) {
      showToast($_("settings.saved"), false);
    } else {
      showToast(r.ok === false ? (r.message ?? $_("common.error")) : $_("common.error"), true);
    }
  }

  async function resetOutputDir() {
    outputDir = "";
    await window.lfc.setSettings({ outputDir: "" });
    showToast($_("settings.outputDirReset"), false);
  }

  function showToast(msg: string, error: boolean) {
    toast = msg;
    toastError = error;
    setTimeout(() => { toast = null; }, 3500);
  }

  const LOCALE_LABELS: Record<SupportedLocale, string> = { tr: "Türkçe", en: "English" };

  type UpdateResult = {
    ok: true;
    currentVersion: string;
    latestVersion: string;
    hasUpdate: boolean;
    releaseUrl: string;
  } | { ok: false; message: string } | null;

  let updateChecking = $state(false);
  let updateResult = $state<UpdateResult>(null);

  async function checkUpdate() {
    if (!hasLfc || updateChecking) return;
    updateChecking = true;
    updateResult = null;
    updateResult = await window.lfc.checkUpdate();
    updateChecking = false;
  }
</script>

<div class="page">
  <header class="page-header">
    <h1 class="page-title">{$_("settings.title")}</h1>
    <p class="page-sub">{$_("settings.subtitle")}</p>
  </header>

  {#if loading}
    <div class="loading">{$_("settings.loadingSettings")}</div>
  {:else}
    <section class="card">
      <h2 class="card-title">{$_("settings.language")}</h2>
      <p class="field-desc">{$_("settings.languageDesc")}</p>
      <div class="lang-row">
        {#each SUPPORTED_LOCALES as loc (loc)}
          <button
            type="button"
            class="lang-btn"
            class:active={$locale === loc || ($locale?.startsWith(loc) ?? false)}
            onclick={() => setLocale(loc)}
          >{LOCALE_LABELS[loc]}</button>
        {/each}
      </div>
    </section>

    <section class="card">
      <h2 class="card-title">{$_("settings.outputDir")}</h2>
      <p class="field-desc">{$_("settings.outputDirDesc", { values: { default: "Belgeler/LPC" } })}</p>
      <div class="dir-row">
        <input
          type="text"
          class="text-input dir-input"
          placeholder={$_("settings.outputDirPlaceholder")}
          bind:value={outputDir}
          readonly
        />
        <button type="button" class="btn btn-secondary" onclick={pickOutputDir}>{$_("common.browse")}</button>
        {#if outputDir}
          <button type="button" class="btn btn-ghost" onclick={resetOutputDir} title={$_("settings.resetToDefault")}>↺</button>
        {/if}
      </div>
    </section>

    <section class="card">
      <h2 class="card-title">{$_("settings.defaultQuality")}</h2>
      <p class="field-desc">{$_("settings.defaultQualityDesc")}</p>
      <div class="quality-grid">
        {#each QUALITY_OPTIONS as opt (opt.value)}
          <button
            type="button"
            class="quality-btn"
            class:active={defaultQuality === opt.value}
            onclick={() => (defaultQuality = opt.value)}
          >
            <span class="quality-label">{$_(opt.labelKey)}</span>
            <span class="quality-desc">{$_(opt.descKey)}</span>
          </button>
        {/each}
      </div>
    </section>

    <section class="card">
      <h2 class="card-title">{$_("settings.ffmpegBinary")}</h2>
      <p class="field-desc">{$_("settings.ffmpegBinaryDesc")}</p>
      <input
        type="text"
        class="text-input"
        placeholder={$_("settings.ffmpegBinaryPlaceholder")}
        bind:value={ffmpegBinary}
      />
      {#if ffmpegBinary}
        <p class="warning-note">{$_("settings.ffmpegBinaryWarning")}</p>
      {/if}
    </section>

    <section class="card action-card">
      {#if toast}
        <p class="toast" class:toast-error={toastError} role="status">{toast}</p>
      {/if}
      <button type="button" class="btn btn-primary" onclick={save} disabled={saving || !hasLfc}>
        {saving ? $_("common.saving") : $_("common.save")}
      </button>
      {#if !hasLfc}
        <p class="no-electron">{$_("common.noElectron")}</p>
      {/if}
    </section>

    <section class="card">
      <h2 class="card-title">{$_("settings.updates")}</h2>
      <p class="field-desc">{$_("settings.updatesDesc")}</p>
      <div class="update-row">
        <button
          type="button"
          class="btn btn-secondary"
          onclick={checkUpdate}
          disabled={updateChecking || !hasLfc}
        >{updateChecking ? $_("settings.checking") : $_("settings.checkUpdate")}</button>

        {#if updateResult}
          {#if updateResult.ok}
            {#if updateResult.hasUpdate}
              <div class="update-available">
                <span>🎉 {$_("settings.updateAvailable", { values: { latest: `v${updateResult.latestVersion}`, current: `v${updateResult.currentVersion}` } })}</span>
                <a href={updateResult.releaseUrl} target="_blank" rel="noopener" class="release-link">{$_("settings.download")}</a>
              </div>
            {:else}
              <p class="update-ok">✓ {$_("settings.updateOk", { values: { version: `v${updateResult.currentVersion}` } })}</p>
            {/if}
          {:else if updateResult.ok === false}
            <p class="update-err">{$_("settings.updateError", { values: { message: updateResult.message } })}</p>
          {/if}
        {/if}
      </div>
    </section>
  {/if}
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 1.25rem; max-width: 640px; }
  .page-header { margin-bottom: 0.25rem; }
  .page-title { font-size: 1.45rem; font-weight: 700; margin: 0 0 0.3rem; background: linear-gradient(90deg, var(--accent-start), var(--accent-end)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
  .page-sub { font-size: 0.88rem; color: var(--muted); margin: 0; }
  .loading { font-size: 0.9rem; color: var(--muted); padding: 2rem 0; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 1.25rem 1.5rem; display: flex; flex-direction: column; gap: 0.85rem; }
  .card-title { font-size: 0.85rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); margin: 0; }
  .field-desc { font-size: 0.84rem; color: var(--muted); margin: 0; line-height: 1.5; }
  :global(.field-desc code) { font-family: monospace; background: rgba(255,255,255,0.06); padding: 0.1rem 0.3rem; border-radius: 3px; }
  .dir-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .text-input { background: var(--surface-elevated); border: 1px solid var(--border); border-radius: var(--radius-button); color: var(--text); font: inherit; font-size: 0.9rem; padding: 0.5rem 0.75rem; width: 100%; }
  .text-input:focus { outline: none; border-color: var(--accent-start); }
  .text-input[readonly] { cursor: default; opacity: 0.8; }
  .dir-input { flex: 1; min-width: 10rem; }
  .quality-grid { display: flex; flex-direction: column; gap: 0.4rem; }
  .quality-btn { display: flex; align-items: baseline; gap: 0.65rem; padding: 0.55rem 0.75rem; border-radius: var(--radius-button); border: 1px solid var(--border); background: var(--surface-elevated); color: var(--text); cursor: pointer; text-align: left; transition: border-color 0.12s, background 0.12s; }
  .quality-btn:hover { border-color: var(--accent-start); background: var(--surface-hover); }
  .quality-btn.active { border-color: var(--accent-start); background: rgba(56,189,248,0.1); }
  .quality-label { font-size: 0.88rem; font-weight: 600; min-width: 6rem; color: var(--text); }
  .quality-btn.active .quality-label { color: var(--accent-start); }
  .quality-desc { font-size: 0.78rem; color: var(--muted); }
  .warning-note { font-size: 0.82rem; color: var(--warning, #f59e0b); margin: 0; }
  .action-card { gap: 0.75rem; }
  .toast { margin: 0; padding: 0.55rem 0.85rem; border-radius: 8px; font-size: 0.87rem; background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.25); color: var(--success); }
  .toast.toast-error { background: rgba(239,68,68,0.08); border-color: rgba(239,68,68,0.2); color: var(--danger); }
  .no-electron { font-size: 0.82rem; color: var(--muted); margin: 0; font-style: italic; }
  .btn { padding: 0.6rem 1.4rem; border-radius: var(--radius-button); border: 1px solid transparent; font: inherit; font-size: 0.92rem; font-weight: 600; cursor: pointer; transition: opacity 0.12s, background 0.12s; align-self: flex-start; }
  .btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .btn-primary { background: linear-gradient(90deg, var(--accent-start), var(--accent-end)); color: #fff; border-color: transparent; }
  .btn-primary:not(:disabled):hover { opacity: 0.88; }
  .btn-secondary { background: var(--surface-elevated); color: var(--text); border-color: var(--border); white-space: nowrap; }
  .btn-secondary:hover { background: var(--surface-hover); }
  .btn-ghost { background: none; color: var(--muted); border-color: transparent; padding: 0.55rem 0.5rem; }
  .btn-ghost:hover { color: var(--text); }

  .lang-row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .lang-btn { padding: 0.45rem 1.1rem; border-radius: var(--radius-button); border: 1px solid var(--border); background: var(--surface-elevated); color: var(--text); font: inherit; font-size: 0.9rem; cursor: pointer; transition: border-color 0.12s, background 0.12s; }
  .lang-btn:hover { border-color: var(--accent-start); background: var(--surface-hover); }
  .lang-btn.active { border-color: var(--accent-start); background: rgba(56,189,248,0.1); color: var(--accent-start); font-weight: 600; }
  .update-row { display: flex; flex-direction: column; gap: 0.65rem; }
  .update-available { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; padding: 0.55rem 0.75rem; border-radius: 8px; background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.25); font-size: 0.87rem; color: var(--success); }
  .release-link { font-size: 0.82rem; padding: 0.2rem 0.6rem; border: 1px solid rgba(34,197,94,0.4); border-radius: 4px; color: var(--success); text-decoration: none; }
  .release-link:hover { background: rgba(34,197,94,0.15); }
  .update-ok { margin: 0; font-size: 0.87rem; color: var(--success); }
  .update-err { margin: 0; font-size: 0.87rem; color: var(--danger); }
</style>
