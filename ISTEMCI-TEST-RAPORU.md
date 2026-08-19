# İstemci Testi — Ekran Ekran Rapor

**Tarih:** 19.08.2026 · **Sürüm:** 1.3.0 · **Ortam:** macOS (Apple Silicon), `corepack pnpm dev`, Electron 39
**Yöntem:** Uygulama gerçekten çalıştırıldı, her ekran elle sürüldü, üretilen her dosya
diskte `ffprobe` ile doğrulandı. Test medyası projenin kendi doğrulanmış FFmpeg 7.1
ikilisiyle yerel üretildi (`~/Documents/lpc-test-medya/`, 14 dosya + 1 kasten bozuk dosya).

**Kapsam:** Kenar çubuğundaki 16 ekranın tamamı + erişilemeyen Altyazı ekranı.

---

## Özet

| | Sayı |
|---|---|
| Test edilen ekran | 17 |
| Üretilen ve diskte doğrulanan çıktı | 20 |
| Bulunan hata | 7 (1 kritik, 2 yüksek, 4 orta/düşük) |
| Düzeltilen | 3 — H-01, H-02, H-08 |

**Kritik:** Dönüştür ekranı, Mac'te seçilen hedef kodeği yok sayıyor — H.265 isteyince
H.264 üretiyor, WebM isteyince hiç üretmiyor. **Düzeltildi** (H-01).

**Durum:** H-01 · H-02 · H-08 kapatıldı, her biri birim testleriyle sabitlendi
(aşağıda "Ne yapıldı / Nasıl ölçüldü"). H-03 – H-07 açık.

---

## Bulunan hatalar

### H-01 · KRİTİK · Dönüştür ekranı hedef kodeği yok sayıyor (GPU kodlayıcı zorlaması) — DÜZELTİLDİ

**Ne oluyor:** Dosya seçilir seçilmez `autoSelectGpuEncoder()` çalışıyor ve video
kodlayıcıyı `h264_videotoolbox`'a **sabitliyor**. Bu seçim, hedef formatın kendi
kodlayıcısını eziyor (`job-spec.ts:105` → `videoEncoderOverride ?? hints.videoEncoder`).
Hedef format sonradan değiştirildiğinde override temizlenmiyor.

Kök neden — [HomeConverter.svelte:163-166](apps/desktop/src/lib/components/HomeConverter.svelte:163):

```ts
// GPU encoder öncelik sırası — ilk bulunan kullanılır
const GPU_ENCODER_PRIORITY: VideoEncoderChoice[] = [
  "h264_videotoolbox", "h264_nvenc", "h264_qsv", "h264_amf", "h264_vaapi"
];
```

Liste **yalnızca H.264** kodlayıcı içeriyor; hedef profille eşleştirme yok.

**Ölçülen sonuç:**

| UI'da seçilen hedef | Gerçekte üretilen |
|---|---|
| MP4 (H.265 / HEVC + AAC) | `codec_name=h264`, `codec_tag_string=avc1` — **sessizce yanlış** |
| WebM (VP9 + Opus) | **Dosya yok** — `Only VP8 or VP9 or AV1 video ... supported for WebM` → `Conversion failed!` |
| MP4 (H.264 + AAC) | h264 ✓ |

FFmpeg logu (uygulamanın kendi paneli, H.265 seçiliyken):
`Stream #0:0 -> #0:0 (h264 (native) -> h264 (h264_videotoolbox))`

Gelişmiş ayarlar panelinde `h264_videotoolbox — Apple GPU · çok hızlı` yazıyor, ama
panel kapalı geldiği için kullanıcı bunu görmüyor. `libx265: yüklü` rozeti de aynı
ekranda duruyor — yani kodlayıcı var, sadece kullanılmıyor.

**Etki:** Mac'teki her kullanıcı için Dönüştür ekranında H.265/AV1 seçilemiyor
(sessizce H.264 geliyor) ve WebM tümüyle kırık. Kayıpsız bir hata değil: kullanıcı
"HEVC'ye çevirdim" sanıp H.264 dosya alıyor.

**Etkilenmeyen:** Toplu Dönüştürme ve Çoklu Çıktı ekranları override göndermiyor —
Çoklu Çıktı'da H.265 gerçekten `hevc`, AV1 gerçekten `av1` üretti (doğrulandı).

**Ne yapıldı (19.08.2026):** Eşleme ekranın içinden çıkarılıp
[gpu-encoders.ts](packages/media-formats/src/gpu-encoders.ts) dosyasına, kodek
ailesine bağlı bir tabloya taşındı:

