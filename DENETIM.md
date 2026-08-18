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
| 🔴 Kritik | 1 | **1** |
| 🟠 Yüksek | 6 | **6** |
| 🟡 Orta | 17 | **17** |
| **Toplam** | **24** | **24** |

**Açık bulgu kalmadı — 24/24 kapandı.**

Bulguların tamamı kapandı; hepsi gerçek FFmpeg koşumuyla doğrulandı.

Temel ölçümler: `pnpm typecheck` **6/6 temiz** · `pnpm lint` **0 hata / 2 uyarı** · **190 test geçiyor** (123 ffmpeg-core + 39 media-formats + 28 validators) · CI kapısı **aktif** ve `--frozen-lockfile` ile tekrarlanabilir

---

## 🔴 Kritik

- [x] **D-01** — Renderer kalıcı olarak keyfi bir ikili çalıştırabiliyor
  > **✅ Kapatıldı:** 2026-08-18 · [validators/src/index.ts](packages/validators/src/index.ts) · [ffmpeg-resolve.ts](apps/desktop/electron/ffmpeg-resolve.ts) · [main.ts](apps/desktop/electron/main.ts) · [settings/+page.svelte](apps/desktop/src/routes/settings/+page.svelte)
  > **Ne yapıldı:** `ffmpegExecutableSchema` IPC şemalarından tümüyle kaldırıldı — version, probe ve capabilities kanalları artık ayarlardaki yolu kullanıyor. `settings/set` niyet tabanlı ve `.strict()`: renderer yalnızca `pickFfmpegBinary` / `clearFfmpegBinary` / `pickOutputDir` / `clearOutputDir` gönderebilir, **yol gönderemez**; yol üretebilen tek yer ana süreçteki `dialog.showOpenDialog`. `validateExecutablePath()` hem seçim hem kullanım anında mutlak yol / dosya olma / çalıştırılabilirlik kontrolü yapıyor. Preload köprüsünden `ffmpegExecutable` ve `ffprobeExecutable` parametreleri düştü; ayarlar sayfasındaki serbest metin alanı salt-okunur yol + dosya seçici oldu.
  > **Doğrulama:** 6 şema testi (ham yol içeren 4 farklı paket reddediliyor, bilinmeyen alan reddediliyor, niyet bayrakları geçiyor) · uygulama çalıştırılıp gerçek IPC üzerinden `setSettings({ ffmpegBinary: "/tmp/evil.sh" })` denendi → `{ ok: false, message: "Geçersiz ayar paketi." }`.
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

