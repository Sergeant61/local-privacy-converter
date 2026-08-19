# Kalan işler

[DENETIM.md](DENETIM.md)'deki 24 bulgunun tamamı kapandı ve **v1.3.0** yayımlandı.
Bu dosya, denetimin kapsamı dışında kalan ya da denetim sırasında ortaya çıkan
işleri tutuyor. Sıra önem sırasıdır.

Bulgu ID'leri (`K-01` … `K-06`) sabittir, yeniden numaralandırılmaz. Bir iş
bitince `- [ ]` → `- [x]` yapılır ve altına ne yapıldığı + **nasıl ölçüldüğü**
yazılır — DENETIM.md'deki alışkanlık burada da sürsün.

Durum: **4 açık / 2 kapalı** · Son güncelleme: 19 Ağustos 2026 · Sürüm: v1.3.0

---

## 🔴 Kullanıcıyı doğrudan etkileyen

- [ ] **K-01** — Kod imzalama ve notarization yok
  > **Konum:** [electron-builder.yml](apps/desktop/electron-builder.yml) · [release.yml](.github/workflows/release.yml)
  > **Durum:** İmzalama yapılandırması **hiç yok** — `electron-builder.yml`'de `identity`, `notarize`, `hardenedRuntime`, `entitlements` alanlarının hiçbiri tanımlı değil; `release.yml`'de `CSC_*` / `APPLE_*` sırrı yok.
  > **Etki:** macOS'ta **her yeni kullanıcı** "damaged, move to Trash" Gatekeeper hatası alıyor ve README'deki `xattr -cr` çözümünü elle uygulamak zorunda. Windows'ta SmartScreen uyarısı çıkıyor. Bu, uygulamayı ilk kez açan herkesin karşılaştığı ilk şey.
  > **Engel:** Hesap ve ücret gerektiriyor — Apple Developer Program (~$99/yıl) ve bir Windows kod imzalama sertifikası. Bu adım proje sahibinin kararı; kod tarafı ancak sertifikalar elde edildikten sonra bağlanabilir.
  > **Bittiğinde:** İmzalı ve notarize edilmiş bir `.dmg` indirilip Gatekeeper uyarısı **görmeden** açılabilmeli; `spctl -a -vvv <app>` `accepted` demeli. README'deki "damaged" bölümü kaldırılmalı.

---

## 🟠 Regresyon riski

