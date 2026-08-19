#!/usr/bin/env node
/**
 * FFmpeg ikililerini kendi sürüm varlıklarımıza kopyalar (KALAN-ISLER.md K-05).
 *
 * `node scripts/mirror-ffmpeg.mjs --dry-run`  → yalnızca indirir + doğrular
 * `node scripts/mirror-ffmpeg.mjs --publish`  → doğrulanmış ikilileri yükler
 *
 * ── Neden ─────────────────────────────────────────────────────────────────
 *
 * İkili çift `descriptinc/ffmpeg-ffprobe-static` deposunun tek bir release'ine
 * bağlı. O release silinir ya da erişilemez olursa paketleme kırılır. Bu betik
 * aynı baytları kendi depomuzun bir release'ine kopyalar; manifest'e ikinci
 * kaynak olarak eklendiğinde `prepare-ffmpeg.mjs` upstream'e ulaşamadığında
 * oraya düşer.
 *
 * ── Neden güvenli ─────────────────────────────────────────────────────────
 *
 * Ayna, güven zincirine yeni bir halka EKLEMİYOR. Yüklenen her dosya önce
 * manifest'teki SHA-256 ile doğrulanıyor; tutmayan hiçbir şey yüklenmiyor.
 * Tüketim tarafında da `prepare-ffmpeg.mjs` her kaynağı ayrı ayrı doğruluyor.
 * Yani ayna ele geçirilse bile yanlış ikili paketlenemez — o kaynak atlanır.
 *
 * ── Yayınlama neden ayrı bir adım ─────────────────────────────────────────
 *
 * `--publish` herkese açık bir GitHub release'i oluşturur/günceller: dışa
 * dönük, geri alması zahmetli bir iş. Bu yüzden varsayılan `--dry-run` ve
 * yayınlama açık bayrak istiyor. `gh auth login` yapılmış olmalı.
 */

import { createHash } from "crypto";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(__dirname, "ffmpeg-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const publish = process.argv.includes("--publish");
const dryRun = !publish;

/** Aynanın yaşayacağı etiket. Sürümü taşıyor: 7.2'ye çıkınca yeni etiket. */
const MIRROR_TAG = `ffmpeg-${manifest.version}`;
const REPO = "Sergeant61/local-privacy-converter";

const [primary] = manifest.sources;
if (!primary) {
  console.error("ffmpeg-manifest.json içinde `sources` boş.");
  process.exit(1);
}

const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), "lpc-mirror-"));

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

async function fetchVerified(tool, platformKey, expected) {
  const url = `${primary.baseUrl.replace(/\/+$/, "")}/${tool}-${platformKey}`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);

  // Ayna dosya adı upstream ile AYNI olmalı: `prepare-ffmpeg.mjs` her kaynakta
  // `${baseUrl}/${tool}-${platformKey}` kuruyor, ada göre dallanmıyor.
  const dest = path.join(stageDir, `${tool}-${platformKey}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));

  const actual = sha256(dest);
  if (actual !== expected) {
    throw new Error(
      `sağlama tutmadı — YÜKLENMEYECEK\n    beklenen: ${expected}\n    gelen   : ${actual}`
    );
  }
  return dest;
}

const staged = [];
let failed = 0;

for (const [platformKey, tools] of Object.entries(manifest.platforms)) {
  for (const [tool, expected] of Object.entries(tools)) {
    try {
      const file = await fetchVerified(tool, platformKey, expected);
      const mb = (fs.statSync(file).size / (1024 * 1024)).toFixed(1);
      console.log(`✓ ${tool}-${platformKey} (${mb} MB)`);
      staged.push(file);
    } catch (err) {
      failed += 1;
      console.error(`✗ ${tool}-${platformKey} — ${err.message}`);
    }
  }
}

if (failed > 0) {
  console.error(`\n${failed} varlık doğrulanamadı — hiçbir şey yüklenmedi.`);
  fs.rmSync(stageDir, { recursive: true, force: true });
  process.exit(1);
}

console.log(`\n${staged.length} varlık doğrulandı → ${stageDir}`);

if (dryRun) {
  console.log(
    "\nYayınlamak için: node scripts/mirror-ffmpeg.mjs --publish\n" +
      "(herkese açık bir GitHub release oluşturur; `gh auth login` gerekir)"
  );
  fs.rmSync(stageDir, { recursive: true, force: true });
  process.exit(0);
}

function gh(args) {
  const r = spawnSync("gh", args, { stdio: "inherit", shell: false });
  if (r.error) {
    console.error(`gh çalıştırılamadı: ${r.error.message}`);
    process.exit(1);
  }
  return r.status;
}

// Release yoksa oluştur. `view` sıfır dönerse zaten var, dokunma.
const exists =
  spawnSync("gh", ["release", "view", MIRROR_TAG, "--repo", REPO], {
    stdio: "ignore",
    shell: false
  }).status === 0;

if (!exists) {
  console.log(`\n${MIRROR_TAG} release'i oluşturuluyor…`);
  const status = gh([
    "release", "create", MIRROR_TAG,
    "--repo", REPO,
    "--title", `FFmpeg ${manifest.version} (ayna)`,
    "--notes",
    `\`descriptinc/ffmpeg-ffprobe-static\` ${manifest.releaseTag} etiketindeki ikililerin baytı baytına aynası.\n\n` +
      `Sağlama toplamları \`scripts/ffmpeg-manifest.json\` içinde sabit ve her indirmede doğrulanıyor. ` +
      `Bu release, upstream erişilemez olursa paketlemenin kırılmaması için var — kaynak değil, yedek.`,
    "--latest=false"
  ]);
  if (status !== 0) process.exit(status ?? 1);
}

console.log(`\n${staged.length} varlık yükleniyor…`);
const status = gh(["release", "upload", MIRROR_TAG, ...staged, "--repo", REPO, "--clobber"]);
fs.rmSync(stageDir, { recursive: true, force: true });
if (status !== 0) process.exit(status ?? 1);

console.log(
  `\n✓ Ayna hazır. ffmpeg-manifest.json içindeki \`sources\` listesine ekleyin:\n\n` +
    JSON.stringify(
      { name: "mirror", baseUrl: `https://github.com/${REPO}/releases/download/${MIRROR_TAG}` },
      null,
      2
    ) +
    `\n\nSonra doğrulayın: node scripts/verify-ffmpeg-manifest.mjs`
);
