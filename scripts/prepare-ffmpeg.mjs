#!/usr/bin/env node
/**
 * Places the ffmpeg + ffprobe pair into
 * apps/desktop/extra-resources/ffmpeg/ so electron-builder can embed them
 * as extraResources → resourcesPath/ffmpeg/{ffmpeg,ffprobe}[.exe]
 *
 * Run before `electron-builder` in CI and local packaging.
 *
 * ── Neden npm paketi değil (DENETIM.md D-19) ───────────────────────────────
 *
 * Önceden ffmpeg `@ffmpeg-binary/*` paketinden (7.0), ffprobe ise
 * `ffprobe-static` paketinden geliyordu. İkisi ayrı derlemelerdi ve ffprobe
 * üç major sürüm gerideydi; üstelik `ffprobe-static`'in `bin/darwin/arm64/`
 * klasöründeki dosya arm64 bile değil, x86_64 idi — Apple Silicon'da Rosetta
 * ile çalışıyordu. Ölçülen sonuç: uygulamanın kendi ürettiği AVIF dosyasını
 * kendi ffprobe'u okuyamıyordu ("moov atom not found").
 *
 * Tarball ile gelen hiçbir npm paketi AVIF okuyabilen bir ffprobe sunmuyor.
 * Sunanların hepsi kurulum sırasında ikiliyi ağdan indiriyor ve hiçbiri
 * indirdiğini doğrulamıyor — bu da kilit dosyasının bütünlük güvencesini
 * (D-24) delerdi.
 *
 * Bu yüzden ikili çift doğrudan buradan çekiliyor: sürüm ve URL
 * `ffmpeg-manifest.json` içinde sabit, her ikilinin SHA-256'sı depoda duruyor.
 * İndirilen dosya beklenen sağlamayı tutturmazsa paketleme durur. Böylece
 * ffmpeg ve ffprobe aynı derlemeden, aynı sürümden ve doğru mimaride gelir.
 *
 * ── Neden birden çok kaynak (KALAN-ISLER.md K-05) ──────────────────────────
 *
 * Manifest tek bir URL'e bağlıydı: o release silinir ya da erişilemez olursa
 * paketleme kırılırdı. Artık `sources` sırayla deneniyor ve **her kaynak aynı
 * sağlama kontrolünden geçiyor**. Sonuç: bir ayna eklemek güvenlik yüzeyini
 * genişletmiyor — ele geçirilmiş bir ayna yanlış ikiliyi paketleyemez, yalnızca
 * o kaynak atlanır ve sıradakine geçilir. Hiçbir kaynak doğru ikiliyi
 * veremezse paketleme, denenen her kaynağın nedeniyle birlikte durur.
 */

import { createHash } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const destDir = path.join(root, "apps", "desktop", "extra-resources", "ffmpeg");

const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, "ffmpeg-manifest.json"), "utf8")
);

// electron-builder çapraz paketleme yaparken hedef platformu ortam
// değişkenleriyle bildirir; yoksa koşan makineninki kullanılır.
const platform = process.env.npm_config_platform || os.platform();
const arch = process.env.npm_config_arch || os.arch();
const platformKey = `${platform}-${arch}`;
const isWin = platform === "win32";

const sources = manifest.sources;
if (!Array.isArray(sources) || sources.length === 0) {
  console.error("[prepare-ffmpeg] ffmpeg-manifest.json içinde `sources` tanımlı değil.");
  process.exit(1);
}

const expected = manifest.platforms[platformKey];
if (!expected) {
  console.error(
    `[prepare-ffmpeg] Unsupported platform: ${platformKey}\n` +
      `  Desteklenenler: ${Object.keys(manifest.platforms).join(", ")}`
  );
  process.exit(1);
}

/**
 * İndirilen ikililer depo dışında, sürüme göre ayrılmış bir önbellekte durur.
 * Aynı sürüm için ikinci bir paketleme ağa hiç çıkmaz; sürüm değişince
 * önbellek yolu da değişir, yani bayat ikili sessizce kullanılamaz.
 */
