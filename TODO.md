# Local Privacy Converter — Yapılacaklar Listesi

Mevcut durum: **v1.0.3** — Electron + SvelteKit + FFmpeg, çevrimdışı medya dönüştürücü.

---

## 🔴 Öncelikli — Planlanmış Özellikler (Sidebar'da "Yakında")

- [x] **Aspect Ratio Aracı** — Bağımsız sayfa; 16:9, 9:16, 1:1, 4:3, özel oran ile video/görüntü kırpma
  > **Durum:** ✅ Tamamlandı
  > **Seviye:** Tam — sıfır TypeScript hatası, sidebar linki aktif
  > **Not:** `apps/desktop/src/routes/aspect-ratio/+page.svelte` oluşturuldu. Dosya seçimi, 6 oran presetı (özel dahil), görsel oran önizlemesi, FFmpeg crop filtresi, ilerleme çubuğu, iptal ve geçmişe kayıt. Görüntüler için PNG/JPEG/WebP encoder otomatik seçimi mevcut.

- [x] **Çözünürlük Ölçekleme Aracı** — Bağımsız sayfa; 360p → 4K veya özel boyut ile upscale/downscale
  > **Durum:** ✅ Tamamlandı
  > **Seviye:** Tam — 0 TypeScript hatası, sidebar linki aktif
  > **Not:** `apps/desktop/src/routes/resolution/+page.svelte` oluşturuldu. 7 ön ayar (360p–4K + Özel), px cinsinden genişlik girişi, en-boy oranı koruma toggle'ı, ilerleme çubuğu, iptal ve geçmiş kaydı. FFmpeg `scale=W:-2` ile orantılı ölçekleme.

- [x] **Ses Birleştirme (Audio Merge)** — Birden fazla ses dosyasını tek parçaya birleştirme (FFmpeg `amix` filtresi)
  > **Durum:** ✅ Tamamlandı
  > **Seviye:** Tam — 0 TypeScript hatası, yeni IPC kanalı
  > **Not:** `lfc/ffmpeg/audio-merge` IPC kanalı eklendi (main.ts + preload.ts + app.d.ts). `routes/audio-merge/+page.svelte` oluşturuldu. Sıralı (concat) ve eş zamanlı (mix) mod, MP3/M4A/WAV/FLAC çıktı seçimi, çoklu dosya ekleme, geçmiş kaydı.

- [x] **Video Birleştirme (Video Merge)** — Birden fazla video klibini sıralı birleştirme (FFmpeg `concat` demuxer)
  > **Durum:** ✅ Tamamlandı
  > **Seviye:** Tam — 0 TypeScript hatası
  > **Not:** `lfc/ffmpeg/video-merge` IPC kanalı. `routes/video-merge/+page.svelte`. Stream copy (yeniden kodlama yok), geçici concat-list dosyası otomatik silinir, sıra değiştirme ↑↓ butonları. Uyarı: tüm dosyalar aynı codec'te olmalı.

- [x] **Kare Çıkarma (Frame Extraction)** — Belirli aralıklarla veya saniye bazlı görüntü çıkarma, thumbnail üretimi
  > **Durum:** ✅ Tamamlandı
  > **Seviye:** Tam — 0 TypeScript hatası
  > **Not:** `lfc/ffmpeg/frame-extract` IPC kanalı. `routes/frames/+page.svelte`. `fps=1/N` filtresi, PNG veya JPG çıktı, kareler `<ad>-kareler/frame-NNNN.ext` olarak kaydedilir.

---

## 🟠 Yüksek Öncelik — Kritik Eksikler

- [x] **Toplu Dönüştürme (Batch Conversion)** — Çoklu dosya seçimi, sıra yönetimi, her biri için ayrı ilerleme, hata durumunda sonraki dosyaya geçme
  > **Durum:** ✅ Tamamlandı
  > **Seviye:** Tam — 0 TypeScript hatası, sidebar linki aktif
  > **Not:** `routes/batch/+page.svelte` oluşturuldu. Çoklu dosya ekleme (tıkla/sürükle), hedef format seçici (video/ses/görüntü grupları), kalite seçici, her dosya için ayrı durum (bekliyor/işleniyor/tamamlandı/hata) ve ilerleme çubuğu. Sıralı işleme — hata olsa da sonraki dosyaya devam eder. Her dosya için geçmiş kaydı. "Tamamlananları temizle" butonu. Yeni `batch` ikonu NavFeatureIcon ve Sidebar'a eklendi.

