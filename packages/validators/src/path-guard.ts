import path from "node:path";

/**
 * Yol koruması (DENETIM.md D-07).
 *
 * Bu bir dosya izni katmanı değil — kullanıcı zaten kendi diskindeki her yere
 * yazabilir ve yazabilmelidir. Amaç dar: **ele geçirilmiş bir renderer**'ın
 * ana sürece rastgele yol yazdırmasını engellemek. Uygulamanın kendi arayüzü
 * yolları dosya diyaloğundan alır; buraya gelen bir traversal ya da sistem
 * dizini isteği tanım gereği arayüzden gelmemiştir.
 *
 * Beyaz liste yerine kara liste kullanılıyor: harici disk (`/Volumes/...`),
 * ağ paylaşımı veya ikinci bir kullanıcı dizini meşru hedeflerdir ve beyaz
 * liste bunları kırardı.
 */

/** Yazmanın hiçbir meşru gerekçesinin olmadığı kökler. */
const DENIED_PREFIXES_POSIX = [
  "/System",
  "/usr",
  "/bin",
  "/sbin",
  "/etc",
  "/var/db",
  "/Library/LaunchAgents",
  "/Library/LaunchDaemons",
  "/Library/StartupItems",
  "/Applications"
];

const DENIED_PREFIXES_WIN = [
  "c:\\windows",
  "c:\\program files",
  "c:\\program files (x86)",
  "c:\\programdata\\microsoft\\windows\\start menu"
];

export type PathGuardResult = { ok: true; path: string } | { ok: false; reason: string };

function normalizeForCompare(p: string): string {
  return process.platform === "win32" ? p.toLowerCase().replace(/\//g, "\\") : p;
}

function isUnder(candidate: string, prefix: string): boolean {
  const c = normalizeForCompare(candidate);
  const pre = normalizeForCompare(prefix);
  return c === pre || c.startsWith(pre.endsWith(path.sep) ? pre : pre + path.sep);
}

/**
 * Ortak kontroller: NUL yok, mutlak, normalize edildikten sonra `..` kalmıyor.
 * Dönen değer normalize edilmiş yoldur — çağıran bunu kullanmalı, ham girdiyi değil.
 */
export function checkPath(raw: unknown, label = "Yol"): PathGuardResult {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, reason: `${label} gerekli.` };
  }
  if (raw.includes("\0")) {
    return { ok: false, reason: `${label} geçersiz karakter içeriyor.` };
  }
  if (!path.isAbsolute(raw)) {
    return { ok: false, reason: `${label} mutlak olmalı: ${raw}` };
  }
  const resolved = path.resolve(raw);
  // path.resolve `..` segmentlerini çözer; çözüm sonrası hâlâ `..` görülüyorsa
  // (Windows'ta bazı UNC biçimleri) yol güvenilir değildir.
  if (resolved.split(/[\\/]/).includes("..")) {
    return { ok: false, reason: `${label} dizin geçişi içeriyor.` };
  }
  return { ok: true, path: resolved };
}

/** Okuma hedefi: traversal ve NUL yeterli. */
export function checkInputPath(raw: unknown, label = "Giriş dosyası"): PathGuardResult {
  return checkPath(raw, label);
}

/** Yazma hedefi: ek olarak sistem kökleri reddedilir. */
export function checkOutputPath(raw: unknown, label = "Çıktı yolu"): PathGuardResult {
  const base = checkPath(raw, label);
  if (!base.ok) return base;

  const denied = process.platform === "win32" ? DENIED_PREFIXES_WIN : DENIED_PREFIXES_POSIX;
  for (const prefix of denied) {
    if (isUnder(base.path, prefix)) {
      return { ok: false, reason: `${label} korumalı sistem dizinine yazamaz: ${prefix}` };
    }
  }
  return base;
}

/** Birden çok girişi tek seferde doğrular; ilk hata kazanır. */
export function checkInputPaths(raws: unknown[], label = "Giriş dosyası"): { ok: true; paths: string[] } | { ok: false; reason: string } {
  const out: string[] = [];
  for (const raw of raws) {
    const r = checkInputPath(raw, label);
    // Açık `=== true`: svelte-check'in paketlediği TS bu ayrık birleşimi
    // `!r.ok` üzerinden daraltmıyor.
    if (r.ok === true) {
      out.push(r.path);
    } else {
      return { ok: false, reason: r.reason };
    }
  }
  return { ok: true, paths: out };
}
