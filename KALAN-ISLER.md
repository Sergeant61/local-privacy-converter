# Kalan işler

[DENETIM.md](DENETIM.md)'deki 24 bulgunun tamamı kapandı ve **v1.3.0** yayımlandı.
Bu dosya, denetimin kapsamı dışında kalan ya da denetim sırasında ortaya çıkan
işleri tutuyor. Sıra önem sırasıdır.

Bulgu ID'leri (`K-01` … `K-06`) sabittir, yeniden numaralandırılmaz. Bir iş
bitince `- [ ]` → `- [x]` yapılır ve altına ne yapıldığı + **nasıl ölçüldüğü**
yazılır — DENETIM.md'deki alışkanlık burada da sürsün.

Durum: **6 açık** · Son güncelleme: 18 Ağustos 2026 · Sürüm: v1.3.0

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

- [ ] **K-02** — `main.ts` 1747 satır ve sıfır testi var
  > **Konum:** [apps/desktop/electron/main.ts](apps/desktop/electron/main.ts)
  > **Durum:** 190 birim testinin **tamamı** `packages/` altındaki saf fonksiyonlarda. `main.ts` test edilmiyor; içinde 29 IPC handler'ı, görüntü boyutu küçültme döngüsü, iki geçişli loudnorm orkestrasyonu, video birleştirme planlaması, `lpc://` protokol handler'ı ve Electron sertleştirmesi var.
  > **Neden önemli:** Denetimde bulunan kırık özelliklerin çoğu tam olarak bu katmanda saklanıyordu — argüman üreticileri doğru çalışırken handler onları yanlış çağırıyordu (bkz. D-06, D-20). Bu katman değişirse hiçbir şey uyarmaz.
  > **Öneri:** Saf karar mantığını (hangi handler hangi argümanları kuruyor, hangi sırayla probe ediyor) `main.ts`'ten çekip test edilebilir fonksiyonlara ayırmak, sonra handler'ı ince bir kabuk olarak bırakmak. Alternatif olarak Electron'u gerçekten ayağa kaldıran bir duman testi — bu oturumda `LPC_SMOKE=1` deseniyle elle yapıldı ve işe yaradı, kalıcı hâle getirilebilir.
  > **Bittiğinde:** `main.ts`'teki her IPC kanalı için en az bir otomatik test; `pnpm test` bunları kapsamalı.

- [ ] **K-03** — Bu oturumda yazılan kod bağımsız gözden geçirilmedi
  > **Konum:** [loudnorm.ts](packages/ffmpeg-core/src/loudnorm.ts) · [merge-args.ts](packages/ffmpeg-core/src/merge-args.ts) · [subtitle-args.ts](packages/ffmpeg-core/src/subtitle-args.ts) · [image-size-plan.ts](packages/ffmpeg-core/src/image-size-plan.ts) · [job-spec.ts](packages/media-formats/src/job-spec.ts) · [path-guard.ts](packages/validators/src/path-guard.ts) · [prepare-ffmpeg.mjs](scripts/prepare-ffmpeg.mjs)
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

- [ ] **K-06** — İki lint uyarısı
  > **Konum:** [batch/+page.svelte:37](apps/desktop/src/routes/batch/+page.svelte#L37) · [multi-output/+page.svelte:14](apps/desktop/src/routes/multi-output/+page.svelte#L14)
  > **Durum:** `currentIndex` ve `mediaKind` atanıyor ama hiç kullanılmıyor. `pnpm lint` 0 hata / 2 uyarı veriyor.
  > **Not:** Ölü değişken mi yoksa yarım kalmış bir özelliğin kalıntısı mı — silmeden önce bakılmalı.

---

## Ölçüm komutları

```bash
pnpm typecheck && pnpm lint && pnpm test    # 6/6 · 0 hata / 2 uyarı · 190 test
pnpm ffmpeg:fetch                           # ikilileri indirir + SHA-256 doğrular
pnpm dist:dir                               # paketler (imzasız)
node scripts/verify-ffmpeg-manifest.mjs     # manifest sağlamalarını canlı release ile karşılaştırır
```

Geliştirme ortamı: **pnpm 9.15.4** (`corepack enable`), Node ≥ 20. Kilit dosyası
`lockfileVersion 9.0`; pnpm 7/8 reddeder. CI `--frozen-lockfile` kullanıyor,
yani bir `package.json` değişikliği güncel `pnpm-lock.yaml` ile birlikte
işlenmeli.