```ts
libx264   → h264_videotoolbox, h264_nvenc, h264_qsv, h264_amf, h264_vaapi
libx265   → hevc_videotoolbox, hevc_nvenc, hevc_qsv, hevc_amf, hevc_vaapi
libsvtav1 → av1_nvenc, av1_qsv, av1_amf
libvpx-vp9 → (yok — yazılımda kalır)
```

`gpuEncoderForProfile(profileId, available)` önce profilin kendi yazılım
kodlayıcısını okuyor, sonra yalnızca **o ailenin** listesinden sistemde bulunan ilk
kodlayıcıyı döndürüyor; uygun donanım kodlayıcısı yoksa `""` — yani profilin
varsayılanı korunuyor.

[HomeConverter.svelte](apps/desktop/src/lib/components/HomeConverter.svelte) tarafında
"dosya seçilince bir kez" mantığı kaldırıldı; seçim artık `targetProfileId`'ye bağlı
bir `$effect` içinde, yani hedef her değiştiğinde yeniden hesaplanıyor. Kullanıcı
kodlayıcıyı elle seçerse `encoderPickedByUser` işaretleniyor ve `$effect` bir daha
üzerine yazmıyor.

**Nasıl ölçüldü:** Eşleme artık paketin içinde olduğu için doğrudan sınanabiliyor —
[gpu-encoders.test.ts](packages/media-formats/src/gpu-encoders.test.ts), 10 test.
Hatanın kendisini yakalayan üçü: H.265 hedefinde seçilen kodlayıcı
`hevc_videotoolbox` ve adında `h264` **geçmiyor**; WebM/VP9 hem Mac hem NVIDIA
kümesinde `""` dönüyor (kırılan senaryo); Mac'te AV1 yazılımda kalıp NVIDIA'da
`av1_nvenc` seçiliyor. Onuncu test tabloyu değil **profilleri** dolaşıyor: video
üreten her profil ya kendi ailesinden bir kodlayıcı alıyor ya da hiç almıyor — profil
listesi büyüdüğünde de aynı hata tekrar edemesin diye.