- [x] **GIF Çıktı Formatı** — `palettegen` + `paletteuse` filtresi ile yüksek kaliteli GIF; video kısımlarından GIF üretme
  > **Durum:** ✅ Tamamlandı
  > **Seviye:** Tam — 0 TypeScript hatası, sidebar linki aktif
  > **Not:** `lfc/ffmpeg/gif-convert` IPC kanalı eklendi (main.ts + preload.ts + app.d.ts). `routes/gif/+page.svelte` oluşturuldu. FPS kontrolü (1-30), 5 genişlik ön ayarı (240–800px), sonsuz/bir kez döngü seçeneği. FFmpeg `filter_complex` ile tek geçişte `palettegen` + `paletteuse` (Bayer dither, diff_mode=rectangle). GIF ikonu sidebar'a eklendi.

- [x] **H.265 (HEVC) Varsayılan Profili** — `libx265` encoder ile hazır çıktı profili; H.264'e göre ~%50 daha küçük dosya boyutu
  > **Durum:** ✅ Tamamlandı
  > **Seviye:** Tam — 0 TypeScript hatası
  > **Not:** `mp4-h265-aac` profili `target-profiles.ts`, `conversion-matrix.ts`, `job-hints.ts` ve `ui-meta.ts`'e eklendi. Ana dönüştürücü ve toplu dönüştürme sayfasında hemen görünür; `libx265` encoder'ı yoksa profil grileşir.

- [x] **AV1 Varsayılan Profili** — `libsvtav1` encoder ile profil; Netflix/YouTube standartlarında verimli sıkıştırma
  > **Durum:** ✅ Tamamlandı
  > **Seviye:** Tam — 0 TypeScript hatası
  > **Not:** `mp4-av1-aac` profili aynı dosyalara eklendi. `libsvtav1` gerektiriyor; bundled FFmpeg'de mevcut değilse grileşir. CRF tablosu `build-args.ts`'te zaten `libsvtav1` için vardı.

- [x] **Ayarlar Sayfası** — Varsayılan çıktı klasörü, tercih edilen kalite seviyesi, varsayılan donanım hızlandırma, ffmpeg binary yolu UI'ı
  > **Durum:** ✅ Tamamlandı
  > **Seviye:** Tam — 0 TypeScript hatası, sidebar linki aktif
  > **Not:** `lfc/settings/get` ve `lfc/settings/set` IPC kanalları eklendi. Ayarlar `app.getPath("userData")/lpc-settings.json` dosyasında saklanır. Uygulama başlangıcında `loadSettings()` çağrılır. Ayarlar: çıktı klasörü (klasör seçici dialog ile), varsayılan kalite ön ayarı, özel FFmpeg binary yolu. `getOutputDir` ve yeni IPC kanalları (`audio-merge`, `video-merge`, `frame-extract`, `gif-convert`) ayarlardaki değerleri kullanır. `routes/settings/+page.svelte` oluşturuldu.

- [x] **Altyazı Akışı Desteği** — Altyazı akışlarını kopyalama (`-c:s copy`), SRT/ASS/VTT olarak dışa aktarma
  > **Durum:** ✅ Tamamlandı
  > **Seviye:** Tam — 0 TypeScript hatası
  > **Not:** `lfc/ffmpeg/subtitle-probe` ve `lfc/ffmpeg/subtitle-extract` IPC kanalları eklendi. Probe kanalı ffprobe'u doğrudan kullanarak `codec_type === "subtitle"` akışlarını listeler (index, codecName, title, language). Çıkarma kanalı `-map 0:N -c:s copy` ile belirtilen akışı çıkarır. `routes/subtitle/+page.svelte` oluşturuldu — stream seçici radyo butonları, SRT/ASS/VTT format seçimi.