const cacheDir = path.join(
  root,
  "node_modules",
  ".cache",
  "ffmpeg-bin",
  manifest.releaseTag,
  platformKey
);

function sha256(filePath) {
  const hash = createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

async function download(url, destPath) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} — ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buf);
}

/** Manifest'teki bir kaynak için bu araca ait indirme adresi. */
function binaryUrl(source, tool, key) {
  return `${source.baseUrl.replace(/\/+$/, "")}/${tool}-${key}`;
}

/**
 * Önbellekte doğrulanmış bir kopya varsa onu döndürür; yoksa kaynakları
 * sırayla dener. Her kaynak ayrı ayrı doğrulanır: sağlama tutmayan kaynak
 * atlanır ama sessizce geçilmez, nedeni raporlanır.
 */
async function ensureBinary(tool) {
  const cached = path.join(cacheDir, tool);

  if (fs.existsSync(cached)) {
    const actual = sha256(cached);
    if (actual === expected[tool]) return cached;
    // Bozuk ya da yarım kalmış indirme: sessizce kullanma, at ve yeniden çek.
    console.warn(`[prepare-ffmpeg] ${tool}: önbellekteki kopya bozuk, yeniden indiriliyor`);
    fs.rmSync(cached);
  }

  const failures = [];
  for (const source of sources) {
    const url = binaryUrl(source, tool, platformKey);
    console.log(`  ⬇ ${tool} ${manifest.version} (${platformKey}) — ${source.name}`);

    try {
      await download(url, cached);
    } catch (err) {
      // Ulaşılamama bir kullanılabilirlik sorunu: sıradaki kaynağa geçilir.
      const reason = `${source.name}: ${err.message}`;
      failures.push(reason);
      console.warn(`  ⚠ ${tool}: ${reason}`);
      continue;
    }

    const actual = sha256(cached);
    if (actual === expected[tool]) {
      if (failures.length > 0) {
        console.warn(`  ↳ ${tool}: ${source.name} kaynağına düşüldü (${failures.length} kaynak atlandı)`);
      }
      return cached;
    }

    // Doğrulama başarısız: dosyayı at, ama diğer kaynakları denemeye devam et.
    // Ele geçirilmiş bir ayna, sağlam bir kaynağın kullanılmasını engellememeli.
    //
    // Uyarı, iş sonradan başka bir kaynaktan başarıyla bitse BİLE basılıyor:
    // sağlama uyuşmazlığı bir bütünlük sinyalidir, kullanılabilirlik sorunu
    // değil. Yalnızca "hepsi başarısız" durumunda raporlansaydı, zehirlenmiş
    // bir ayna upstream çalıştığı sürece sessizce görünmez kalırdı.
    fs.rmSync(cached, { force: true });
    const reason =
      `${source.name}: sağlama tutmadı (beklenen ${expected[tool]}, gelen ${actual}) — ${url}`;
    failures.push(reason);
    console.warn(`  ⚠ ${tool}: SAĞLAMA TUTMADI — ${reason}`);
  }

  throw new Error(
    `${tool} hiçbir kaynaktan doğrulanamadı — paketleme durduruldu.\n` +
      failures.map((f) => `  • ${f}`).join("\n")
  );
}

fs.mkdirSync(destDir, { recursive: true });

for (const tool of ["ffmpeg", "ffprobe"]) {
  const binName = isWin ? `${tool}.exe` : tool;
  try {
    const src = await ensureBinary(tool);
    const dest = path.join(destDir, binName);
    fs.copyFileSync(src, dest);
    if (!isWin) fs.chmodSync(dest, 0o755);
    console.log(`✓ ${tool.padEnd(7)} →  ${path.relative(root, dest)}  (${manifest.version})`);
  } catch (err) {
    console.error(`[prepare-ffmpeg] ${tool} stage failed:`, err.message);
    process.exit(1);
  }
}