Ekrandaki uçtan uca doğrulama (H.265 seçip `ffprobe` ile `codec_name=hevc` görmek,
WebM'in gerçekten yazılması) **arayüz testi onayı bekliyor** — bu turda yalnızca birim
düzeyinde doğrulandı.

---

### H-02 · YÜKSEK · Metin filigranı konumu çalışmıyor (5 konumdan 4'ü bozuk) — DÜZELTİLDİ

**Ne oluyor:** Konum ifadeleri `overlay` filtresinin değişkenleriyle yazılmış, ama metin
modunda `drawtext` kullanılıyor. `drawtext`'te `w`/`h` **ana videonun** ölçüleri
(`W`/`H` ile aynı şey); metin kutusu `text_w`/`text_h`. Sonuç:

[ipc-handlers.ts:1404-1409](apps/desktop/electron/ipc-handlers.ts:1404):

| Konum | Yazılan ifade | drawtext'te değeri | Sonuç |
|---|---|---|---|
| Sol Üst | `10:10` | 10, 10 | ✓ doğru |
| Merkez | `(W-w)/2:(H-h)/2` | 0, 0 | sol üst köşe |
| Sağ Alt | `W-w-10:H-h-10` | −10, −10 | sol üstte, kenardan taşmış |
| Sağ Üst | `W-w-10:10` | −10, 10 | sol kenarda kırpık |
| Sol Alt | `10:H-h-10` | 10, −10 | üst kenarda kırpık |

**Nasıl ölçüldü:** UI'dan "Merkez" seçilip filigran eklendi; çıktının 60. karesi
çıkarıldı — metin sol üst köşede. Ardından üç ifade doğrudan FFmpeg'e verilip
kareler yan yana konuldu: üçü de sol üstte, `W-w-10` olan görünür biçimde kırpık.

**Görsel modu etkilenmiyor:** orada gerçekten `overlay` kullanılıyor, `W/H/w/h`
anlamları doğru.

**Ne yapıldı (19.08.2026):** Tek konum tablosu ikiye ayrıldı —
[ipc-handlers.ts](apps/desktop/electron/ipc-handlers.ts). `overlayPosMap` görsel modda
olduğu gibi kalıyor (`overlay` için `W/H/w/h` zaten doğru anlamda), `textPosMap` ise
metin kutusu değişkenlerini kullanıyor:

| Konum | overlay (görsel) | drawtext (metin) |
|---|---|---|
| Sol Üst | `10:10` | `10:10` |
| Sağ Üst | `W-w-10:10` | `w-text_w-10:10` |
| Sol Alt | `10:H-h-10` | `10:h-text_h-10` |
| Sağ Alt | `W-w-10:H-h-10` | `w-text_w-10:h-text_h-10` |
| Merkez | `(W-w)/2:(H-h)/2` | `(w-text_w)/2:(h-text_h)/2` |

Seçim `mode === "image" ? overlayPosMap : textPosMap` ile yapılıyor. Yeni metin
ifadelerinin hiçbirinde iki nokta üst üste geçmiyor, bu yüzden alt taraftaki
`overlayPos.split(":")` ayrımı bozulmadan çalışmayı sürdürüyor.

**Nasıl ölçüldü:** [ipc-handlers.test.ts](apps/desktop/electron/ipc-handlers.test.ts)
içindeki filigran bloğuna 6 test eklendi. Beşi metin modunun beş konumunu tek tek
gezip `x=`/`y=` değerlerini karşılaştırıyor ve ayrıca konum ifadesinde `W` veya `H`
**geçmediğini** doğruluyor — hatanın imzası buydu. Altıncısı görsel modun `overlay`
sözdizimini koruduğunu sabitliyor (`overlay=(W-w)/2:(H-h)/2`), yani düzeltme yanlış
dala sıçramasın.

Kare çıkarıp gözle bakma turu (ölçümün ilk yapıldığı yöntem) **arayüz testi onayı
bekliyor**.

---

### H-03 · YÜKSEK · Arayüz İngilizce çalışmıyor (i18n yarım bağlı)

`tr.json` ve `en.json` 21 üst düzey anahtarla **tam çevrili**, ama `$_()` çağrısı
yalnızca `settings/+page.svelte` içinde var (36 çağrı). Diğer 15 sayfa sabit Türkçe.

**Nasıl ölçüldü:** Dil İngilizce yapıldı → kenar çubuğu İngilizceye döndü,
"Create GIF"e tıklandı → açılan sayfanın başlığı "GIF Oluştur", gövdesi baştan sona
Türkçe. İngilizce mod pratikte kullanılamaz durumda.

---

### H-04 · ORTA · Altyazı özelliğine arayüzden erişilemiyor

[Sidebar.svelte:86-101](apps/desktop/src/lib/components/Sidebar.svelte:86) listesinde
16 madde var, `/subtitle` yok. 286 satırlık sayfa ve kendi i18n bölümü duruyor ama
hiçbir yerden bağlanmıyor. D-06'da düzeltilen bitmap altyazı davranışı bu yüzden
kullanıcıya hiç ulaşmıyor.

---

### H-05 · ORTA · Dönüştür ekranı çıktıyı sessizce eziyor

Çıktı adı yalnızca `<girdi>-donusum.<uzantı>`. Aynı kaynağı farklı ayarlarla ikinci
kez dönüştürmek ilk sonucu **uyarısız siliyor**.

**Nasıl ölçüldü:** Aynı dosya önce 720p H.264, sonra 360p, sonra (H-01 nedeniyle yine
H.264 olarak) dönüştürüldü — üçü de `video-720p-10sn-donusum.mp4` oldu; her seferinde
öncekinin üzerine yazıldı.

Diğer ekranlar bunu doğru yapıyor: En-Boy `-16x9`, Kırpma `-trim-000002-000007`,
Çoklu Çıktı `-mp4-h265-aac` ekliyor. Kare Çıkarma ise aynı riski taşıyor
(`<girdi>-kareler/` klasörü sabit).

---

### H-06 · ORTA · Geçmiş kaydı yalnızca 6 ekranı kapsıyor

`recordConversion` sadece HomeConverter, En-Boy, Ses Birleştirme, Toplu Dönüştürme,
Çözünürlük ve Video Birleştirme'de çağrılıyor. GIF, APNG, kare çıkarma, kırpma,
normalizasyon, filigran, metadata, çoklu çıktı, PDF ve altyazı **hiçbir şey
kaydetmiyor** — oysa arayüzde JSON/CSV dışa aktarımı olan belirgin bir Geçmiş paneli var.

**Nasıl ölçüldü:** Oturumda ~15 iş koşuldu; JSON dışa aktarımı 9 kayıt verdi.

---

### H-07 · DÜŞÜK · Video Birleştirme yardım metni yanlış

Metin "yalnızca stream copy yapılır, girdiler aynı kodek ve çözünürlükte olmalı"
diyor. Gerçekte 720p30 + 480p25 birleştirmesi sorunsuz çalıştı (15.02s, 1280x720,
ses korundu, ikinci klip doğru letterbox'landı) — D-05'teki filtre stratejisi sayesinde.
Metin kullanıcıyı çalışan bir işten caydırıyor.

---

### Küçük gözlemler (hata sayılmadı)

- **APNG uzantısı `.apng`** — geçerli bir APNG üretiliyor ama macOS Preview ve çoğu
  görüntüleyici bu uzantıyı açmıyor; `.png` daha kullanışlı olurdu.
- **Çoklu Çıktı'da bayat sonuç** — format seçimi değiştirilince önceki çalışmanın
  "ÇIKTILAR" listesi ekranda kalıyor, yeni çalıştırılana kadar temizlenmiyor.
- **Kare Çıkarma başarı mesajı** kaç kare üretildiğini söylemiyor.

---

## Ekran ekran sonuçlar

### 1 · Dönüştür / Sıkıştır — ⚠️ H-01 (düzeltildi), H-05
Önizleme oynatıcı, ffprobe özeti (`video · h264 · aac · 10.0s`), kalite ön ayarları,
platform profilleri (WhatsApp/Instagram/Telegram/YouTube/LinkedIn/X), canlı FFmpeg logu,
"MP3 Çıkar" kısayolu, profil kaydetme. MP4 dönüşümü doğru çalıştı (2.5 MB, akışlar doğru).
H.265 ve WebM için **H-01**; çıktı adı çakışması için **H-05**.

### 2 · En-Boy Oranı — ✅
`video-dikey-720x1280.mp4` → 16:9 kırpma: 720x404, çift sayıya yuvarlanmış.
Çıktı adı `-16x9` ile ayrışıyor. Geçmişe kaydediyor.

### 3 · Çözünürlük — ✅
`gorsel-buyuk-4000x3000.png` → 854 px: 854x640 üretildi, çıktı önizlemesi gösterildi.

### 4 · Ses Birleştirme — ✅
440 Hz + 880 Hz → 10.03 s tek mp3. Süre toplamı doğru.

### 5 · Video Birleştirme — ✅ (yardım metni hariç: H-07)
720p30 + 480p25 → 15.02 s, 1280x720, ses korundu, ikinci klip letterbox'lı.

### 6 · Kare Çıkarma — ✅
10 sn videodan 1 fps ile tam **10 PNG** (`video-720p-10sn-kareler/frame-0001…0010.png`).
Başarı mesajı sayı vermiyor.

### 7 · Toplu Dönüştürme — ✅ (öne çıkan)
3 dosya verildi, biri kasten bozuk (`bozuk-dosya.mp4`, 18 bayt metin).
Sonuç: **"Tüm dosyalar işlendi — 2 başarılı, 1 hatalı."** Bozuk dosyanın satırında
FFmpeg'in kendi hatası satır içi gösterildi, işlem durmadan sıradakine geçti,
üçü de Geçmiş'e (hatalı olan `Error` durumuyla) yazıldı. Hata dayanıklılığı doğru.

### 8 · GIF Oluştur — ✅
480x270, 100 kare, palet üretimi çalışıyor.

### 9 · APNG Oluştur — ✅
480x270 geçerli APNG (2.9 MB). GIF vs APNG karşılaştırma tablosu yardımcı.
Uzantı notu yukarıda.

### 10 · Çoklu Çıktı — ✅ (öne çıkan)
Tek girdiden 3 format aynı anda: `-mp4-h264-aac.mp4` (h264), `-mp4-h265-aac.mp4`
(**hevc**), `-audio-mp3.mp3` (mp3). Üç profilin de uzantısı `.mp4` olmasına rağmen
**ad çakışması yok** — profil kimliği ada giriyor. AV1 ayrıca denendi: `av1`, 1280x720,
5.02 s. Bu ekran H-01'den etkilenmiyor.

### 11 · PDF → Görüntü — ✅ (hata yolu)
`pdftoppm` sistemde kurulu değil. Ekran açıklamasında gereksinim baştan yazılı;
çalıştırınca da uygulanabilir hata veriyor:
*"Hata: pdftoppm bulunamadı. Poppler'ı yükleyin: `brew install poppler` (macOS) veya
`apt install poppler-utils` (Linux)."*

### 12 · Video Kırpma — ✅
Süre otomatik algılandı (10sn), bitiş otomatik dolduruldu. 2→7 sn kırpma:
`-trim-000002-000007.mp4`, 5.10 s (stream copy anahtar kare hizası).
**Geçersiz aralık doğru engelleniyor:** başlangıç 8 / bitiş 3 verilince
*"Bitiş zamanı başlangıçtan büyük olmalı."* çıkıyor ve buton pasifleşiyor.

### 13 · Ses Normalizasyonu — ✅ (öne çıkan)
Ön ayarlar (Akış −14, Yayıncılık −23, Podcast −16, YouTube −14, Özel) + LUFS/True Peak/LRA
kaydırıcıları. `ses-cok-sessiz.wav` ile Podcast: **−49.9 LUFS → tam −16.0 LUFS**.
İki geçişli `loudnorm` doğru çalışıyor.

### 14 · Filigran — ⚠️ H-02 (düzeltildi)
Zor metin sınandı: `12:34 100% it's ÜĞŞÇ`. Karede **harfi harfine** çıktı —
iki nokta, yüzde, kesme işareti ve Türkçe karakterler dahil. D-07'nin
`textfile=` + `expansion=none` düzeltmesi gerçek uygulamada doğrulandı.
Konum ise çalışmıyor (**H-02**).

### 15 · Metadata Düzenleyici — ✅
Mevcut etiketler dosyadan okunup forma dolduruldu. Zor değer yazıldı:
`Şarkı "Tırnak" & 100% ; test=1` → diskte **birebir** aynı; ayrıca `date=2026`,
`genre=Rock/Pop` eklendi, `artist`/`album` korundu. Kaçırma hatası yok.

### 16 · Ayarlar — ⚠️ H-03
Uygulamadaki **tek** i18n'li ekran. Dil değişimi kenar çubuğunu çeviriyor ama
diğer sayfalar Türkçe kalıyor.

### 17 · Altyazı — ⛔ H-04
Sayfa var, menüde yok. Test edilemedi.

---

## Ek olarak doğrulananlar

- **Güncelleme kontrolü:** *"✓ Uygulamanız güncel (v1.3.0)"* — D-18 canlıda doğrulandı.
- **Geçmiş dışa aktarımı:** JSON kaydetme diyaloğu açıldı, `~/Downloads/lpc-gecmis.json`
  geçerli JSON olarak yazıldı (9 kayıt; kapsam eksiği için H-06).
- **Kenar çubuğu daraltma:** hamburger ikon şeridine düşürüp geri açıyor; Geçmiş paneli
  daraltılmış modda gizleniyor.
- **Dosya seçici filtreleri:** Toplu Dönüştürme diyaloğunda `.pdf` ve `.srt` soluk —
  desteklenmeyen tür seçtirilmiyor.

---

## Ek: arayüz düzenlemesi (19.08.2026)

Kullanıcı geri bildirimi: *"uygulama web uygulaması gibi hissettiriyor, daha native
olsun"* + *"kenar çubuğunda açık olan seçenek seçili gelmiyor."*

### H-08 · Açık sayfa kenar çubuğunda seçili görünmüyordu — DÜZELTİLDİ

`Sidebar.svelte` içinde aktif bağlantı durumu **hiç yoktu**; bağlantıların yalnızca
`:hover` biçimi vardı. Fare başka yere gidince kullanıcının hangi ekranda olduğu
arayüzden okunamıyordu.

Düzeltirken çıkan tuzak: uygulama **hash yönlendirmesi** kullanıyor
(`svelte.config.js` → `router.type: "hash"`). Bu yüzden `resolve("/frames")`
`#/frames` üretiyor ve `location.pathname` her zaman `/` kalıyor — adres
karşılaştırması hiçbir zaman tutmuyordu. Çözüm `page.route.id` ile karşılaştırmak:
rota kimliği iki yönlendirme modunda da menüdeki `href` değerlerinin aynısı.

Seçili satır macOS davranışını izliyor: pencere öndeyken vurgu mavisi, arkaya
düştüğünde nötr gri (`:root.window-inactive` vurgu tokenlarını değiştiriyor).

### Yerel (native) hissiyat için yapılanlar

| Konu | Önce | Sonra |
|---|---|---|
| Pencere kabuğu | Ayrı başlık çubuğu şeridi | `titleBarStyle: "hiddenInset"` — trafik ışıkları kenar çubuğunun içinde, üst şerit sürüklenebilir |
| Vurgu rengi | `#38bdf8 → #6366f1` gradyan (49 yerde) | Tek renk macOS sistem mavisi. `--accent-start`/`--accent-end` eşitlendi, gradyanlar tek tek düzenlenmeden düzleşti |
| Yarıçap | Kart 16px, düğme 12px | Kart 10px, düğme 6px (macOS denetim ölçüleri) |
| Yazı tipi | `"Inter", system-ui, …` | `-apple-system` önde, 13px taban, `-webkit-font-smoothing: antialiased` |
| Gölge | `0 10px 40px rgba(0,0,0,.45)` | Neredeyse yok; derinlik 0.5px kenarlıkla |
| Kenar çubuğu satırları | 0.55rem dolgu, 0.35rem boşluk, kenarlıklı hover | 0.3rem dolgu, 1px boşluk, Finder/Mail satır ölçüsü |
| İmleç | Düğmelerde el imleci | `cursor: default` — masaüstü uygulaması davranışı |
| Metin seçimi | Her yerde serbest | Kabukta kapalı; girdi/log/kod alanlarında açık |
| Odak halkası | 4px sert kenar | Vurgu renginin %45 yumuşatılmışı, 3.5px |
| Kaydırma çubuğu | Tarayıcı varsayılanı | İnce, yuvarlak, saydam zeminli |
| Tema | Elle seçim kalıcı | Seçim yapılmadıysa sistem temasını canlı izliyor |
| Pencere odağı | Tepkisiz | Arkaya düşünce tüm vurgular griye çekiliyor |
| Tema düğmesi | ☀️/🌙 emoji, büyüyen daire | Tek renk SVG, 26px, sabit |
| Hareket | Sabit geçişler | `prefers-reduced-motion` destekleniyor |

### Denenip geri alınan: kenar çubuğu saydamlığı (vibrancy)

`vibrancy: "sidebar"` görsel olarak çalıştı (kenar çubuğunun arkasından masaüstü
görünüyordu) ama pencerenin opak olmamasını gerektiriyor
(`backgroundColor: "#00000000"` + saydam gövde). Fare girdisinin pencereye ulaşma
biçimini değiştirdiği için, elle sınanmadan açılmaması gerektiğine karar verildi;
kod yorumunda gerekçesiyle birlikte duruyor.

### Ölçüldü

`typecheck 6/6 · lint 0 hata / 0 uyarı · 259 test · build temiz`

Görsel olarak doğrulandı: başlık çubuğu kalktı, trafik ışıkları kenar çubuğunun
üstünde, açık sayfa mavi seçili, pencere arkaya düşünce seçim griye dönüyor,
düğmeler düz renk.

Fare ile gezinme de doğrulandı: kenar çubuğundan tıklanan ekran açıldı ve o satır
mavi seçili geldi. (Oturumun bir bölümünde otomasyonun tıklamaları saniyelerce
gecikmeli işlendi — Dock'a yapılan tıklamalar da işlenmiyordu — bu yüzden ilk
denemelerde tıklama çalışmıyor sanılmıştı; gecikmeli olarak hepsi ulaştı.)

---

## Ek: H-01 ve H-02 düzeltmeleri (19.08.2026)

İkisinin de "ne yapıldı / nasıl ölçüldü" ayrıntısı kendi bulgu başlıklarının altında.
Özet:

| Bulgu | Düzeltmenin özü | Sabitleyen test |
|---|---|---|
| H-01 | Donanım kodlayıcı seçimi kodek ailesine bağlandı, hedef değişince yeniden hesaplanıyor, elle seçim eziliyor | `gpu-encoders.test.ts` — 10 test |
| H-02 | `drawtext` için ayrı konum tablosu (`text_w`/`text_h`) | `ipc-handlers.test.ts` — 6 test |

### Ölçüldü

`typecheck 6/6 · lint 0 hata / 0 uyarı · 275 test (259 → +16) · build temiz`

Bu turda **uygulama çalıştırılmadı**: doğrulama birim testi düzeyinde kaldı, ekrandan
uçtan uca yeniden ölçüm arayüz testi onayı bekliyor.

---

## Ek: üst çubuk, geçmiş ekranı ve kenar çubuğu sadeleştirmesi (19.08.2026)

Kullanıcı isteği üzerine üç değişiklik:

**1 · Geçmiş kenar çubuğundan çıktı.** Alt köşedeki dar liste (`HISTORY` başlığı +
`No conversions yet.`) kaldırıldı; yerine masaüstü uygulamalarında bu köşenin alışıldık
içeriği olan **sürüm satırı** kondu. Sürüm `package.json`'dan derleme anında geliyor
(`vite.config.ts` → `__APP_VERSION__`), yani ikinci bir yerde elle güncellenmiyor.

**2 · Üst çubuk (navbar) eklendi.** [Topbar.svelte](apps/desktop/src/lib/components/Topbar.svelte)
— solda açık ekranın adı, sağda **Geçmiş** düğmesi ve tema düğmesi. Yüksekliği kenar
çubuğunun üst şeridiyle aynı ve ikisinde de aynı ince alt çizgi var; trafik ışıklarıyla
hizalanıp tek bir başlık şeridi gibi okunuyor. Şerit pencereyi sürüklüyor
(`-webkit-app-region: drag`), düğmeler tek tek `no-drag`.

Geçmiş artık orta alanda kendi ekranında: [/history](apps/desktop/src/routes/history/+page.svelte)
— geniş ekranda tablo (Kaynak · Çıktı · Hedef · Durum · Tarih · Dizinde göster), 820px
altında aynı işaretleme karta dönüşüyor (`thead` gizleniyor, hücreler `data-label` ile
kendi etiketini yazıyor — iki ayrı görünüm bakımı gerekmiyor). JSON/CSV dışa aktarma ve
temizleme düğmeleri de kenar çubuğundan buraya taşındı.

Tema düğmesi sağ alt köşede yüzen bir düğmeydi; üst çubuğa alındı — yüzen yuvarlak
düğme web alışkanlığı, araç çubuğu ise masaüstü alışkanlığı.

**3 · Sandviç menü kaldırıldı.** Kenar çubuğunu simge şeridine daraltan düğme ve
`collapsed` durumunun tamamı silindi (`data-collapsed` biçimleri, `lpc-sidebar-collapsed`
yerel kaydı, `--sidebar-collapsed` tokenı, `nav.expandMenu`/`nav.collapseMenu`
anahtarları). Dar ekrandaki çekmeceyi açan düğme ise duruyor — kenar çubuğunda değil,
üst çubukta.

Yan düzenleme: kenar çubuğu ile üst çubuğun ortak gezinme listesi tek kaynağa taşındı
([nav-items.ts](apps/desktop/src/lib/nav-items.ts)). Üst çubuktaki başlık bu listeden
türüyor; ekran eklendiğinde başlık kendiliğinden geliyor.

### Ölçüldü

`typecheck 6/6 · lint 0 hata / 0 uyarı · 275 test · build temiz`

Bu turda da **uygulama çalıştırılmadı**. Arayüz doğrulaması (üst çubuk hizası, geçmiş
tablosunun dar ekranda karta dönmesi, sürüm satırı) arayüz testi onayı bekliyor.

---

## Ek: arayüz testi — H-01, H-02 ve yeni kabuk (19.08.2026)

Uygulama `pnpm dev` ile çalıştırıldı, ekranlar elle sürüldü, üretilen dosyalar diskte
`ffprobe`/kare çıkarma ile doğrulandı.

### H-01 — ekranda doğrulandı ✅

| Adım | Ölçülen |
|---|---|
| `video-720p-10sn.mp4` açıldı, hedef **MP4 (H.264 + AAC)** | Gelişmiş ayarlar: `h264_videotoolbox`, rozet `libx264: yüklü` |
| Hedef **MP4 (H.265 / HEVC + AAC)** yapıldı | Kodlayıcı **anında** `hevc_videotoolbox — Apple GPU · çok hızlı (H.265)`, rozet `libx265: yüklü` |
| Dönüştürüldü → `ffprobe` | `codec_name=hevc` · `codec_tag_string=hev1` · 1280×720 |
| Hedef **WebM (VP9 + Opus)** yapıldı | Kodlayıcı `Varsayılan (profil)`, donanım hızlandırma satırı kayboldu, rozetler `libvpx-vp9` / `libopus` |
| Dönüştürüldü → `ffprobe` | `codec_name=vp9` + `codec_name=opus`, 752 KB dosya yazıldı |
| Yeni dosya seçildi | Hedef ve kodlayıcı H.264 varsayılanına döndü — seçim dosyaya takılı kalmıyor |

Eskiden birincisi sessizce `h264/avc1` veriyordu, ikincisi hiç dosya yazmıyordu.

### H-02 — ekranda doğrulandı ✅

`video-480p-25fps-farkli.mp4` üzerine "© Filigran" metni üç konumda basıldı, her
çıktının 2. saniyesinden kare çıkarılıp alt alta dizildi:

| Konum | Karede metin nerede |
|---|---|
| Merkez | tam ortada ✓ |
| Sağ Alt | sağ alt köşede, kenardan içeride ✓ |
| Sol Alt | sol alt köşede ✓ |

Eskiden üçü de sol üst köşedeydi (ikisi kadrajdan taşmış hâlde).

### Yeni kabuk — doğrulananlar

| Konu | Sonuç |
|---|---|
| Kenar çubuğunda geçmiş bloğu | Yok; yerinde `Sürüm 1.3.0` — değer `package.json`'dan geliyor, DOM'dan okundu |
| Sandviç menü | Yok; daraltma durumu tümüyle kalktı |
| Üst çubuk başlığı | Ekran değiştikçe güncelleniyor (Dönüştür / sıkıştır → Video kırpma → Geçmiş → Ayarlar) |
| Geçmiş düğmesi | Tıklayınca orta alan geçmişe geçiyor, düğme vurgu mavisiyle seçili görünüyor, kenar çubuğunda hiçbir satır seçili kalmıyor |
| Pencere sürükleme | Üst çubuktan çift tıklama pencereyi büyütüp küçültüyor — sürükleme bölgesi çalışıyor |
| Kaydırma | İçerik üst çubuğun altından kayıyor, çubuk yerinde duruyor |
| Tema düğmesi | Üst çubukta; açık↔karanlık geçişi ve ipucu metni çalışıyor |
| Dil | Türkçede `Sürüm 1.3.0` / `Geçmiş` / `KAYNAK · ÇIKTI · HEDEF · DURUM · TARİH`, İngilizcede karşılıkları |
| Geçmiş tablosu | Yeni iki dönüşüm doğru `HEDEF` değerleriyle listelendi (`mp4-h265-aac`, `webm-vp9-opus`) |
| JSON dışa aktarma | Yerel "Farklı Kaydet" penceresi `lpc-gecmis.json` adıyla açılıyor (dosya yazdırılmadı, iptal edildi) |

**Sınanmayanlar:** "Geçmişi temizle" (kullanıcının kendi verisini siler) ve CSV dışa
aktarma — JSON ile aynı kod yolu.

### Arayüz testinde bulunan ve düzeltilen iki kusur

**H-09 · Kart görünümü gerçek uygulamada hiç görünmüyordu.** Kart/tablo geçişi
`@media (max-width: 820px)` ile yazılmıştı; ama pencerenin `minWidth` değeri 920px
(`electron/main.ts`) ve kenar çubuğu 240px yer kaplıyor — görüntü alanı 820px'in
altına hiç inemiyor. Pencere en küçük boyuta getirilip ölçüldü: tablo yatay kaydırmaya
giriyordu, kart görünümü ise hiç tetiklenmiyordu. Ölçü pencereye değil **sayfanın kendi
genişliğine** çevrildi (`container-type: inline-size` + `@container (max-width: 780px)`).
Aynı pencerede yeniden ölçüldü: satırlar karta dönüyor, dosya adları kısaltılmadan
görünüyor; pencere büyütülünce tablo geri geliyor.

**H-10 · İngilizcede "1 records".** Sayaç düz birleştirmeydi. ICU çoğul biçimine
çevrildi (`{count, plural, one {# record} other {# records}}`); ekranda "1 record",
Türkçede "3 kayıt" olarak doğrulandı.

### Küçük gözlem (düzeltilmedi)

Uygulama ilk açılışta bir an karanlık temada beliriyor, sonra kayıtlı temaya geçiyor:
tema `onMount` içinde uygulanıyor, yani ilk boyamadan sonra. Bu kabuk değişikliğinden
önce de böyleydi (tema mantığına dokunulmadı), ayrı bir iş olarak durabilir.

### Ölçüldü

`typecheck 6/6 · lint 0 hata / 0 uyarı · 275 test · build temiz`

(Kapı bir kez `desktop#test` üzerinde düştü; dev sunucusu `.svelte-kit` dizinini aynı
anda tazelediği için geçiciydi — tek başına ve turbo ile yeniden koşturulunca 75/75
geçti.)