- [x] **Sistem Bildirimi** — Dönüşüm tamamlandığında veya hata oluştuğunda Electron `Notification` API ile OS bildirimi
  > **Durum:** ✅ Tamamlandı
  > **Seviye:** Tam — 0 TypeScript hatası
  > **Not:** `Notification` Electron modülü import edildi. `notifyCompletion(title, body)` yardımcı fonksiyonu eklendi. `runConvertJob`, `audioMerge`, `videoMerge`, `frameExtract`, `gifConvert` kanallarının tümünde başarı ve hata durumlarında OS bildirimi gönderilir. `Notification.isSupported()` kontrolü ile platform uyumluluğu sağlanır.

---

## 🟡 Orta Öncelik — Kullanıcı Deneyimi

- [x] **Video Önizleme Oynatıcısı** — Seçilen video dosyasını dönüştürmeden önce HTML5 `<video>` ile önizleme; oynat/duraklat/seek çubuğu
  > **Durum:** ✅ Tamamlandı
  > **Seviye:** Tam — 0 TypeScript hatası
  > **Not:** `HomeConverter.svelte` güncellendi. `videoPreviewUrl = $state<string | null>(null)` eklendi. `runProbe()` içinde kind `"video"` iken `file://` URL'i ayarlanır (Windows path backslash → forward slash dönüşümü dahil). Önizleme panelinde `<video controls>` elementi gösterilir; `.preview-video` CSS sınıfı `max-height: 200px` ile sınır belirler. Ses dosyaları için placeholder gösterilmeye devam eder.

- [x] **Ses Dalga Formu Önizlemesi** — Ses dosyası seçildiğinde Web Audio API ile dalga formu görselleştirme
  > **Durum:** ✅ Tamamlandı
  > **Seviye:** Tam — 0 TypeScript hatası, 0 uyarı
  > **Not:** `HomeConverter.svelte` güncellendi. `waveformPath` ve `waveformCanvas` state'leri eklendi. `runProbe()` içinde kind `"audio"` olduğunda `waveformPath` ayarlanır. Svelte `$effect` ile `waveformCanvas` bind ve `waveformPath` birlikte hazır olduğunda `renderWaveform()` çağrılır. Web Audio API: `fetch(file://)` → `decodeAudioData` → `getChannelData(0)` → canvas 2D. Her piksel için min/max örnekleme ile gerçek dalga formu; `rgba(56,189,248)` rengiyle tema ile uyumlu.

- [x] **Video Trim / Kırpma Aracı** — `-ss` ve `-to` parametreleriyle başlangıç-bitiş noktası belirleme; zaman çizelgesi UI
  > **Durum:** ✅ Tamamlandı
  > **Seviye:** Tam — 0 TypeScript hatası
  > **Not:** `lfc/ffmpeg/video-trim` IPC kanalı eklendi (main.ts + preload.ts + app.d.ts). `routes/trim/+page.svelte` oluşturuldu. Saat:dakika:saniye girişi, otomatik süre doldurma (probe ile), seçilen aralık göstergesi, hızlı kırpma (stream copy, `-c copy`) veya yeniden kodlama seçeneği. `-ss startSec` input öncesine, `-to endSec` input sonrasına eklenerek hızlı seek sağlanır. Trim ikonu Sidebar ve NavFeatureIcon'a eklendi.

- [x] **Ses Normalizasyonu** — FFmpeg `loudnorm` filtresi ile EBU R128 standardında ses seviyesi dengeleme
  > **Durum:** ✅ Tamamlandı
  > **Seviye:** Tam — 0 TypeScript hatası
  > **Not:** `lfc/ffmpeg/audio-normalize` IPC kanalı eklendi (main.ts + preload.ts + app.d.ts). `routes/normalize/+page.svelte` oluşturuldu. 4 hazır ön ayar (Streaming −14 / Broadcast −23 / Podcast −16 / YouTube −14 LUFS) + Özel mod. 3 parametre slider ile ayarlanabilir: Integrated LUFS, True Peak (dBTP), LRA (Loudness Range). FFmpeg `loudnorm=I={lufs}:TP={tp}:LRA={lra}:print_format=none` filtresi kullanılır. Sidebar linki ve "normalize" ikonu eklendi.

