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

/** Önbellekte doğrulanmış bir kopya varsa onu döndürür, yoksa indirip doğrular. */
async function ensureBinary(tool) {
  const cached = path.join(cacheDir, tool);

  if (fs.existsSync(cached)) {
    const actual = sha256(cached);
    if (actual === expected[tool]) return cached;
    // Bozuk ya da yarım kalmış indirme: sessizce kullanma, at ve yeniden çek.
    console.warn(`[prepare-ffmpeg] ${tool}: önbellekteki kopya bozuk, yeniden indiriliyor`);
    fs.rmSync(cached);
  }

  const url = `${manifest.baseUrl}/${tool}-${platformKey}`;
  console.log(`  ⬇ ${tool} ${manifest.version} (${platformKey}) indiriliyor…`);
  await download(url, cached);

  const actual = sha256(cached);
  if (actual !== expected[tool]) {
    fs.rmSync(cached, { force: true });
    throw new Error(
      `${tool} sağlama toplamı tutmadı — paketleme durduruldu.\n` +
        `  beklenen: ${expected[tool]}\n` +
        `  gelen   : ${actual}\n` +
        `  kaynak  : ${url}`
    );
  }
  return cached;
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