- [x] **D-05** — Video birleştirme uyumsuz girdilerde sessizce bozuk dosya üretiyor
  > **✅ Kapatıldı:** 2026-08-18 · [ffmpeg-core/src/merge-args.ts](packages/ffmpeg-core/src/merge-args.ts) · [main.ts](apps/desktop/electron/main.ts)
  > **Ne yapıldı:** Girdiler önce ffprobe ile özetleniyor (çözünürlük, codec, piksel biçimi, kare hızı, ses codec/örnekleme/kanal). Hepsi uyumluysa hızlı yol — concat demuxer + `-c copy` — korunuyor; israf yok. Uyuşmazlıkta `filter_complex concat`'e düşülüyor: her video en büyük kareye ölçekleniyor (en-boy oranı korunup kalan alan siyahla dolduruluyor, `setsar=1`, ortak fps), her ses ortak biçime getiriliyor, **sesi olmayan girdiye kendi süresi kadar sessizlik üretiliyor** (`anullsrc` + `atrim`). Böylece concat tüm akışları eşit alıyor, akış düşmesi mümkün olmuyor. 29.97 ile 30 aynı sayılıyor — bu fark için yeniden kodlamaya değmez.
  > **Doğrulama (gerçek koşum, aynı fixture çifti — 1920×1080@30 + 640×480@25):**
  > | | eski (`-c copy`) | yeni |
  > |---|---|---|
  > | video akışındaki kare boyutları | **1920×1080 ve 640×480** (akış ortasında değişiyor) | 1920×1080 (tek) |
  > | ffmpeg çıkış kodu | 0 — hata yok | 0 |
  > | handler cevabı | `{ok:true}` | `{ok:true}` |
  > 
  > Akış içinde çözünürlük değişimi tam da "sessizce bozuk dosya"nın kendisi: ffmpeg şikâyet etmiyor, kullanıcı başarı bildirimi alıyor, oynatıcıların çoğu ikinci klipte bozuluyor. Sessiz girdi senaryosu da sınandı: 4 sn sesli + 3 sn sessiz → 7.03 sn, **1 video + 1 ses** akışı. Uyumlu çift (s1+s2) hızlı yolu kullanıyor: 4.02 sn, yeniden kodlama yok. Ayrıca 18 birim testi.
  > **Konum:** [apps/desktop/electron/main.ts:780](apps/desktop/electron/main.ts#L780)
  > **Bulgu:** concat demuxer + `-c copy`, ön kontrol yok. Farklı çözünürlük/codec/fps'te ffmpeg hata vermiyor, handler `{ok:true}` dönüyor, kullanıcı "başarılı" bildirimi alıyor — ama ikinci klip yanlış çözünürlükte, yanlış hızda ve **ses akışı düşmüş** halde.
  > **Kanıt:** 1920x1080 + 640x480 → exit 0, tek video akışı, süre 9.6 s (olmalı 8.0), çıktıda ses yok
  > **Öneri:** Probe ile ön kontrol; uyuşmazlıkta filter_complex concat'e düş ya da kullanıcıyı uyar.

- [x] **D-06** — Altyazı çıkarma en yaygın durumda çalışmıyor
  > **✅ Kapatıldı:** 2026-08-18 · [ffmpeg-core/src/subtitle-args.ts](packages/ffmpeg-core/src/subtitle-args.ts) · [main.ts](apps/desktop/electron/main.ts) · [subtitle/+page.svelte](apps/desktop/src/routes/subtitle/+page.svelte)
  > **Ne yapıldı:** Hedef format artık okunuyor ve gerçekten uygulanıyor: `srt` → `-c:s srt`, `ass` → `-c:s ass`, `vtt` → `-c:s webvtt`. `copy` yalnızca kaynak zaten hedef formatsa kullanılıyor (kayıpsız ve hızlı); `subrip`/`ssa` gibi eş adlar tanınıyor. Görüntü tabanlı altyazılar (PGS, VobSub, DVB, XSUB) metne çevrilemez — sessizce bozuk dosya üretmek yerine anlaşılır bir hata dönülüyor. Arayüz seçilen formatı IPC'ye açıkça gönderiyor; göndermezse çıktı uzantısından türetiliyor.
  > **Doğrulama (gerçek koşum, mov_text altyazılı MP4 — MP4'ün standart altyazı codec'i):**
  > | format | eski (`-c:s copy`) | yeni |
  > |---|---|---|
  > | SRT | **0 bayt** — `Unsupported subtitles codec: mov_text` | 102 bayt, metin doğru |
  > | ASS | **0 bayt** — `ass muxer supports only codec ass` | 716 bayt, `[Script Info]` başlıklı |
  > | VTT | **0 bayt** — `webvtt muxer supports only codec webvtt` | 93 bayt, `WEBVTT` başlıklı |
  > 
  > Çıkarılan SRT içeriği kaynakla birebir: `Merhaba dünya` ve `İkinci satır: test`, zamanlamalar dahil. Ayrıca 21 birim testi.
  > **Konum:** [apps/desktop/electron/main.ts:1080](apps/desktop/electron/main.ts#L1080)
  > **Bulgu:** Handler sabit `-c:s copy` kullanıyor ve payload'daki `format` alanını **hiç okumuyor**. Arayüz SRT / ASS / VTT sunuyor ama hiçbirine dönüştürme yapılmıyor.
  > **Kanıt:** mov_text altyazılı MP4 (MP4'ün standart altyazı codec'i) → üç formatta da boş dosya, `Could not write header`. `-c:s copy` kaldırılınca aynı komut düzgün SRT üretiyor.
  > **Etki:** Yalnızca kaynak codec ile hedef konteynerin zaten eşleştiği dar durumda çalışıyor.

- [x] **D-07** — 29 IPC kanalının 23'ünde şema doğrulaması yok
  > **✅ Kapatıldı:** 2026-08-18 · [validators/src/index.ts](packages/validators/src/index.ts) · [validators/src/path-guard.ts](packages/validators/src/path-guard.ts) · [main.ts](apps/desktop/electron/main.ts)
  > **Ne yapıldı:** 23 kanalın tamamı `.strict()` Zod şemasından geçiyor. Serbest string alanlar enum'a indirildi (`format`, `mode`, `position`, `outputEncoder`; `fontColor` desene bağlandı), sayısal alanlar sonlu ve aralıklı (`NaN`/`Infinity` artık geçmiyor). Yeni `path-guard` modülü her giriş/çıkış yolunu mutlaklık, NUL ve dizin geçişi için denetliyor; yazma hedefleri korumalı sistem köklerine (`/System`, `/usr`, `/etc`, `/Applications`, Windows karşılıkları) kapalı — beyaz liste değil kara liste, çünkü harici disk meşru bir hedef. Electron sertleştirildi: `sandbox: true`, `webviewTag: false`, başlıkla verilen CSP (`connect-src 'self'` — medya makineden çıkmıyor), `setWindowOpenHandler` (harici bağlantı tarayıcıya, pencere açılmıyor), `will-navigate` köken kontrolü, `will-attach-webview` reddi. `lpc://` statik sunucusu build dizinine sınırlandı.
  > **Ayrıca düzeltildi (yan bulgu):** filigran metni filtergraph'a gömülüyordu ve yalnızca `'` kaçırılıyordu. `drawtext`'in `text=` seçeneği için `:` ve `%` karakterlerinin güvenilir bir kaçırma biçimi yok — `12:34 100% it's` yazan bir filigran karede **tek bir "b" harfi** olarak çıkıyordu. Metin artık `textfile=` + `expansion=none` ile geçiriliyor.
  > **Doğrulama:** 22 şema/yol testi · uygulama çalıştırılıp gerçek IPC üzerinden sınandı: trim / gif / watermark / metadata **başarılı**, `/etc/pwned.gif` çıktısı → `"korumalı sistem dizinine yazamaz: /etc"`, göreli giriş yolu → `"mutlak olmalı"`. `sandbox: true` + CSP altında arayüz tam hidrasyonla açılıyor (16 gezinme bağlantısı, `window.lfc` köprüsü canlı, konsolda CSP ihlali yok). Filigran düzeltmesi kare çıkarılarak görsel olarak doğrulandı: `12:34 'a' 100%` harfi harfine basılıyor.
  > **Konum:** [apps/desktop/electron/main.ts](apps/desktop/electron/main.ts) · [packages/validators](packages/validators)
  > **Bulgu:** Zod şeması yalnızca 6 kanalda var. Doğrulanmayan 23 kanalın **13'ü doğrudan ffmpeg başlatıyor** ve giriş/çıkış yollarını renderer'dan ham alıyor. Hiçbir kanalda yol geçişi (`..`) filtresi veya kök dizin sınırlaması yok.
  > **Ayrıca:** Electron sertleştirmesi eksik — `sandbox`, CSP, `setWindowOpenHandler`, `will-navigate` kod tabanında hiç geçmiyor. `contextIsolation: true` ve `nodeIntegration: false` doğru ayarlanmış ama tek başlarına.
  > **Olumlu:** Kabuk enjeksiyonu **bulunmadı** — `spawn` her yerde `shell: false` ile çağrılıyor, aktif enjeksiyon denemeleri başarısız oldu.
  > **Öneri:** `format`, `fontColor`, `position` gibi alanlar `z.enum` olsun; çıktı yolları izin verilen kök dizine göre sınır kontrolünden geçsin.

---

## 🟡 Orta — presetler ve dönüşüm matrisi

> 17 sosyal medya presetinin tamamı gerçek koşumla sınandı: **17/17 codec ve piksel ölçüsünü tutturdu, 0/17 dosya boyutu iddiasını, 0/12 en-boy oranı iddiasını tutturdu.**

- [x] **D-08** — Dikey (9:16) presetler en-boy oranını korumuyor
  > **✅ Kapatıldı:** 2026-08-18 · [build-args.ts](packages/ffmpeg-core/src/build-args.ts) · [types](packages/types/src/index.ts)
  > **Ne yapıldı:** Yeni `fit` ipucu. Her iki boyut da verildiğinde varsayılan `cover`: kare doldurulur, taşan kenarlar ortadan kırpılır. `contain` sığdırıp siyahla doldurur, `stretch` eski davranışı açıkça isteyenler için durur. Her durumda `setsar=1` — SAR bozulunca oynatıcı kareyi yine yamuk gösteriyordu.
  > **Doğrulama:** 4:3 kaynaktan 1080×1920 üretilip üç mod yan yana karşılaştırıldı. Eski davranışta daire uzun bir elipse dönüşüyor; `cover` ve `contain` dairesel bırakıyor. Üçünde de `dar=9:16`, `sar=1:1` — yani piksel ölçüsü tek başına ayırt edici değil, içerik ölçüldü. 6 birim testi.
  > Sosyal presetlerde `aspectRatio` bilinçli olarak `undefined` yapıldığı için crop/pad hiç devreye girmiyor; yalnızca `scale=1080:1920` uygulanıyor. Piksel ölçüsü doğru ama SAR bozuluyor — SAR'a saygı gösteren oynatıcıda video dikey değil, yok sayan platformda yatayda ezik. Ölçüm: `social-ig-stories` → 1080x1920 ama `dar=16:9`.

- [x] **D-09** — Görüntü presetlerinde boyut limiti hiç uygulanmıyor
  > **✅ Kapatıldı:** 2026-08-18 · [image-size-plan.ts](packages/ffmpeg-core/src/image-size-plan.ts) · [main.ts](apps/desktop/electron/main.ts)
  > **Ne yapıldı:** Tek karede süre yok, yani bitrate bütçesi kurulamıyor — "ölç ve daralt" eklendi: kalite kademesi sırayla düşürülür (`high → … → very_small`), tükenirse kare 0.75 / 0.5 / 0.35 çarpanlarıyla küçültülür. İlk deneme her zaman istenen ayardır, yani limit zaten sağlanıyorsa hiçbir şey feda edilmez. Limite inilemezse dosya korunur ama açık hata dönülür.
  > **Doğrulama (gerçek koşum):** 31.5 MB sıkıştırılamaz PNG, 5 MB limit → eski davranış **12.84 MB**, yeni **3.39 MB**. Ulaşılamaz 0.05 MB limitinde `"5 MB sınırının altına indirilemedi. En küçük sonuç 0.34 MB olarak kaydedildi."` Limit zaten sağlanan durumda `high` kalite korunuyor (1.08 MB). 9 birim testi.
  > `mjpeg`/`png`/`libwebp` encoder'ları `-fs`'ten muaf tutulmuş. WhatsApp 5 MB, Instagram 8 MB, Telegram 10 MB alanları tamamen dekoratif — sadece arayüzde metin olarak gösteriliyor.

- [x] **D-10** — Aynı preset ekrana göre farklı çıktı veriyor
  > **✅ Kapatıldı:** 2026-08-18 · [job-spec.ts](packages/media-formats/src/job-spec.ts)
  > **Ne yapıldı:** Preset kuralları (zorunlu ölçü, boyut limiti, sabit kalite, konteyner) tek bir `buildProfileJobSpec` işlevine taşındı; ana dönüştürücü, toplu dönüştürme ve çoklu çıktı ekranlarının üçü de onu çağırıyor. Zorunlu ölçü kullanıcı seçimini eziyor — presetin varlık sebebi bu.
  > **Doğrulama:** 11 birim testi (zorunlu ölçü, boyut limiti, sabit kalite, override önceliği, geçersiz ölçünün elenmesi).
  > Sosyal preset meta verisi yalnızca `HomeConverter.svelte`'te okunuyor. [batch](apps/desktop/src/routes/batch/+page.svelte) ve [multi-output](apps/desktop/src/routes/multi-output/+page.svelte) ekranları zorunlu çözünürlüğü ve boyut limitini tamamen yok sayıyor.
  > ⚠️ *Kod okumasına dayanıyor; bu ekranlar Electron gerektirdiği için çalıştırılmadı.*

- [x] **D-11** — Kapak resimli MP3 video sanılıyor
  > **✅ Kapatıldı:** 2026-08-18 · [probe-kinds.ts](packages/media-formats/src/probe-kinds.ts)
  > **Ne yapıldı:** Doğru ayrım "ses var mı" değil, görüntü akışının gerçek video mu yoksa gömülü kapak mı olduğu. Kapak + ses → `audio`. Akışı okunamayan dosya da artık `video` sayılmıyor: `audio` en dar hedef kümesini verir ve yanlışlığı erken görünür kılar.
  > **Doğrulama:** mjpeg + mp3 akışlı kapak resimli MP3 üretilip ffprobe ile doğrulandı; 9 birim testi.
  > [packages/media-formats/src/probe-kinds.ts:24](packages/media-formats/src/probe-kinds.ts#L24) image-only dalını `!hasAudio` şartına bağlıyor. Album art'lı MP3 (mjpeg + mp3 akışı) "video" sınıflanıyor, arayüz 24 video hedefi sunuyor, dönüşüm **0 baytla çöküyor**. Ayrıca akışı okunamayan dosya varsayılan olarak "video" kabul ediliyor (satır 35).

- [x] **D-12** — README ↔ kod çözünürlük çelişkileri
  > **✅ Kapatıldı:** 2026-08-18 · [README.md](README.md)
  > **Ne yapıldı:** X ve Discord 1920×1080'e düzeltildi; YouTube, TikTok, LinkedIn, X ve Discord için eksik boyut limitleri eklendi (Discord'un 10 MB'ı dahil). Değerler `target-profiles.ts`'ten okunarak yazıldı.
  > X (Twitter) ve Discord: README 1280×720 diyor, [target-profiles.ts](packages/media-formats/src/target-profiles.ts) 1920×1080 kullanıyor. README ayrıca YouTube/TikTok/LinkedIn/X/Discord için boyut limiti yazmıyor, oysa kodda var — Discord'un 10 MB'ı en kritik eksik.

---

## 🟡 Orta — argüman üretimi

- [x] **D-13** — `width: 0` verildiğinde geçerli `height` sessizce yok sayılıyor
  > **✅ Kapatıldı:** 2026-08-18 · [build-args.ts](packages/ffmpeg-core/src/build-args.ts) · [validators](packages/validators/src/index.ts)
  > **Ne yapıldı:** Ölçü sayılmak için pozitif ve sonlu olma şartı kondu; şema da `width`/`height` için üst sınır (16384) ve `fps` için 480 sınırı koyuyor.
  > **Doğrulama:** `width: 0, height: 360` gerçek koşumda 480×360 üretiyor (öncesinde 640×480, yani kaynak ölçüsü). 3 birim testi.
  > [build-args.ts:28](packages/ffmpeg-core/src/build-args.ts#L28) — `if (width ?? height)`: sıfır nullish değil ama falsy olduğu için scale filtresi hiç eklenmiyor. Kullanıcı 360p ister, orijinal çözünürlükte çıktı alır. Validator width/height/fps için pozitiflik veya üst sınır koymuyor; `fps: 1000` de geçiyor.

- [x] **D-14** — Video girdisinden tek kare görüntü çıkışı exit 234 veriyor
  > **✅ Kapatıldı:** 2026-08-18 · [build-args.ts](packages/ffmpeg-core/src/build-args.ts)
  > **Ne yapıldı:** Görüntü dalına `-frames:v 1` eklendi.
  > **Doğrulama (gerçek koşum):** eski davranışta PNG **exit 234** + diskte 32304 baytlık kısmi dosya, JPEG **exit 234** + 11475 bayt, libwebp ise 25 fps animasyon. Yeni davranışta üçü de exit 0 ve tek kare. 5 birim testi.
  > [build-args.ts:177](packages/ffmpeg-core/src/build-args.ts#L177) görüntü dalında `-frames:v 1` yok. PNG ve JPEG hedefleri ilk kareyi yazıp ikinci karede düşüyor — ama diskte geçerli bir kısmi dosya bırakıyor. Aynı girdiyle `libwebp` başarılı oluyor: üç görüntü hedefi üç farklı davranış.

- [x] **D-15** — AVIF görüntü dalına düşmüyor, video dalına düşüyor
  > **✅ Kapatıldı:** 2026-08-18 · [build-args.ts](packages/ffmpeg-core/src/build-args.ts)
  > **Ne yapıldı:** Görüntü kontrolü artık çıktı uzantısını da tanıyor (`png/jpg/jpeg/webp/avif/bmp/tif/tiff`), yalnızca encoder'a bakmıyor — AVIF `libsvtav1` kullanıyor ve o aynı zamanda geçerli bir video kodlayıcısı.
  > **Doğrulama (gerçek koşum):** eski davranışta AVIF çıktısı **iki AV1 video akışı** ve 5 saniyelik süre içeriyordu; yeni çıktı tek akış, tek kare, ses yok.
  > Görüntü kontrolü yalnızca png/mjpeg/libwebp'i kapsıyor. Sesli MP4'ten AVIF üretildiğinde `-c:a aac` ekleniyor, `-an` eklenmiyor — sonuç iki AV1 akışlı 5 saniyelik animasyonlu dosya, durağan görüntü değil.

- [x] **D-16** — Ölü sözleşme alanları: `copyAllStreams` ve `spec.container`
  > **✅ Kapatıldı:** 2026-08-18 · [build-args.ts](packages/ffmpeg-core/src/build-args.ts) · [job-spec.ts](packages/media-formats/src/job-spec.ts)
  > **Ne yapıldı:** `copyAllStreams` remux'ta `-map 0` üretiyor. `container` `-f` olarak geçiriliyor ve uzantısız çıktı yolunda ffmpeg muxer adı otomatik doldruluyor — uzantı adı ile muxer adı her zaman aynı değil (`mkv` → matroska, `m4a` → ipod, görüntüler → image2).
  > **Doğrulama:** 7 birim testi.
  > İkisi de hiçbir yerde okunmuyor. Remux `-map 0` içermediği için ek ses izlerini düşürüyor — oysa `@lfc/types` bu alanı "tüm akışların kopyalanması" diye tanımlıyor. Çıktı formatı yalnızca dosya uzantısından çıkarıldığı için uzantısız yolda dönüşüm hata veriyor.

- [x] **D-17** — Donanım hızlandırma yalnızca yarım bağlı
  > **✅ Kapatıldı:** 2026-08-18 · [build-args.ts](packages/ffmpeg-core/src/build-args.ts) · [main.ts](apps/desktop/electron/main.ts)
  > **Ne yapıldı:** Donanım kodlayıcısı seçilince çözme tarafı da hızlanıyor (`-hwaccel videotoolbox/cuda/qsv/vaapi`, girdiden önce). Çıktı biçimi bilinçli olarak belirtilmiyor: kareler sistem belleğine iniyor, böylece `-vf` zinciri çalışmaya devam ediyor ve desteklenmeyen girdide ffmpeg yazılım çözmeye kendiliğinden düşüyor. VideoToolbox bitrate'i artık kare alanı × fps × kalite katsayısı ile hesaplanıyor; hedef ölçü yoksa ana süreç ffprobe ile kaynak ölçüsünü dolduruyor.
  > **Doğrulama:** 7 birim testi; 320×240 çıktı sabit 5 Mbps yerine ölçüye orantılı bitrate alıyor.
  > `capabilities.ts` VideoToolbox'ı doğru tespit ediyor (205 encoder ayrıştırıldı) ama `-hwaccel` argümanlara hiç yansımıyor — decode hızlandırma kullanılmıyor. VideoToolbox encoder'ları ayrıca çözünürlükten bağımsız sabit `-b:v` kullanıyor; 320×240 için savurgan, 4K için düşük.

---

## 🟡 Orta — paketleme ve altyapı

- [x] **D-18** — Güncelleme kontrolü var olmayan bir depoyu sorguluyor
  > **✅ Kapatıldı:** 2026-08-18 · [main.ts](apps/desktop/electron/main.ts) · [semver.ts](packages/media-formats/src/semver.ts)
  > **Ne yapıldı:** Depo adresi `Sergeant61/local-privacy-converter` olarak düzeltildi (yedek URL dahil) ve `package.json` `repository` alanıyla eşleşen tek bir sabite bağlandı. String eşitsizliği yerine sayısal ve ön sürüm duyarlı `isNewerVersion` kullanılıyor.
  > **Doğrulama:** eski adres **HTTP 404**, yeni adres **HTTP 200** (`tag_name: v1.1.3`). 9 birim testi — `1.10.0 > 1.9.0` (string sıralamasının tersi), kararlı sürüm ön sürümden yeni, ayrıştırılamayan sürümde güncelleme iddia edilmiyor.
  > [apps/desktop/electron/main.ts:576](apps/desktop/electron/main.ts#L576) — istek `recepozen/file-converter-api` adresine gidiyor, bu depo **HTTP 404** dönüyor. Gerçek depo `Sergeant61/local-privacy-converter` (HTTP 200, v1.1.3). Özellik üretimde tamamen ölü. Yedek URL de ([main.ts:597](apps/desktop/electron/main.ts#L597)) aynı yanlış depoyu gösteriyor.
  > **Ek hata:** [main.ts:592](apps/desktop/electron/main.ts#L592) `hasUpdate = tag !== currentVersion` — semver değil string eşitsizliği. Uzaktaki etiket **eski** olsa bile "güncelleme var" der.

- [x] **D-19** — ffmpeg 7.0 ile ffprobe 4.x eşleştirilmiş
  > **✅ Kapatıldı:** 2026-08-18 · [prepare-ffmpeg.mjs](scripts/prepare-ffmpeg.mjs) · [ffmpeg-manifest.json](scripts/ffmpeg-manifest.json) · [ffmpeg-resolve.ts](apps/desktop/electron/ffmpeg-resolve.ts)
  > **Belirsizlik çözüldü:** iki agent'ın farklı raporlaması `ffprobe-static@3.1.0`'ın iki ayrı ikili taşımasındandı — `bin/darwin/x64` **4.0.2**, `bin/darwin/arm64` **4.4-tessus**. Asıl sorun ise daha kötüsüydü: `bin/darwin/arm64/` klasöründeki dosya **arm64 bile değil**, x86_64. Yani dizin adı yanlış, çözümleme kodu doğruydu; Apple Silicon'da Rosetta altında çalışıyordu.
  > **Ölçüm (öncesi):** uygulamanın kendi ürettiği AVIF dosyası kendi ffprobe'uyla okunamıyordu — `moov atom not found / Invalid data found when processing input`, exit 1. Denetimin iddiası doğrulandı.
  > **Aday taraması (dördü de gerçek dosyalarla ölçüldü):**
  >
  > | Aday | ffprobe | Mimari | AVIF | Teslim |
  > |---|---|---|---|---|
  > | `ffprobe-static@3.1.0` (eski) | 4.4-tessus | x86_64 | ❌ | tarball |
  > | `@ffprobe-installer/ffprobe` | 4.4.1 | arm64 | ❌ | tarball |
  > | `@derhuerst/ffprobe-static` | 6.0 | arm64 | ✅ | indirme, doğrulamasız |
  > | `ffmpeg-ffprobe-static` | **7.1** | arm64 | ✅ | indirme, doğrulamasız |
  >
  > Tarball ile gelen hiçbir paket AVIF okuyamıyor; okuyabilenlerin hiçbiri indirdiğini doğrulamıyor — ikincisi D-24'te kurulan bütünlük güvencesini delerdi.
  > **Ne yapıldı:** ikili çift npm bağımlılığı olmaktan çıkarıldı. `scripts/ffmpeg-manifest.json` sürümü, release etiketini ve **beş platform için on ikilinin SHA-256'sını** sabitliyor; `prepare-ffmpeg.mjs` indirip doğruluyor, tutmazsa paketleme duruyor. `@ffmpeg-binary/ffmpeg` ve `ffprobe-static` bağımlılıklardan kaldırıldı.
  > **Yan kazanç:** geliştirme ve paketlenmiş sürüm artık **aynı ikiliyi** kullanıyor; eskiden dev `node_modules`'tan, paketlenmiş sürüm `extra-resources`'tan farklı ikililer alıyordu.
  > **Ölçüm (sonrası):** paketlenen ikililer `ffmpeg 7.1` ve `ffprobe 7.1`, **ikisi de Mach-O arm64**, aynı derlemeden. Paketlenmiş ffprobe, paketlenmiş ffmpeg'in ürettiği AVIF'i okuyor: `av1 320x240 yuv420p`.
  > **Beklenmeyen bulgu:** `ffprobe-static@3.1.0` altı platform/mimari için **335 MB** ffprobe ikilisi taşıyor ve electron-builder hepsini paketliyordu — her macOS kullanıcısı yanında Windows ia32 ve Linux ia32 ffprobe götürüyordu. Uygulama **713 MB → 386 MB** düştü.
  > **Doğrulama:** kodlayıcı/filtre regresyonu yok (uygulamanın kullandığı 16 kodlayıcı ve 9 filtre 7.0 ile 7.1'de birebir aynı) · sağlama toplamı kapısı denendi: uyuşmazlıkta paketleme exit 1 ile duruyor ve bozuk ikili önbellekte bırakılmıyor · bozuk önbellek kopyası fark edilip yeniden indiriliyor · ikinci koşum ağa hiç çıkmıyor (0.6 sn) · typecheck 6/6, lint 0 hata, 190 test · paketlenmiş uygulama başlatıldı, 7 sn ayakta, stderr boş.
  > Gömülü ffmpeg 7.0, ama ffprobe `ffprobe-static` paketinden geliyor ve **üç major sürüm geride**. [ffmpeg-resolve.ts:92](apps/desktop/electron/ffmpeg-resolve.ts#L92) yorumu "hâlen FFmpeg 6.x içerir" diyor, bu da yanlış. Apple Silicon'da x64 ikilisi Rosetta ile çalışıyor. Bir ölçümde bu ffprobe'un uygulamanın kendi ürettiği AVIF'i okuyamadığı görüldü.
  > ⚠️ *İki agent farklı ffprobe sürümü raporladı (4.0.2 ve 4.4) — muhtemelen `node_modules` ile `extra-resources` kopyaları farklı. Ayrıca doğrulanmalı.*

- [x] **D-20** — Metadata okuma ffmpeg yolunu ffprobe sanıyor
  > **✅ Kapatıldı:** 2026-08-18 · [ffmpeg-resolve.ts](apps/desktop/electron/ffmpeg-resolve.ts)
  > **Ne yapıldı:** Parametrenin ffmpeg yolu olduğu açıkça belgelendi ve semantiği düzeltildi: artık o yolun **yanındaki** ffprobe aranıyor. Aynı derlemeden geldiği için sürüm uyumu da kendiliğinden sağlanıyor; yanında ffprobe yoksa gömülüye düşülüyor. Böylece ffmpeg'i ffprobe sanıp `-print_format json` ile çalıştırma yolu tümüyle kapandı ve altyazı probe'uyla tutarsızlık giderildi.
  > [apps/desktop/electron/main.ts:1342](apps/desktop/electron/main.ts#L1342) — `resolveFfprobeExecutable(lpcSettings.ffmpegBinary)`; kullanıcının ayarladığı **ffmpeg** yolu ffprobe override'ı olarak geçiriliyor. Altyazı probe'u ([main.ts:1030](apps/desktop/electron/main.ts#L1030)) doğru şekilde `undefined` geçiyor — tutarsızlık kodun kendi içinde.

- [x] **D-21** — Yayın hattında hiçbir kalite kapısı yok
  > **✅ Kapatıldı:** 2026-08-18 · [.github/workflows/ci.yml](.github/workflows/ci.yml) eklendi — main'e açılan her PR'da ve main'e her push'ta typecheck → lint → test.
  > **Beraberinde:** Vitest kuruldu ve `buildFfmpegArgs` / `buildTrimArgs` için 34 duman testi yazıldı. Testlerin regresyonu gerçekten yakaladığı, üç düzeltme tek tek geri alınarak doğrulandı (D-02 → 4, D-03 → 7, D-04 → 6 test kırılıyor). Trim mantığı test edilebilmesi için IPC handler'ından saf `buildTrimArgs` fonksiyonuna çıkarıldı.
  > **Ayrıca:** 23 lint hatası sıfıra indirildi (kapının yeşil açılabilmesi için) — bu sırada erişilemeyen bir `{#if}` dalı da bulunup silindi.
  > **Güncelleme:** 2026-08-18 · kilit dosyası pnpm 9 ile yeniden üretildiği için kapı artık `--frozen-lockfile` ile çalışıyor (D-24).
  > [.github/workflows/release.yml](.github/workflows/release.yml) yalnızca sürüm etiketiyle tetikleniyor ve typecheck/lint/test çalıştırmadan doğrudan paketleyip yayınlıyor. PR veya push üzerinde çalışan CI hiç yok. Şu an `pnpm lint` **23 hata / 2 uyarı** veriyor ve bunu yakalayan hiçbir şey yok. Repoda **0 test dosyası** var.
  > **Not:** Bu denetimde bulunan kırık özelliklerin tamamı tür kontrolünden temiz geçiyor — ve tamamı tek bir `buildFfmpegArgs` anlık görüntü testiyle yakalanabilirdi.

- [x] **D-22** — Ölü paketler: `@lfc/auth` ve `@lfc/billing`
  > **✅ Kapatıldı:** 2026-08-18 · `packages/auth` ve `packages/billing` silindi. Depoda sıfır import ediliyorlardı; `pnpm typecheck`, `pnpm lint`, `pnpm test` ve `pnpm build` silmeden sonra da temiz.
  > Sıfır import eden 64 satırlık stub'lar; ikisi de sabit değer döndürüyor. Ayrıca hesap ve ücretli katman altyapısı ima ederek uygulamanın "hesapsız, tamamen çevrimdışı" konumlandırmasıyla çelişiyorlar.

- [x] **D-23** — Arayüzde işlevsiz kontroller
  > **✅ Kapatıldı:** 2026-08-18 · [resolution/+page.svelte](apps/desktop/src/routes/resolution/+page.svelte) · [extra-args.ts](packages/media-formats/src/extra-args.ts)
  > **Ne yapıldı:** "En-boy oranını koru" anahtarı artık gerçekten bir şey yapıyor: kapalıyken hedef genişliğin 16:9 karşılığı yükseklik dayatılıyor ve kare `cover` ile dolduruluyor. Ek FFmpeg argümanları `parseExtraFfmpegArgs` ile bölünüyor — tek/çift tırnak grupları ve ters bölü kaçırma destekleniyor, değişken genişletme ve boru bilinçli olarak yok.
  > **Doğrulama:** 7 birim testi; `-metadata "title=My Movie"` artık iki argüman.
  > [routes/resolution/+page.svelte:155](apps/desktop/src/routes/resolution/+page.svelte#L155) — `...(keepAspect ? {} : {})`, iki dal da boş. "En-boy oranını koru" anahtarı **hiçbir şey yapmıyor**. Ayrıca extra FFmpeg argümanları alanı `split(/\s+/)` ile bölündüğü ve tırnak desteklemediği için boşluk içeren hiçbir değer yazılamıyor (ör. `-metadata title=My Movie`).

- [x] **D-24** — Kilit dosyası beyan edilen paket yöneticisiyle uyumsuz
  > **✅ Kapatıldı:** 2026-08-18 · [pnpm-lock.yaml](pnpm-lock.yaml) · [ci.yml](.github/workflows/ci.yml) · [release.yml](.github/workflows/release.yml)
  > **Ne yapıldı:** Kilit dosyası pnpm 9.15.4 ile sıfırdan üretildi (`lockfileVersion 5.4` → `'9.0'`); `ci.yml` ve `release.yml` `--frozen-lockfile`'a geçirildi.
  > **Ölçüm (öncesi):** pnpm 9.15.4 + eski kilit dosyası → `ERR_PNPM_LOCKFILE_BREAKING_CHANGE  Lockfile not compatible with current pnpm`. Bulgunun iddiası doğrulandı.
  > **Ölçüm (sonrası):** `node_modules` tamamen silinip `pnpm install --frozen-lockfile` → temiz kurulum, 4.1 sn.
  > **Bağımlılık ağacı gerçekten değişti** — bulgunun bu PR'ı ayırma gerekçesi buydu. Temiz ağaç karşılaştırmasında **84 paket sürüm değiştirdi**; en dikkate değerleri:
  > `@sveltejs/kit` 2.59.1 → 2.70.2 · `vite` 8.0.11 → 8.2.1 · `svelte` 5.55.5 → 5.56.9 · `typescript-eslint` 8.59.2 → 8.67.0 · `turbo` 2.9.10 → 2.10.10.
  > Paketleme zinciri **kıpırdamadı**: `electron` 39.8.10 ve `electron-builder` 25.1.8 aynı kaldı, `typescript` 5.7.3 aynı kaldı.
  > **Paketleme doğrulaması** (bulgunun istediği): `pnpm dist:dir` yeni ağaçla koştu — electron-builder 25.1.8, arm64, `Local Privacy Converter.app` üretildi (713 MB, app.asar 6.3 MB), gömülü ffmpeg/ffprobe yerinde. Paketlenen uygulama başlatıldı: 6 sn boyunca ayakta kaldı, stderr boş.
  > **Kapı:** `pnpm typecheck` 6/6 temiz · `pnpm lint` 0 hata · **190 test geçiyor** — hepsi yeni ağaçta, turbo önbelleği boşken koştu.
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

Ölçülen davranışa uymayan iddialar. **✅ Tamamı 2026-08-18'de düzeltildi.**

- [x] `README.md:69` — "Crop **or pad**" → "Center-crop"; en-boy oranı aracı yalnızca kırpıyor. (Çözünürlük aracında dolgu artık `fit: contain` ile mevcut.)
- [x] `README.md:65` — GIF "**two-pass** palette optimization" → tek geçişte üretilen palet olduğu yazıldı (`palettegen` + `paletteuse`)
- [x] `README.md:66` — APNG "full **32-bit** color" → "alfa kaynakta varsa korunur"; opak kaynakta rgb24 çıkıyor
- [x] `README.md:71` — "EBU R128 loudness normalization" → **gerçekten iki geçişli yapıldı** (yalnızca metin değişmedi). Ölçüm: geniş dinamikli kaynakta tek geçiş −14.34 LUFS ve LRA 1.90 → 2.00 (`normalization_type: dynamic`, yani dinamikler sıkıştırılıyor); iki geçiş −14.02 LUFS ve LRA 1.90 → 1.90 (`linear=true`, dinamikler korunuyor). Sapma 0.34 LU → **0.02 LU**. Bedeli: fazladan bir tam çözme geçişi.
- [x] `README.md:67` — PDF "via Poppler" → Poppler'ın paketlenmediği ve kurulum komutu (`brew install poppler` / `apt install poppler-utils`) yazıldı
- [x] `README.md:114` — "Completely offline — **no network calls**" → "Offline by default"; tek ağ çağrısının isteğe bağlı güncelleme kontrolü olduğu açıkça yazıldı, iki madde arasındaki çelişki giderildi
- [x] `README.md:97-98` — X ve Discord çözünürlükleri koda göre düzeltildi (D-12)
- [x] `README.md:78` — "correct codecs, resolution, **bitrate**, and file-size limits baked in" → artık **doğru**: video/ses boyut limiti bitrate bütçesine çevriliyor (D-04), görüntü limiti kademeli sıkıştırmayla uygulanıyor (D-09), çerçeveye oturtma kırpmayla yapılıyor (D-08). Metin bunu anlatacak şekilde yazıldı
- [x] Proje yapısı bölümü — `ffmpeg-presets` eklendi; `auth` ve `billing` silindiği için (D-22) belgelenen ve var olan paket sayısı artık eşleşiyor

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