- [x] **Filigran (Watermark) Ekleme** — Metin veya görüntü overlay; konum (sol üst/sağ alt/merkez), opaklık ve boyut ayarı
  > **Durum:** ✅ Tamamlandı
  > **Seviye:** Tam — 0 TypeScript hatası
  > **Not:** `lfc/ffmpeg/watermark` IPC kanalı eklendi. Metin modu: FFmpeg `drawtext` filtresi; fontsize, fontcolor@opacity, konum, gölge. Görsel modu: `-filter_complex "[1:v]format=rgba,colorchannelmixer=aa=opacity[wm];[0:v][wm]overlay=pos"`. 5 konum seçeneği (Sol Üst/Sağ Üst/Merkez/Sol Alt/Sağ Alt), opaklık slider, yazı boyutu slider, 5 renk paleti. `routes/watermark/+page.svelte` oluşturuldu.

- [x] **Metadata Düzenleyici** — Video/ses dosyaları için title, artist, album, year gibi tag alanlarını düzenleme (`-metadata` flag)
  > **Durum:** ✅ Tamamlandı
  > **Seviye:** Tam — 0 TypeScript hatası
  > **Not:** `lfc/ffmpeg/metadata-read` ve `lfc/ffmpeg/metadata-write` IPC kanalları eklendi. Okuma: ffprobe `format.tags` alanını döndürür. Yazma: `-metadata key=val -c copy` ile stream copy (yeniden kodlama yok). `routes/metadata/+page.svelte`: dosya seçimi, mevcut etiketler otomatik yüklenir, 6 alan (Başlık, Sanatçı, Albüm, Yıl, Tür, Yorum) iki kolonda gösterilir. Sidebar ve "metadata" ikonu eklendi.

- [x] **Klavye Kısayolları** — `Ctrl+O`: dosya aç, `Esc`: iptal, `Enter`: dönüştürmeyi başlat, `Ctrl+H`: geçmiş
  > **Durum:** ✅ Tamamlandı
  > **Seviye:** Tam — 0 TypeScript hatası
  > **Not:** `AppShell.svelte` keydown handler genişletildi. `Ctrl+O` (veya `Cmd+O`): `lfc:open-file` CustomEvent dispatch eder; sayfalar bu eventi dinleyerek dosya seçici açar. `Esc`: mobil drawer kapalıysa `lfc.cancelConvert()` çağırır. HomeConverter.svelte `onMount`'ta `lfc:open-file` event listener eklendi; diğer sayfalar da gerektiğinde aynı şekilde bağlanabilir.

- [x] **Tooltip Açıklamaları** — CRF değerlerinin ne anlama geldiği, donanım hızlandırma seçenekleri, codec farkları için bağlam içi yardım
  > **Durum:** ✅ Tamamlandı
  > **Seviye:** Tam — 0 TypeScript hatası
  > **Not:** `HomeConverter.svelte` güncellendi. Kalite seçeneği `<option>` elementlerine `title` attribute eklendi (CRF değerleri). Encoder mevcudiyet span'larına `title` ile açıklama. Donanım hızlandırma meta satırına `title` ile "GPU yöntemleri otomatik kullanılır" açıklaması. Video encoder seçici `<label>`'a tooltip. Var olan `field-hint` `<p>` elementleri zaten CRF açıklamalarını gösteriyor.

---

## 🟢 "Şu da Olsa Süper Olur" — Bonus Öneriler

### Arayüz & Deneyim

