#!/usr/bin/env node
/**
 * ffmpeg-manifest.json içindeki sağlama toplamlarını canlı release ile karşılaştırır.
 *
 * `node scripts/verify-ffmpeg-manifest.mjs`           → doğrula (fark varsa exit 1)
 * `node scripts/verify-ffmpeg-manifest.mjs --update`  → sağlamaları yeniden üret
 *
 * Sürüm yükseltirken `--update` ile çalıştırın; ürettiği manifest'i işleyin.
 * Doğrulama modu bir güvenlik kontrolüdür: bir release varlığının işlendikten
 * sonra sessizce değiştirilmediğini gösterir. Her platform için iki ikili
 * indirdiği (~700 MB) ve GitHub'a bağımlı olduğu için CI'da koşturulmaz —
 * sürüm yükseltmesi sırasında elle çalıştırılır.
 *
 * Manifest'teki HER kaynak ayrı ayrı doğrulanır (KALAN-ISLER.md K-05): bir
 * aynanın doğru baytları sunduğu, ancak indirilip hash'lenerek bilinir.
 * `--update` yalnızca ilk kaynağı (upstream) referans alır; aynalar ona göre
 * doğrulanır, tersi değil.
 */

import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(__dirname, "ffmpeg-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const update = process.argv.includes("--update");

/** İkiliyi diske yazmadan, akıştan hash'ler — 700 MB'ı tutmaya gerek yok. */
async function hashOf(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  const hash = createHash("sha256");
  for await (const chunk of res.body) hash.update(chunk);
  return hash.digest("hex");
}

const sources = manifest.sources;
if (!Array.isArray(sources) || sources.length === 0) {
  console.error("ffmpeg-manifest.json içinde `sources` tanımlı değil.");
  process.exit(1);
}

const binaryUrl = (source, tool, platformKey) =>
  `${source.baseUrl.replace(/\/+$/, "")}/${tool}-${platformKey}`;

// `--update` referansı: sağlamalar upstream'den üretilir, aynalar ona uyar.
const [primary] = sources;

let mismatches = 0;
let unreachable = 0;

for (const source of update ? [primary] : sources) {
  console.log(`\n── ${source.name} — ${source.baseUrl}`);

  for (const [platformKey, tools] of Object.entries(manifest.platforms)) {
    for (const tool of Object.keys(tools)) {
      const url = binaryUrl(source, tool, platformKey);
      const expected = tools[tool];

      let actual;
      try {
        actual = await hashOf(url);
      } catch (err) {
        // Ulaşılamayan bir ayna, tutmayan bir sağlamayla aynı şey değil:
        // ilki kullanılabilirlik sorunu, ikincisi bütünlük sorunu.
        unreachable += 1;
        console.error(`? ${tool}-${platformKey} — ulaşılamadı: ${err.message}`);
        continue;
      }

      if (update) {
        tools[tool] = actual;
        console.log(`  ${actual}  ${tool}-${platformKey}`);
      } else if (actual === expected) {
        console.log(`✓ ${tool}-${platformKey}`);
      } else {
        mismatches += 1;
        console.error(`✗ ${tool}-${platformKey}\n    beklenen: ${expected}\n    gelen   : ${actual}`);
      }
    }
  }
}

if (update) {
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\n${path.relative(process.cwd(), manifestPath)} güncellendi (kaynak: ${primary.name}).`);
} else if (mismatches > 0) {
  console.error(`\n${mismatches} sağlama toplamı tutmadı.`);
  process.exit(1);
} else if (unreachable > 0) {
  console.error(
    `\n${unreachable} varlığa ulaşılamadı — sağlamalar tutuyor ama bir kaynak eksik.`
  );
  process.exit(1);
} else {
  console.log(
    `\nTüm kaynaklarda tüm sağlama toplamları tutuyor ` +
      `(${manifest.version}, ${manifest.releaseTag}, ${sources.length} kaynak).`
  );
}
