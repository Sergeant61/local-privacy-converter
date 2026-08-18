# Local Privacy Converter — Denetim Bulguları

Denetim tarihi: **18 Ağustos 2026** · Sürüm: **v1.1.3** · Commit: `1b26a96` · Platform: macOS arm64

Beş bağımsız agent, fixture üzerinde **gerçek ffmpeg/ffprobe çalıştırarak** kodu sınadı.
Kritik ve yüksek bulguların her biri en az iki agent tarafından ayrı ayrı yeniden üretildi.
Bu denetimde **hiçbir kod değişikliği yapılmadı** — dosya yalnızca teşhis ve takip içindir.

📄 Ayrıntılı rapor: https://claude.ai/code/artifact/0e840e32-f993-43e4-bd7c-d137532caee4

---

## Nasıl kullanılır

Bir bulgu kapatıldığında kutusunu işaretle ve altına kapanış notu düş:

```markdown
- [x] **D-XX** — (bulgu başlığı)
  > **Kapatıldı:** 2026-08-20 · commit `abc1234` · örnek: virgüller `\,` ile kaçışlandı, /aspect-ratio ve ana dönüştürücüde 16:9 / 9:16 / 1:1 doğrulandı.
```

Bulgu ID'leri (`D-01` … `D-24`) sabittir, yeniden numaralandırma.

---

## 📊 Özet

| Önem | Adet | Kapatılan |
|---|---|---|
| 🔴 Kritik | 1 | 0 |
| 🟠 Yüksek | 6 | **3** |
| 🟡 Orta | 17 | **1** |
| **Toplam** | **24** | **4** |

**Kapatılanlar (18 Ağustos 2026):** D-02, D-03, D-04 — üçü de gerçek FFmpeg koşumuyla doğrulandı · D-21 — CI kapısı ve duman testleri eklendi.

Temel ölçümler: `pnpm typecheck` **8/8 temiz** · `pnpm lint` **0 hata / 2 uyarı** · **34 test geçiyor** · CI kapısı **aktif**

---

## 🔴 Kritik