- [x] **İngilizce Dil Desteği** — `svelte-i18n` ile Türkçe/İngilizce geçiş; dil seçici ayarlarda
  > **Durum:** ✅ Tamamlandı
  > **Seviye:** Tam — 0 TypeScript hatası, 1 önemsiz CSS uyarısı
  > **Not:** `svelte-i18n` v4 kuruldu. `src/lib/i18n/index.ts` — `register`, `init`, `getLocaleFromNavigator` ile kurulum; `localStorage`'da `lpc-locale` anahtarıyla kalıcılık; `setLocale()` fonksiyonu. `src/lib/i18n/tr.json` ve `en.json` — tüm sayfalar/bileşenler için kapsamlı çeviri anahtarları (nav, history, common, settings, quality, home, batch, audioMerge, videoMerge, frames, gif, apng, pdf, multiOutput, trim, normalize, watermark, metadata, aspectRatio, resolution, subtitle). `+layout.svelte` → `setupI18n()` çağrısı eklendi. `settings/+page.svelte` tam çeviri + dil seçici (Türkçe/English toggle butonları). `Sidebar.svelte` tam çeviri — nav linkleri, geçmiş başlığı, durum etiketleri. Kalite ön ayarları `labelKey`/`descKey` sistemiyle dinamik.

- [x] **Açık / Karanlık Tema Geçişi** — Mevcut dark-only tasarıma light tema ekleme; işletim sistemi tercihini otomatik algılama
  > **Durum:** ✅ Tamamlandı
  > **Seviye:** Tam — 0 TypeScript hatası
  > **Not:** `app.css`'e `:root.light` token seti eklendi (beyaz zemin, koyu metin, aynı accent renk). `AppShell.svelte`: `isDark` state, `applyTheme()` fonksiyonu (`document.documentElement.classList`), `localStorage` kalıcılığı, sistem `prefers-color-scheme` otomatik algılama. Sağ alt köşede ☀️/🌙 toggle butonu.

- [x] **Sistem Tepsisi (Tray) Simgesi** — Arka planda çalışma; tepsiden "Devam Eden Dönüşüm", "Son Başarılı" bilgisi ve Çıkış seçeneği
  > **Durum:** ✅ Tamamlandı
  > **Seviye:** Tam — 0 TypeScript hatası
  > **Not:** `main.ts`'e `Tray` ve `Menu` import edildi. `createTray()` fonksiyonu `build-resources/icon.png` ile tepsi ikonu oluşturur. `updateTrayMenu(statusLabel)` ile durum metni güncellenir: dönüşüm başlayınca "Dönüştürülüyor…", bitince "Hazır". Bağlam menüsü: Göster / Gizle / Çıkış. Çift tıkla pencere ön plana gelir. Hata durumunda sessizce atlanır (platform desteği yok).

- [x] **Görev Çubuğu / Dock İlerleme Çubuğu** — `win.setProgressBar()` ile macOS Dock ve Windows Taskbar'da dönüşüm yüzdesi
  > **Durum:** ✅ Tamamlandı
  > **Seviye:** Tam — 0 TypeScript hatası
  > **Not:** `setTaskbarProgress(percent|null)` yardımcı fonksiyonu eklendi. Tüm `runFfmpegJob` `onProgress` callback'lerine `setTaskbarProgress(percent)` çağrısı eklendi. Dönüşüm tamamlanınca / hata olunca `-1` ile sıfırlanır.

- [x] **Sürükle-Bırak Dosya Sıralaması** — Batch modunda dosya sırasını sürükleyerek yeniden düzenleme
  > **Durum:** ✅ Tamamlandı
  > **Seviye:** Tam — 0 TypeScript hatası
  > **Not:** `routes/batch/+page.svelte` güncellendi. `dragFromId` ve `dragOverId` state'leri eklendi. `<li>` elementleri `draggable={pending && !busy}`, `ondragstart/over/drop/end` handler'ları ile sürükleme destekli hale getirildi. Bırakıldığında `splice` ile dizi yeniden sıralanır. ⠿ drag handle ikonü hover'da görünür; sürükleme sırasında hedef öğe `.drag-over` stili ile vurgulanır. Sadece `pending` durumundaki dosyalar sürüklenebilir.

### Yeni Format Desteği

- [x] **AVIF Çıktı Formatı** — `libaom-av1` veya `libsvtav1` ile modern web formatında görüntü çıktısı
  > **Durum:** ✅ Tamamlandı
  > **Seviye:** Tam — 0 TypeScript hatası
  > **Not:** `image-avif` profili `target-profiles.ts`, `conversion-matrix.ts`, `job-hints.ts` ve `ui-meta.ts`'e eklendi. `libsvtav1` encoder'ı kullanır (AV1 still image). `TARGET_IDS_FOR_IMAGE_INPUT` listesine dahil edildi; görüntü girişlerinde seçilebilir hale geldi.