- [x] **K-02** — `main.ts` 1747 satır ve sıfır testi var
  > **Konum:** [main.ts](apps/desktop/electron/main.ts) · [ipc-handlers.ts](apps/desktop/electron/ipc-handlers.ts) · [channels.ts](apps/desktop/electron/channels.ts) · [ipc-handlers.test.ts](apps/desktop/electron/ipc-handlers.test.ts)
  > **Yapıldı (19 Ağu 2026):** `main.ts` 1747 → **233 satır**. IPC katmanı üç dosyaya ayrıldı:
  > - `channels.ts` — 31 kanal adının tek kaynağı. Bu sabitler `main.ts` ve `preload.ts` içinde **birebir kopyalanmış** hâlde duruyordu; birinde tek harf değişse kanal sessizce eşleşmez, çağrı hiç hata vermeden askıda kalırdı. Ayrıca `HANDLER_CHANNELS` listesi var: yeni bir kanal eklenip bağlanması unutulursa test kırılıyor.
  > - `ipc-handlers.ts` — 29 handler'ın tamamı. Pencereye bağlı üç iş (`setTaskbarProgress`, `updateTrayMenu`, `notifyCompletion`) `main.ts`'te kaldı ve `IpcHost` arayüzüyle enjekte ediliyor.
  > - `main.ts` — yalnızca pencere, tepsi, CSP, `lpc://` protokolü ve bootstrap.
  >
  > **69 test** yazıldı, 29 kanalın **hepsi** kapsanıyor. Yöntem önemli: `@lfc/ffmpeg-core`'un yalnızca süreç koşucuları (`runFfmpegJob`, `runFfprobeJson`, `probeFfmpegVersion`, `listFfmpegCapabilities`) taklit ediliyor, **argüman üreticilerinin hepsi gerçek** — ölçülen şey handler'ın ffmpeg'e gerçekten hangi argümanları verdiği. Üretici de taklit edilseydi D-06 sınıfı hatalar yine görünmez kalırdı. Ayarlar ve profiller gerçek dosya sistemine, her testte taze bir geçici `userData` dizinine yazılıyor. Denetimde bulunan davranışların regresyon testleri de içeride: D-01 (ham yol reddi), D-04/D-17 (hedef boyutta kaynak ölçümü), D-05 (birleştirmede copy/filtre stratejisi), D-06 (bitmap altyazı reddi), D-07 (filigran metni `textfile=` ile), D-09 (görüntü boyut kademeleri), D-18 (sürüm karşılaştırması).
  > **Nasıl ölçüldü:** Dört bağımsız ölçüm:
  > 1. **Mutasyon testi** — kod sekiz ayrı yerden bilerek bozuldu (filigran metnini filtregrafa gömme, loudnorm ikinci geçişini atma, altyazı codec'ini okumama, bir kanalı hiç bağlamama, ayar şemasının ham yol reddini atlama, sürüm satırı seçimini bozma, birleştirmeyi hep copy yapma, iptal edilmiş işi başarılı sayma). **8/8'i test kırdı** — testler gerçekten ısırıyor.
  > 2. **Paketlenmiş çıktı karşılaştırması** — refactor öncesi (`git HEAD`) ve sonrası `main.js` bundle'larının string literalleri karşılaştırıldı: **764 literalden 761'i birebir aynı**, tek fark modül ikiye ayrıldığı için birer kez fazla geçen `"electron"`, `"node:fs"`, `"node:path"` import belirteçleri. Her ffmpeg argümanı, filtregraf ve kanal adı korunmuş.
  > 3. **Çalışma zamanı duman testi** — gerçek `dist-electron/main.js`, Electron taklidiyle düz Node'da koşturuldu: bootstrap çöküyor mu, handler'lar kaydoluyor mu. **29/29 kanal bağlandı.**
  > 4. `pnpm typecheck && pnpm lint && pnpm test`: **6/6 · 0 hata / 0 uyarı · 259 test** (190 mevcut + 69 yeni). `pnpm build` temiz; `esbuild` hem `main.ts` hem `preload.ts` tarafını paketliyor.

- [ ] **K-03** — Bu oturumda yazılan kod bağımsız gözden geçirilmedi
  > **Konum:** [loudnorm.ts](packages/ffmpeg-core/src/loudnorm.ts) · [merge-args.ts](packages/ffmpeg-core/src/merge-args.ts) · [subtitle-args.ts](packages/ffmpeg-core/src/subtitle-args.ts) · [image-size-plan.ts](packages/ffmpeg-core/src/image-size-plan.ts) · [job-spec.ts](packages/media-formats/src/job-spec.ts) · [path-guard.ts](packages/validators/src/path-guard.ts) · [prepare-ffmpeg.mjs](scripts/prepare-ffmpeg.mjs)
  > **Kapsam notu (19 Ağu 2026):** K-02'de yazılan IPC ayrımı ve 69 test de aynı durumda — tek doğrulayıcısı onu yazan oldu. İkinci denetim bunları da kapsamalı.
  > **Durum:** DENETIM.md, **v1.1.3'ün** fotoğrafıydı. Bulguları kapatmak için yazılan ~1500 satır yeni mantık sonradan geldi ve tek doğrulayıcısı onu yazan oldu. Testler ve gerçek FFmpeg ölçümleri var, ama bağımsız bir göz yok.
  > **Öneri:** Aynı yöntemle ikinci bir denetim — iddiaları ölçerek, gerçek dosyalarla. Özellikle güvenlik yüzeyi (`path-guard.ts`, IPC şemaları) ve indirme/doğrulama yolu (`prepare-ffmpeg.mjs`).

---

## 🟡 Bakım

- [ ] **K-04** — `release.yml` düzeltmesi henüz koşmadı
  > **Konum:** [.github/workflows/release.yml](.github/workflows/release.yml)
  > **Durum:** v1.1.3 ve v1.3.0 yayınlarına `win-unpacked/` içinden beş fazladan varlık sızmıştı (`ffmpeg.exe`, `ffprobe.exe`, `esbuild.exe`, `elevate.exe` ve kurulum programı olmayan çıplak `Local.Privacy.Converter.exe`, 201 MB). Sebep `**` glob'uydu; desen `release/*/*.ext` yapıldı ve v1.3.0'a yüklenmiş varlıklar elle silindi.
  > **Kalan:** `ci.yml` workflow dosyalarını doğrulamıyor, yani düzeltme **ancak bir sonraki sürüm koştuğunda** kanıtlanacak.
  > **Bittiğinde:** Bir sonraki yayında varlık listesi yalnızca `.dmg`, `.zip`, `.AppImage`, `.deb` ve `Setup.*.exe` içermeli.

- [ ] **K-05** — FFmpeg tek bir upstream release'e bağlı, aynası yok
  > **Konum:** [scripts/ffmpeg-manifest.json](scripts/ffmpeg-manifest.json)
  > **Durum:** İkili çift `descriptinc/ffmpeg-ffprobe-static` deposunun `b7.1.0-rc.1` etiketinden çekiliyor. İkilinin kendisi stabil **FFmpeg 7.1**, ama o deponun son yayını **Ekim 2024**'ten ve `-rc` etiketi taşıyor.
  > **Etki:** Release silinir ya da erişilemez olursa paketleme kırılır. Sağlama toplamı kontrolü sayesinde **sessizce değil, gürültülü** kırılır (exit 1) — yani yanlış ikili asla paketlenmez. Yine de aynasız durumdayız.
  > **Öneri:** İkilileri kendi sürüm varlıklarımıza kopyalamak, ya da yedek bir URL alanı eklemek. Sürüm yükseltmek gerekirse manifest'teki `releaseTag` ve `baseUrl` değiştirilip `node scripts/verify-ffmpeg-manifest.mjs --update` çalıştırılır.

- [x] **K-06** — İki lint uyarısı
  > **Konum:** [batch/+page.svelte](apps/desktop/src/routes/batch/+page.svelte) · [multi-output/+page.svelte](apps/desktop/src/routes/multi-output/+page.svelte)
  > **Yapıldı (19 Ağu 2026):** İkisi de ölü değişkendi, yarım kalmış özellik değil — taşıdıkları bilgi zaten ekranda vardı. `currentIndex` yalnızca yazılıyordu (bildirim + döngü içinde atama + döngü sonunda sıfırlama, 3 satır); batch sayfası ilerlemeyi zaten `"İşleniyor — X tamamlandı, Y hata, Z bekliyor…"` satırıyla `doneCount`/`errorCount`/`pendingCount` üzerinden gösteriyor. `mediaKind` de yalnızca yazılıyordu; asıl işi yerel `kind` değişkeni yapıyor (`getTargetsForKind(kind)` → `availableProfiles`), state kopyası hiçbir yerde okunmuyordu. Beşi de silindi; `MediaKind` tip importu yerel `kind` tarafından hâlâ kullanıldığı için korundu.
  > **Nasıl ölçüldü:** Silmeden önce `grep -n` ile her iki değişkenin tüm referansları çıkarıldı ve hepsinin yazma olduğu doğrulandı (okuma yok, şablonda kullanım yok). Sonra `pnpm typecheck && pnpm lint && pnpm test`: **6/6 başarılı · svelte-check 0 hata 0 uyarı · eslint 0 hata 0 uyarı · 190 test geçti** (123 ffmpeg-core + 39 media-formats + 28 validators). Davranış değişikliği yok.

---

## Ölçüm komutları

```bash
pnpm typecheck && pnpm lint && pnpm test    # 6/6 · 0 hata / 0 uyarı · 259 test
pnpm ffmpeg:fetch                           # ikilileri indirir + SHA-256 doğrular
pnpm dist:dir                               # paketler (imzasız)
node scripts/verify-ffmpeg-manifest.mjs     # manifest sağlamalarını canlı release ile karşılaştırır
```

Geliştirme ortamı: **pnpm 9.15.4** (`corepack enable`), Node ≥ 20. Kilit dosyası
`lockfileVersion 9.0`; pnpm 7/8 reddeder.

> ⚠️ **Tuzak:** PATH'teki `pnpm` eski bir sürüm olabilir. `pnpm 7` reddetmiyor —
> kilit dosyasını sessizce **5.4'e düşürüp yeniden yazıyor** ve CI `--frozen-lockfile`
> ile kırılıyor. Emin olmak için `corepack pnpm …` kullanın; `pnpm --version`
> 9.15.4 demiyorsa komutu koşmayın.

CI `--frozen-lockfile` kullanıyor, yani bir `package.json` değişikliği güncel
`pnpm-lock.yaml` ile birlikte işlenmeli.