- [ ] **D-01** — Renderer kalıcı olarak keyfi bir ikili çalıştırabiliyor
  > **Konum:** [apps/desktop/electron/ffmpeg-resolve.ts:58](apps/desktop/electron/ffmpeg-resolve.ts#L58) · [apps/desktop/electron/main.ts:504](apps/desktop/electron/main.ts#L504) · 13 handler
  > **Bulgu:** `resolveFfmpegExecutable()` verilen yolu allowlist, varlık veya imza kontrolü olmadan aynen döndürüyor. `settings/set` kanalı `ffmpegBinary` alanını yalnızca `typeof === "string"` kontrolüyle diske **kalıcı** yazıyor. Sonrasında 13 handler bu değeri spawn edilecek ikili olarak kullanıyor — tek bir doğrulanmamış IPC çağrısı kalıcı arka kapıya dönüşüyor.
  > **Bağlam:** Sömürü için önce renderer'da kod çalıştırma gerekiyor; tam da o katmanda `sandbox`, CSP, `setWindowOpenHandler`, `will-navigate` **hiç yok** (bkz. D-07).
  > **Öneri:** `ffmpegBinary` override'ı renderer'dan kabul edilmesin; yalnızca gömülü ikili veya kullanıcının dosya diyaloğuyla açıkça seçtiği yol kullanılsın.

---

## 🟠 Yüksek — kullanıcı görünür bozulma

- [x] **D-02** — En-boy oranı dönüşümlerinin tamamı çıktı üretmeden düşüyor
  > **✅ Kapatıldı:** 2026-08-18 · [build-args.ts:16-19](packages/ffmpeg-core/src/build-args.ts#L16) · `if()` ifadelerindeki virgüller `\,` ile kaçırıldı.
  > **Doğrulama:** 16:9 / 9:16 / 1:1 / 4:3 — dördü de exit 0 ve geçerli çıktı. 1920×1080 kaynakta ölçüm: 9:16 → 608×1080, 1:1 → 1080×1080, 4:3 → 1440×1080. Öncesinde hiçbiri dosya üretmiyordu.
  > **Konum:** [packages/ffmpeg-core/src/build-args.ts:17](packages/ffmpeg-core/src/build-args.ts#L17)
  > **Bulgu:** Üretilen crop ifadesindeki virgüller kaçışlanmamış. FFmpeg filtre grafiğinde virgül filtre ayracıdır, ifade ortadan bölünüyor. 16:9 / 9:16 / 1:1 / 4:3 — hepsi başarısız, hiç dosya oluşmuyor.
  > **Kanıt:** `-vf crop=if(gt(iw*9,ih*16),ih*16/9,iw):...` → `[AVFilterGraph] No such filter: 'ih*16)'` → çıktı yok. Virgüller `\,` ile kaçışlanınca aynı komut exit 0 ve geçerli çıktı veriyor. ffmpeg 7.0 ve 8.0'da aynı.
  > **Etki:** Yalnızca `/aspect-ratio` değil; ana dönüştürücüdeki oran seçicisi de aynı kodu besliyor.

- [x] **D-03** — Trim seçilen aralık yerine bitiş değerini süre olarak uyguluyor
  > **✅ Kapatıldı:** 2026-08-18 · [main.ts:1128-1141](apps/desktop/electron/main.ts#L1128) · `-to endSec` yerine `-t (endSec - startSec)`. Ayrıca `endSec <= startSec` durumunda artık hata dönüyor.
  > **Doğrulama:** 3→7 sn artık **4.07 sn** (önce 7.0 sn). 0→5, 2→10, 8→12, 1→2 aralıklarının hepsi doğru; hem stream-copy hem re-encode. Kalan ~0.067 sn sapma stream-copy'nin kare sınırı, doğası gereği.
  > **Konum:** [apps/desktop/electron/main.ts:1129](apps/desktop/electron/main.ts#L1129)
  > **Bulgu:** `-ss` girdi tarafında, `-to` çıktı tarafında. Girdi tarafında arama yapılınca zaman damgaları sıfırlandığı için `-to` bitiş noktası değil **süre** anlamına geliyor. Hem stream-copy hem re-encode yolunda aynı hata.
  > **Kanıt:** `-ss 3 -i src -to 7 -c copy` → 7.067 s (beklenen 4.0) · `-ss 3 -i src -to 7` re-encode → 7.000 s · doğrusu `-ss 3 -i src -t 4` → 4.067 s
  > **Ek not:** Stream-copy'de başlangıç keyframe'e kayıyor; bu stream-copy'nin doğası ama UI "hızlı" derken bunu belirtmiyor.

- [x] **D-04** — Sosyal medya boyut limiti videoyu sessizce kesiyor ve limiti yine aşıyor
  > **✅ Kapatıldı:** 2026-08-18 · `-fs` tamamen kaldırıldı, yerine bitrate bütçesi geldi.
  > **Değişen dosyalar:** [build-args.ts](packages/ffmpeg-core/src/build-args.ts) (bütçe hesabı + bitrate modu kodlayıcı argümanları), [types/index.ts](packages/types/src/index.ts) (`sourceDurationSec` alanı), [validators/index.ts](packages/validators/src/index.ts) (şema), [main.ts](apps/desktop/electron/main.ts) (IPC'deki süreyi spec'e taşır).
  > **Nasıl çalışıyor:** bütçe = `MB × 1024² × 8 × 0.97`; video bitrate = bütçe ÷ süre − ses bitrate. Boyut hedefi varken CRF yerine `-b:v/-maxrate/-bufsize` kullanılıyor (ikisi birlikte kullanılamaz, CRF bitrate'i geçersiz kılardı). Yalnız-ses çıktıda `-b:a` bütçeye göre sınırlanıyor. Görüntü çıktısında boyut kısıtı hiç uygulanmıyor.
  > **Doğrulama:** gerçekçi 30 sn 1080p kaynakta 10 / 16 / 25 MB hedefleri **%94.4 / %95.3 / %95.8** doluluk ile isabet etti; üçünde de süre tam 30 sn korundu ve limit aşılmadı. Boyut hedefi yokken CRF modu değişmedi.
  > **Bilinçli tercih:** süre bilinmiyorsa kısıt **hiç** uygulanmıyor — eksik dosya vermektense sınırı aşmak yeğdir. Hesaplanan bitrate 100 kbps altına düşerse orada duruluyor (izlenemez çıktı yerine sınırı aşmak).
  > **Kalan sınır:** tek geçişli ABR. Sıkışmayan patolojik içerikte (saf gürültü) x264 kuantizasyon tavanına çarpıp bütçenin altında kalabiliyor — ölçümde %17. Gerçek video içeriğinde görülmedi; iki geçişli encode daha isabetli olurdu, ayrı iş olarak değerlendirilebilir.
  > **Konum:** [packages/ffmpeg-core/src/build-args.ts:143](packages/ffmpeg-core/src/build-args.ts#L143)
  > **Bulgu:** `targetSizeMb` doğrudan `-fs` bayrağına çevriliyor. `-fs` bitrate hedefi değil, sert yazma durdurucusu. Hiçbir yerde bitrate hesabı yok. Kullanıcı hata görmüyor, dönüşüm "başarılı" bitiyor. Üstelik mp4 muxer `moov` atomunu sınır dolduktan sonra yazdığı için çıktı **her zaman** limitin üstünde kalıyor.
  > **Kanıt:** 30.000 s kaynak + `-fs 10485760` → çıktı 3.274 s, 11.266.540 bayt, ffmpeg exit 0
  > **Etki:** Discord 10 MB, WhatsApp 16 MB, Messenger 25 MB, Instagram, Telegram
  > **Öneri:** `-fs` kaldırılsın; hedef boyut ÷ süre üzerinden bitrate hesaplanıp iki geçişli encode yapılsın.

- [ ] **D-05** — Video birleştirme uyumsuz girdilerde sessizce bozuk dosya üretiyor
  > **Konum:** [apps/desktop/electron/main.ts:780](apps/desktop/electron/main.ts#L780)
  > **Bulgu:** concat demuxer + `-c copy`, ön kontrol yok. Farklı çözünürlük/codec/fps'te ffmpeg hata vermiyor, handler `{ok:true}` dönüyor, kullanıcı "başarılı" bildirimi alıyor — ama ikinci klip yanlış çözünürlükte, yanlış hızda ve **ses akışı düşmüş** halde.
  > **Kanıt:** 1920x1080 + 640x480 → exit 0, tek video akışı, süre 9.6 s (olmalı 8.0), çıktıda ses yok
  > **Öneri:** Probe ile ön kontrol; uyuşmazlıkta filter_complex concat'e düş ya da kullanıcıyı uyar.

- [ ] **D-06** — Altyazı çıkarma en yaygın durumda çalışmıyor
  > **Konum:** [apps/desktop/electron/main.ts:1080](apps/desktop/electron/main.ts#L1080)
  > **Bulgu:** Handler sabit `-c:s copy` kullanıyor ve payload'daki `format` alanını **hiç okumuyor**. Arayüz SRT / ASS / VTT sunuyor ama hiçbirine dönüştürme yapılmıyor.
  > **Kanıt:** mov_text altyazılı MP4 (MP4'ün standart altyazı codec'i) → üç formatta da boş dosya, `Could not write header`. `-c:s copy` kaldırılınca aynı komut düzgün SRT üretiyor.
  > **Etki:** Yalnızca kaynak codec ile hedef konteynerin zaten eşleştiği dar durumda çalışıyor.

- [ ] **D-07** — 29 IPC kanalının 23'ünde şema doğrulaması yok
  > **Konum:** [apps/desktop/electron/main.ts](apps/desktop/electron/main.ts) · [packages/validators](packages/validators)
  > **Bulgu:** Zod şeması yalnızca 6 kanalda var. Doğrulanmayan 23 kanalın **13'ü doğrudan ffmpeg başlatıyor** ve giriş/çıkış yollarını renderer'dan ham alıyor. Hiçbir kanalda yol geçişi (`..`) filtresi veya kök dizin sınırlaması yok.
  > **Ayrıca:** Electron sertleştirmesi eksik — `sandbox`, CSP, `setWindowOpenHandler`, `will-navigate` kod tabanında hiç geçmiyor. `contextIsolation: true` ve `nodeIntegration: false` doğru ayarlanmış ama tek başlarına.
  > **Olumlu:** Kabuk enjeksiyonu **bulunmadı** — `spawn` her yerde `shell: false` ile çağrılıyor, aktif enjeksiyon denemeleri başarısız oldu.
  > **Öneri:** `format`, `fontColor`, `position` gibi alanlar `z.enum` olsun; çıktı yolları izin verilen kök dizine göre sınır kontrolünden geçsin.

---

## 🟡 Orta — presetler ve dönüşüm matrisi

> 17 sosyal medya presetinin tamamı gerçek koşumla sınandı: **17/17 codec ve piksel ölçüsünü tutturdu, 0/17 dosya boyutu iddiasını, 0/12 en-boy oranı iddiasını tutturdu.**

- [ ] **D-08** — Dikey (9:16) presetler en-boy oranını korumuyor
  > Sosyal presetlerde `aspectRatio` bilinçli olarak `undefined` yapıldığı için crop/pad hiç devreye girmiyor; yalnızca `scale=1080:1920` uygulanıyor. Piksel ölçüsü doğru ama SAR bozuluyor — SAR'a saygı gösteren oynatıcıda video dikey değil, yok sayan platformda yatayda ezik. Ölçüm: `social-ig-stories` → 1080x1920 ama `dar=16:9`.

- [ ] **D-09** — Görüntü presetlerinde boyut limiti hiç uygulanmıyor
  > `mjpeg`/`png`/`libwebp` encoder'ları `-fs`'ten muaf tutulmuş. WhatsApp 5 MB, Instagram 8 MB, Telegram 10 MB alanları tamamen dekoratif — sadece arayüzde metin olarak gösteriliyor.

- [ ] **D-10** — Aynı preset ekrana göre farklı çıktı veriyor
  > Sosyal preset meta verisi yalnızca `HomeConverter.svelte`'te okunuyor. [batch](apps/desktop/src/routes/batch/+page.svelte) ve [multi-output](apps/desktop/src/routes/multi-output/+page.svelte) ekranları zorunlu çözünürlüğü ve boyut limitini tamamen yok sayıyor.
  > ⚠️ *Kod okumasına dayanıyor; bu ekranlar Electron gerektirdiği için çalıştırılmadı.*

- [ ] **D-11** — Kapak resimli MP3 video sanılıyor
  > [packages/media-formats/src/probe-kinds.ts:24](packages/media-formats/src/probe-kinds.ts#L24) image-only dalını `!hasAudio` şartına bağlıyor. Album art'lı MP3 (mjpeg + mp3 akışı) "video" sınıflanıyor, arayüz 24 video hedefi sunuyor, dönüşüm **0 baytla çöküyor**. Ayrıca akışı okunamayan dosya varsayılan olarak "video" kabul ediliyor (satır 35).

- [ ] **D-12** — README ↔ kod çözünürlük çelişkileri
  > X (Twitter) ve Discord: README 1280×720 diyor, [target-profiles.ts](packages/media-formats/src/target-profiles.ts) 1920×1080 kullanıyor. README ayrıca YouTube/TikTok/LinkedIn/X/Discord için boyut limiti yazmıyor, oysa kodda var — Discord'un 10 MB'ı en kritik eksik.

---

## 🟡 Orta — argüman üretimi

- [ ] **D-13** — `width: 0` verildiğinde geçerli `height` sessizce yok sayılıyor
  > [build-args.ts:28](packages/ffmpeg-core/src/build-args.ts#L28) — `if (width ?? height)`: sıfır nullish değil ama falsy olduğu için scale filtresi hiç eklenmiyor. Kullanıcı 360p ister, orijinal çözünürlükte çıktı alır. Validator width/height/fps için pozitiflik veya üst sınır koymuyor; `fps: 1000` de geçiyor.

- [ ] **D-14** — Video girdisinden tek kare görüntü çıkışı exit 234 veriyor
  > [build-args.ts:177](packages/ffmpeg-core/src/build-args.ts#L177) görüntü dalında `-frames:v 1` yok. PNG ve JPEG hedefleri ilk kareyi yazıp ikinci karede düşüyor — ama diskte geçerli bir kısmi dosya bırakıyor. Aynı girdiyle `libwebp` başarılı oluyor: üç görüntü hedefi üç farklı davranış.

- [ ] **D-15** — AVIF görüntü dalına düşmüyor, video dalına düşüyor
  > Görüntü kontrolü yalnızca png/mjpeg/libwebp'i kapsıyor. Sesli MP4'ten AVIF üretildiğinde `-c:a aac` ekleniyor, `-an` eklenmiyor — sonuç iki AV1 akışlı 5 saniyelik animasyonlu dosya, durağan görüntü değil.

- [ ] **D-16** — Ölü sözleşme alanları: `copyAllStreams` ve `spec.container`
  > İkisi de hiçbir yerde okunmuyor. Remux `-map 0` içermediği için ek ses izlerini düşürüyor — oysa `@lfc/types` bu alanı "tüm akışların kopyalanması" diye tanımlıyor. Çıktı formatı yalnızca dosya uzantısından çıkarıldığı için uzantısız yolda dönüşüm hata veriyor.

- [ ] **D-17** — Donanım hızlandırma yalnızca yarım bağlı
  > `capabilities.ts` VideoToolbox'ı doğru tespit ediyor (205 encoder ayrıştırıldı) ama `-hwaccel` argümanlara hiç yansımıyor — decode hızlandırma kullanılmıyor. VideoToolbox encoder'ları ayrıca çözünürlükten bağımsız sabit `-b:v` kullanıyor; 320×240 için savurgan, 4K için düşük.

---

## 🟡 Orta — paketleme ve altyapı

- [ ] **D-18** — Güncelleme kontrolü var olmayan bir depoyu sorguluyor
  > [apps/desktop/electron/main.ts:576](apps/desktop/electron/main.ts#L576) — istek `recepozen/file-converter-api` adresine gidiyor, bu depo **HTTP 404** dönüyor. Gerçek depo `Sergeant61/local-privacy-converter` (HTTP 200, v1.1.3). Özellik üretimde tamamen ölü. Yedek URL de ([main.ts:597](apps/desktop/electron/main.ts#L597)) aynı yanlış depoyu gösteriyor.
  > **Ek hata:** [main.ts:592](apps/desktop/electron/main.ts#L592) `hasUpdate = tag !== currentVersion` — semver değil string eşitsizliği. Uzaktaki etiket **eski** olsa bile "güncelleme var" der.

- [ ] **D-19** — ffmpeg 7.0 ile ffprobe 4.x eşleştirilmiş
  > Gömülü ffmpeg 7.0, ama ffprobe `ffprobe-static` paketinden geliyor ve **üç major sürüm geride**. [ffmpeg-resolve.ts:92](apps/desktop/electron/ffmpeg-resolve.ts#L92) yorumu "hâlen FFmpeg 6.x içerir" diyor, bu da yanlış. Apple Silicon'da x64 ikilisi Rosetta ile çalışıyor. Bir ölçümde bu ffprobe'un uygulamanın kendi ürettiği AVIF'i okuyamadığı görüldü.
  > ⚠️ *İki agent farklı ffprobe sürümü raporladı (4.0.2 ve 4.4) — muhtemelen `node_modules` ile `extra-resources` kopyaları farklı. Ayrıca doğrulanmalı.*

- [ ] **D-20** — Metadata okuma ffmpeg yolunu ffprobe sanıyor
  > [apps/desktop/electron/main.ts:1342](apps/desktop/electron/main.ts#L1342) — `resolveFfprobeExecutable(lpcSettings.ffmpegBinary)`; kullanıcının ayarladığı **ffmpeg** yolu ffprobe override'ı olarak geçiriliyor. Altyazı probe'u ([main.ts:1030](apps/desktop/electron/main.ts#L1030)) doğru şekilde `undefined` geçiyor — tutarsızlık kodun kendi içinde.

- [x] **D-21** — Yayın hattında hiçbir kalite kapısı yok
  > **✅ Kapatıldı:** 2026-08-18 · [.github/workflows/ci.yml](.github/workflows/ci.yml) eklendi — main'e açılan her PR'da ve main'e her push'ta typecheck → lint → test.
  > **Beraberinde:** Vitest kuruldu ve `buildFfmpegArgs` / `buildTrimArgs` için 34 duman testi yazıldı. Testlerin regresyonu gerçekten yakaladığı, üç düzeltme tek tek geri alınarak doğrulandı (D-02 → 4, D-03 → 7, D-04 → 6 test kırılıyor). Trim mantığı test edilebilmesi için IPC handler'ından saf `buildTrimArgs` fonksiyonuna çıkarıldı.
  > **Ayrıca:** 23 lint hatası sıfıra indirildi (kapının yeşil açılabilmesi için) — bu sırada erişilemeyen bir `{#if}` dalı da bulunup silindi.
  > **Kalan eksik:** kilit dosyası uyumsuzluğu nedeniyle `--frozen-lockfile` kullanılamıyor, bkz. **D-24**.
  > [.github/workflows/release.yml](.github/workflows/release.yml) yalnızca sürüm etiketiyle tetikleniyor ve typecheck/lint/test çalıştırmadan doğrudan paketleyip yayınlıyor. PR veya push üzerinde çalışan CI hiç yok. Şu an `pnpm lint` **23 hata / 2 uyarı** veriyor ve bunu yakalayan hiçbir şey yok. Repoda **0 test dosyası** var.
  > **Not:** Bu denetimde bulunan kırık özelliklerin tamamı tür kontrolünden temiz geçiyor — ve tamamı tek bir `buildFfmpegArgs` anlık görüntü testiyle yakalanabilirdi.

- [ ] **D-22** — Ölü paketler: `@lfc/auth` ve `@lfc/billing`
  > Sıfır import eden 64 satırlık stub'lar; ikisi de sabit değer döndürüyor. Ayrıca hesap ve ücretli katman altyapısı ima ederek uygulamanın "hesapsız, tamamen çevrimdışı" konumlandırmasıyla çelişiyorlar.

- [ ] **D-23** — Arayüzde işlevsiz kontroller
  > [routes/resolution/+page.svelte:155](apps/desktop/src/routes/resolution/+page.svelte#L155) — `...(keepAspect ? {} : {})`, iki dal da boş. "En-boy oranını koru" anahtarı **hiçbir şey yapmıyor**. Ayrıca extra FFmpeg argümanları alanı `split(/\s+/)` ile bölündüğü ve tırnak desteklemediği için boşluk içeren hiçbir değer yazılamıyor (ör. `-metadata title=My Movie`).

- [ ] **D-24** — Kilit dosyası beyan edilen paket yöneticisiyle uyumsuz
  > **Konum:** [pnpm-lock.yaml](pnpm-lock.yaml) · [package.json](package.json)
  > **Bulgu:** `package.json` `pnpm@9.15.4` beyan ediyor, ama depodaki `pnpm-lock.yaml` hâlâ **lockfileVersion 5.4** (pnpm 7 formatı). pnpm 9 bu dosyayı `Ignoring not compatible lockfile` diyerek tamamen yok sayıyor.
  > **Etki:** `--frozen-lockfile` hiçbir yerde kullanılamıyor. `release.yml` ve `ci.yml` `--no-frozen-lockfile` ile çalışmak zorunda, yani **bağımlılıklar her koşumda taze çözülüyor**. Sürüm çıkarken kullanıcıya giden paketin bağımlılık ağacı, yerelde test edilenle aynı olduğunun garantisi yok; CI de tekrarlanabilir değil.
  > **Nasıl bulundu:** CI kapısı eklenirken `--frozen-lockfile` ile ilk koşum `ERR_PNPM_NO_LOCKFILE` verdi. Kilit dosyasının bu değişiklikten **önce de** 5.4 olduğu `git show` ile doğrulandı — yani mevcut bir sorun, yeni girmedi.
  > **Öneri:** pnpm 9.15.4 ile kilit dosyası yeniden üretilsin (`corepack use pnpm@9.15.4` + `pnpm install`), sonra hem `ci.yml` hem `release.yml` `--frozen-lockfile`'a geçirilsin. Bağımlılık ağacı değişebileceği için ayrı bir PR'da, paketleme testiyle birlikte yapılmalı.

---

## 🔧 Önerilen düzeltme sırası

İlk üç madde kullanıcıya şu anda yanlış dosya veriyor; dördüncüsü bunların tekrar oluşmasını engelliyor.

| # | Madde | Bulgu |
|---|---|---|
| 1 | Crop ifadesindeki virgülleri kaçışla — tek satır, iki ekranı birden onarır | D-02 |
| 2 | Trim'de `-to` yerine `-t` kullan, ya da her iki bayrağı da çıktı tarafına al | D-03 |
| 3 | `-fs`'i kaldır, yerine bitrate hesabı koy | D-04 |
| 4 | PR ve push üzerinde CI: typecheck + lint + duman testleri | D-21 |
| 5 | Her araç için tek bir `buildFfmpegArgs` anlık görüntü testi | D-21 |
| 6 | `ffmpegBinary` override'ını renderer'dan kabul etme | D-01 |
| 7 | Kalan 23 IPC kanalına Zod şeması + yol sınır kontrolü | D-07 |
| 8 | Electron sertleştirmesini tamamla (`sandbox`, CSP, pencere/gezinme engelleri) | D-07 |
| 9 | Video birleştirmede ön kontrol ekle | D-05 |
| 10 | Güncelleme kontrolünün depo adresini düzelt + semver karşılaştırması | D-18 |
| 11 | README'yi ölçülen davranışa göre güncelle | aşağıda |
| 12 | `@lfc/auth` ve `@lfc/billing` paketlerini sil | D-22 |

---

## 📝 README düzeltmeleri

Ölçülen davranışa uymayan iddialar. *(Ayrı bulgu numarası verilmedi; belge takibi için liste.)*

- [ ] `README.md:69` — "Crop **or pad**": pad desteği kodda hiç yok, crop da çalışmıyor (D-02)
- [ ] `README.md:65` — GIF "**two-pass** palette optimization": tek geçiş `filter_complex`. `TODO.md:46` da "tek geçişte" diyor
- [ ] `README.md:66` — APNG "full **32-bit** color": alfa'lı kaynakta rgba korunuyor ✅ ama opak kaynakta rgb24; koşulsuz doğru değil
- [ ] `README.md:71` — "EBU R128 loudness normalization": doğru filtre ama **tek geçiş**; ölçüm −14.5 LUFS (hedef −14). İki geçiş (measure→apply) daha doğru
- [ ] `README.md:67` — PDF "via Poppler": `pdftoppm` ne sistemde ne pakette var, kurulum notu da yok. Handler ENOENT'i yakalayıp düzgün mesaj veriyor (çökmüyor) ama araç fiilen ölü
- [ ] `README.md:114` — "Completely offline — **no network calls**": güncelleme kontrolü GitHub API'ye HTTPS isteği atıyor. `README.md:106` zaten "Auto update check" diyor — iki madde çelişiyor
- [ ] `README.md:97-98` — X ve Discord çözünürlükleri kodla çelişiyor (D-12)
- [ ] `README.md:78` — "correct codecs, resolution, **bitrate**, and file-size limits baked in": bitrate kontrolü hiç yok (sabit CRF 23), boyut limiti bozuk (D-04)
- [ ] Proje yapısı bölümü 5 paket belgeliyor, repoda 8 paket var

---

## ✅ Doğrulanan ve sorunsuz bulunanlar

Bunlar sınandı ve **geçti** — bilerek not düşülmüştür ki tekrar denetlenmesin:

| Alan | Sonuç |
|---|---|
| Kabuk enjeksiyonu | **Yok.** `spawn` her yerde `shell: false`; aktif enjeksiyon denemeleri başarısız |
| `lpc://` protokol handler'ı | Güvenli. `..` ve `%2e%2e` normalize ediliyor, 4 yük denendi, hiçbiri kök dışına çıkmadı |
| Zincir bütünlüğü | 17 rotanın tamamında sayfa → preload → IPC handler eşleşiyor, kopuk zincir yok |
| i18n | tr/en **303/303 anahtar** tam eşit, eksik veya boş değer yok |
| Sürüm tutarlılığı | Kök + desktop `package.json` = 1.1.3, yayınlanan release ile aynı |
| `prepare-ffmpeg.mjs` | Sağlam: indirme yok, npm paketinden kopyalıyor, hata durumunda sesli düşüyor, chmod doğru |
| Batch hata toleransı | Gerçekten çalışıyor: bozuk dosyayı "error" işaretleyip sonrakilere devam ediyor |
| ffmpeg 7.0 ↔ 8.0 paritesi | 12 riskli yolda **davranış farkı yok**; bulgular üretim binary'sinde de geçerli |
| Geçen araçlar | resolution, frames, watermark, audio-merge, metadata, multi-output, batch |
| Geçen presetler | 17/17 codec ve piksel ölçüsü doğru |
| Tür kontrolü | `pnpm typecheck` 8/8 temiz, svelte-check 0 uyarı |

---

## ⚠️ Bu denetimde ölçülmeyenler

Rapordaki hiçbir iddia aşağıdakilere dayanmıyor:

- **Electron uygulaması hiç açılmadı.** Tüm testler `buildFfmpegArgs` çıktısını ve handler komut şekillerini doğrudan ffmpeg'e vererek yapıldı; IPC katmanı canlı koşulmadı.
- **Batch ve multi-output preset davranışı** yalnızca kod okumasına dayanıyor (D-10).
- **Windows ve Linux paketleri** bu makinede kurulu değil; NVENC / QSV / AMF / VAAPI donanım hızlandırma iddiaları sınanamadı. macOS bundle'ında VideoToolbox dahil tüm yazılım encoder'ları mevcut.
- **Paketlenmiş uygulamanın çalışma zamanı ağ trafiği izlenmedi.** "Gizli telemetri yok" sonucu kaynak taramasına dayanıyor, canlı gözleme değil.
- **PDF aracı** çalıştırılamadı (`pdftoppm` yok).

---

## 🗂️ Denetim kapsamı

| Denetim | Yöntem | Kapsam |
|---|---|---|
| ffmpeg-core | Gerçek koşum + ffprobe doğrulama | 68 kombinasyon, 80 ffmpeg çalıştırması |
| media-formats | Gerçek koşum + ffprobe ölçüm | 17 preset, 24 dönüşüm |
| ipc-security | Statik sayım + çalışır kanıt | 29 kanal, 5 zafiyet sınıfı |
| tool-routes | Zincir eşleme + gerçek koşum | 17 rota, 14'ü çalıştırıldı |
| observer | Bağımsız yeniden üretim | 14 iddia, 4'ü ffmpeg ile |

Çalışma ağacı denetim boyunca temiz kaldı — hiçbir agent projeye dosya yazmadı, tüm çıktılar geçici dizinde tutuldu.