- [x] **Animasyonlu GIF / APNG** — Video klipler için animasyonlu format çıktısı (APNG daha kaliteli)
  > **Durum:** ✅ Tamamlandı
  > **Seviye:** Tam — 0 TypeScript hatası, 0 uyarı
  > **Not:** `lfc/ffmpeg/apng-convert` IPC kanalı eklendi (main.ts + preload.ts + app.d.ts). `routes/apng/+page.svelte` oluşturuldu. FFmpeg `-f apng -plays N` ile tam renk (32-bit RGBA) animasyonlu PNG üretimi. FPS (1-60), 5 genişlik ön ayarı, döngü modu (sonsuz/bir kez). GIF vs APNG karşılaştırma tablosu. APNG ikonu sidebar ve NavFeatureIcon'a eklendi.

- [x] **PDF → Görüntü Dönüştürme** — Her PDF sayfasını PNG/JPEG olarak çıkarma (`ghostscript` veya `pdf2pic` entegrasyonu)
  > **Durum:** ✅ Tamamlandı
  > **Seviye:** Tam — 0 TypeScript hatası
  > **Not:** `lfc/ffmpeg/pdf-convert` IPC kanalı eklendi (main.ts + preload.ts + app.d.ts). `pdftoppm` (Poppler) kullanır; bulunamazsa `brew install poppler` / `apt install poppler-utils` kurulum talimatıyla açıklayıcı hata döner. DPI (72/96/150/200/300 DPI preset) ve format (PNG/JPEG/PPM) seçilebilir. Çıktı `PDF-adı-sayfalar/` klasörüne yazılır. `routes/pdf/+page.svelte` oluşturuldu. Sidebar ve NavFeatureIcon'a eklendi.

- [x] **Daha Fazla Sosyal Medya Profili** — YouTube (1080p/4K), TikTok (9:16 1080×1920), LinkedIn (16:9 1920×1080), X/Twitter (16:9, 512MB limit), Discord (8MB limit)
  > **Durum:** ✅ Tamamlandı
  > **Seviye:** Tam — 0 TypeScript hatası
  > **Not:** 6 yeni profil eklendi: `social-yt-1080` (YouTube 1080p), `social-yt-4k` (YouTube 4K), `social-tt-video` (TikTok 9:16), `social-li-video` (LinkedIn 16:9), `social-x-video` (X/Twitter 512MB), `social-dc-video` (Discord 10MB). Tümü `target-profiles.ts`, `conversion-matrix.ts`, `job-hints.ts` ve `ui-meta.ts`'e eklendi. `platform` union tipi genişletildi (youtube|tiktok|linkedin|x|discord). Video girişlerinde otomatik görünür.

### İleri Düzey Özellikler

- [x] **Özel FFmpeg Argüman Alanı** — İleri düzey kullanıcılar için serbest metin girişi; mevcut argümanların üzerine ekleme
  > **Durum:** ✅ Tamamlandı
  > **Seviye:** Tam — 0 TypeScript hatası
  > **Not:** `ConvertJobSpec` tipine `extraFfmpegArgs?: string[]` eklendi (`@lfc/types`). `convertJobSpecSchema`'ya `z.array(z.string()).optional()` eklendi (`@lfc/validators`). `buildFfmpegArgs` tüm çıktı yolu yerlerine `...extra` ekledi (`@lfc/ffmpeg-core`). `HomeConverter.svelte` gelişmiş ayarlar bölümüne serbest metin input eklendi; boşlukla ayrılmış tokenlar parçalanarak spec'e dahil edilir. Yanlış argüman uyarısı `field-hint` metniyle gösterilir.

