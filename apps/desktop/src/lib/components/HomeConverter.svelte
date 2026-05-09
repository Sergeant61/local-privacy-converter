<script lang="ts">
  let fileLabel = $state<string | null>(null);
  let targetFormat = $state("mp4");
  let qualityPreset = $state("balanced");
  let isDragging = $state(false);

  function onFiles(files: FileList | null) {
    const first = files?.item(0);
    fileLabel = first ? first.name : null;
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    isDragging = false;
    onFiles(event.dataTransfer?.files ?? null);
  }
</script>

<div class="page">
  <header class="hero">
    <p class="eyebrow">Local Privacy Converter</p>
    <h1>Dosyalarınız cihazdan çıkmadan dönüştürün ve sıkıştırın</h1>
    <p class="lede">
      Medya işlemleri yerelde kalır; buluta yüklenmez. İşlem sırasında internet bağlantısı gerekmez (abonelik
      akışları bağlandığında hariç).
    </p>
  </header>

  <section class="card" aria-labelledby="job-title">
    <div class="card-header">
      <h2 id="job-title">Yeni iş</h2>
      <p class="card-sub">
        Dönüştürme için dosya ekleyin; ayarlar kuyruk bağlandığında uygulanacak.
      </p>
    </div>

    <div
      role="region"
      aria-label="Dosya bırakma alanı"
      class="drop"
      class:drag={isDragging}
      ondragenter={(e) => {
        e.preventDefault();
        isDragging = true;
      }}
      ondragover={(e) => e.preventDefault()}
      ondragleave={() => (isDragging = false)}
      ondrop={onDrop}
    >
      <p class="drop-title">Dosyaları buraya bırakın</p>
      <p class="drop-sub">veya tek dosya seçin — sürükle-bırak henüz sistem ile tam entegre değil.</p>
      <label class="file-pick">
        <span class="cta">Dosya seç</span>
        <input
          type="file"
          class="sr-only"
          onchange={(event) => onFiles((event.currentTarget as HTMLInputElement).files)}
        />
      </label>
      {#if fileLabel}
        <p class="file-name" aria-live="polite">Seçili: <strong>{fileLabel}</strong></p>
      {/if}
    </div>

    <div class="grid">
      <label class="field">
        <span>Hedef konteyner / uzantı</span>
        <select bind:value={targetFormat}>
          <option value="mp4">MP4 (H.264 + AAC)</option>
          <option value="webm">WebM (VP9/Opus)</option>
          <option value="mkv">MKV</option>
          <option value="mp3">MP3 (yalın ses)</option>
          <option value="wav">WAV</option>
        </select>
      </label>

      <label class="field">
        <span>Kalite ön ayarı</span>
        <select bind:value={qualityPreset}>
          <option value="compatible">Uyumluluk (daha büyük dosya)</option>
          <option value="balanced">Dengeli</option>
          <option value="small">Maksimum sıkıştırma</option>
        </select>
      </label>
    </div>

    <div class="progress" aria-hidden="true">
      <div class="progress-label">İlerleme</div>
      <div class="bar"><span class="fill" style="width: 0%"></span></div>
    </div>
  </section>
</div>

<style>
  .page {
    max-width: 960px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    padding-bottom: 1rem;
  }

  .hero {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }

  .eyebrow {
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-size: 0.72rem;
    color: var(--muted);
    font-weight: 700;
  }

  h1 {
    margin: 0;
    font-size: clamp(1.65rem, 2.4vw, 2.05rem);
    line-height: 1.2;
  }

  .lede {
    margin: 0;
    color: var(--muted);
    max-width: 780px;
  }

  .card {
    background: radial-gradient(circle at 15% 20%, rgba(56, 189, 248, 0.12), transparent),
      var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    padding: 1.35rem 1.45rem 1.5rem;
    box-shadow: var(--shadow-card);
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .card-header h2 {
    margin: 0;
    font-size: 1.2rem;
  }

  .card-sub {
    margin: 0.35rem 0 0;
    color: var(--muted);
  }

  .drop {
    border: 1px dashed var(--border);
    border-radius: var(--radius-card);
    padding: 1.1rem;
    text-align: center;
    background: rgba(255, 255, 255, 0.02);
    transition:
      border-color 0.15s ease,
      background 0.15s ease;
  }

  .drop.drag {
    border-color: var(--accent-start);
    background: rgba(56, 189, 248, 0.08);
  }

  .drop-title {
    margin: 0;
    font-weight: 800;
  }

  .drop-sub {
    margin: 0.35rem 0 0.75rem;
    color: var(--muted);
    font-size: 0.92rem;
  }

  .file-pick {
    display: inline-flex;
    justify-content: center;
  }

  .cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.75rem 1.15rem;
    border-radius: var(--radius-button);
    background: linear-gradient(120deg, var(--accent-start), var(--accent-end));
    color: var(--accent-text);
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 10px 30px rgba(99, 102, 241, 0.22);
  }

  .file-name {
    margin: 0.85rem 0 0;
    color: var(--muted);
    font-size: 0.92rem;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 0.85rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.9rem;
    color: var(--muted);
  }

  select {
    border-radius: var(--radius-button);
    border: 1px solid var(--border);
    background: var(--surface-elevated);
    color: var(--text);
    padding: 0.65rem 0.75rem;
    font-size: 0.95rem;
  }

  .progress {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    opacity: 0.65;
  }

  .progress-label {
    font-size: 0.82rem;
    color: var(--muted);
  }

  .bar {
    width: 100%;
    height: 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
    overflow: hidden;
    border: 1px solid var(--border);
  }

  .fill {
    display: block;
    height: 100%;
    background: linear-gradient(120deg, var(--accent-start), var(--accent-end));
    border-radius: inherit;
  }
</style>