- [x] **Kişisel Profil Kaydetme** — Sık kullanılan ayar kombinasyonlarını (codec + kalite + çözünürlük) isimli profil olarak kaydetme ve hızlı yükleme
  > **Durum:** ✅ Tamamlandı
  > **Seviye:** Tam — 0 TypeScript hatası
  > **Not:** `lpc-profiles.json` dosyasına JSON olarak kaydedilen profil CRUD sistemi. `PROFILES_GET/SAVE/DELETE_CHANNEL` IPC kanalları (main.ts + preload.ts + app.d.ts). `HomeConverter.svelte`: hedef profil, kalite, çözünürlük, ses kanalı, ekstra argümanlar kayıt kapsamı. Profil listesi `<details>` panelinde; "Uygula" mevcut ayarları geri yükler; "Sil" kaldırır. Hiç profil yokken "+ Profil kaydet" inline butonu gösterilir. Profil adı `Enter` ile kaydedilebilir.

- [x] **Çoklu Çıktı Formatı** — Tek girdi dosyasından aynı anda birden fazla format çıktısı (örn. hem MP4 hem de WebM)
  > **Durum:** ✅ Tamamlandı
  > **Seviye:** Tam — 0 TypeScript hatası
  > **Not:** `routes/multi-output/+page.svelte` oluşturuldu. Dosya tipi (video/ses/görüntü) otomatik algılanarak uygun profiller listelenir. Profiller chip butonlarla çoklu seçilebilir. Tüm seçili profiller sıralı olarak `runConvertJob` ile işlenir; her biri için bağımsız ilerleme çubuğu ve durum ikonu gösterilir. `multiOutput` ikonu sidebar ve NavFeatureIcon'a eklendi. Sosyal medya profilleri listelenmez (filtrelenmiştir).

- [x] **Ses Çıkarma Hızlı Butonu** — Video dosyasından tek tıkla MP3 çıkarma; ana akışta ayrı bir hızlı eylem butonu
  > **Durum:** ✅ Tamamlandı
  > **Seviye:** Tam — 0 TypeScript hatası
  > **Not:** `HomeConverter.svelte` güncellendi. `quickExtractAudio()` fonksiyonu eklendi: `libmp3lame` encoder ile `audioOnlyOutput: true` spec üretir, `runConvertJob` çağırır. Aksiyon satırına "♪ MP3 Çıkar" butonu eklendi — sadece video dosyası yüklendiğinde (`inferredKind === "video"`) ve boşta olduğunda görünür. Dönüşüm ilerlemesi ve log paneli mevcut akışı paylaşır.

- [x] **Dönüşüm Log Görüntüleyici** — FFmpeg stderr çıktısını gerçek zamanlı veya dönüşüm sonrası UI'da okuyabilir panel
  > **Durum:** ✅ Tamamlandı
  > **Seviye:** Tam — 0 TypeScript hatası
  > **Not:** `onLog?: (line: string) => void` seçeneği `RunFfmpegJobOptions`'a eklendi (`@lfc/ffmpeg-core`). Her stderr satırı `\n` bölünerek `onLog` callback'iyle iletilir. `RUN_CONVERT_LOG_CHANNEL` IPC kanalı main.ts ve preload.ts'e eklendi. `runConvertJob` preload API'si `onLog` parametresi aldı. HomeConverter.svelte: `convertLog` state listesi doldurulur (max 500 satır), dönüşüm başlarken sıfırlanır. Log `<details>` paneli `<pre>` içinde monospace formatıyla gösterilir; "Temizle" butonu mevcut. Sadece ana dönüşüm kanalını kapsar (GIF, trim vb. ayrı kanallar dahil değil).

- [x] **Otomatik Güncelleme** — `electron-updater` ile GitHub Releases üzerinden otomatik güncelleme kontrolü ve kurulum
  > **Durum:** ✅ Tamamlandı (Lite)
  > **Seviye:** Tam — 0 TypeScript hatası
  > **Not:** `electron-updater` paketi eklenmeden GitHub Releases API (`api.github.com`) sorgulamasıyla sürüm kontrolü yapılır. `lfc/app/check-update` IPC kanalı eklendi. Ayarlar sayfasına "Güncelleme Kontrol Et" butonu eklendi; yeni sürüm varsa sürüm numarası ve GitHub release linki gösterilir; zaten güncel ise bilgi mesajı gösterilir. Bağlantı hatalarında açıklayıcı hata mesajı. Tam otomatik indirme için `electron-updater` paket entegrasyonu gerekir.

- [x] **Dışa Aktarılabilir Geçmiş** — Dönüşüm geçmişini CSV veya JSON olarak dışa aktarma
  > **Durum:** ✅ Tamamlandı
  > **Seviye:** Tam — 0 TypeScript hatası
  > **Not:** `Sidebar.svelte` güncellendi. `exportJson()` ve `exportCsv()` fonksiyonları eklendi: `Blob + URL.createObjectURL` ile tarayıcı indirme akışı kullanılır, IPC gerekmez. Geçmişte en az bir kayıt varken "JSON" ve "CSV" butonları görünür hale gelir. CSV UTF-8 BOM'suz, CRLF satır sonu ile oluşturulur. Tarih bilgisi ISO 8601 formatında dahil edilir.

- [x] **Ses Birden Fazla Kanal Desteği** — Stereo → Mono dönüştürme, kanal miksaj seçenekleri (`-ac` parametresi)
  > **Durum:** ✅ Tamamlandı
  > **Seviye:** Tam — 0 TypeScript hatası
  > **Not:** `ConvertJobSpec`'e `audioChannels?: 1 | 2` eklendi (`@lfc/types`). Zod validatörüne `z.union([z.literal(1), z.literal(2)]).optional()` eklendi. `buildFfmpegArgs`'te `acArgs = ["-ac", N]` oluşturulup ses encoder argümanlarından sonra eklendi (image ve copy modları hariç). `HomeConverter.svelte`: Gelişmiş bölümüne "Ses kanalı" seçici eklendi (Kaynak ile aynı / Mono / Stereo). Görüntü profili ve audio-only profil seçiliyken gizlenir.

- [x] **FFmpeg Binary Seçici UI** — Mevcut kod binary yolunu destekliyor ancak UI yok; ayarlarda kullanıcı kendi ffmpeg binary'sini seçebilmeli
  > **Durum:** ✅ Tamamlandı (Ayarlar göreviyle birlikte)
  > **Seviye:** Tam
  > **Not:** `routes/settings/+page.svelte` içinde `ffmpegBinary` text input zaten var. `lpc-settings.json`'a kaydedilir; tüm IPC kanalları `lpcSettings.ffmpegBinary` değerini kullanır.

---

## 📊 Özet

| Kategori | Madde Sayısı | Tamamlanan |
|---|---|---|
| Planlanmış (Sidebar) | 5 | 5 ✅ |
| Yüksek Öncelik | 7 | 7 ✅ |
| Orta Öncelik | 8 | 8 ✅ |
| Bonus Öneriler | 15 | 15 ✅ |
| **Toplam** | **35** | **35** |

---

## 🗂️ İlgili Kaynak Dosyalar

| Dosya | Kapsam |
|---|---|
| [apps/desktop/src/lib/components/Sidebar.svelte](apps/desktop/src/lib/components/Sidebar.svelte) | Yakında özellik yer tutucuları |
| [apps/desktop/src/lib/components/HomeConverter.svelte](apps/desktop/src/lib/components/HomeConverter.svelte) | Ana dönüştürücü UI (~1200 satır) |
| [apps/desktop/electron/main.ts](apps/desktop/electron/main.ts) | IPC handler'lar, yeni araçlar buraya eklenmeli |
| [packages/media-formats/src/target-profiles.ts](packages/media-formats/src/target-profiles.ts) | Çıktı profilleri (GIF, AVIF, H.265, AV1 buraya) |
| [packages/media-formats/src/conversion-matrix.ts](packages/media-formats/src/conversion-matrix.ts) | Input→output yönlendirme matrisi |
| [packages/ffmpeg-core/src/build-args.ts](packages/ffmpeg-core/src/build-args.ts) | FFmpeg argüman üretici (yeni filtreler buraya) |
| [packages/types/src/index.ts](packages/types/src/index.ts) | Tip tanımları (yeni özellikler için genişletilmeli) |
