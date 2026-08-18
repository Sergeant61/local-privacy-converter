/**
 * Sürüm karşılaştırması (DENETIM.md D-18).
 *
 * Güncelleme kontrolü `tag !== currentVersion` kullanıyordu: string
 * eşitsizliği. Uzaktaki etiket **eski** olsa bile "güncelleme var" diyordu —
 * bir sürüm geri alındığında ya da kullanıcı önizleme sürümü çalıştırdığında
 * kullanıcıyı sürekli aşağı yönlü "güncellemeye" çağırıyordu.
 */

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  /** `1.2.0-beta.1` içindeki `beta.1`; yoksa null (yani kararlı sürüm). */
  prerelease: string | null;
}

/** `v1.2.3`, `1.2.3-beta.1`, `1.2` gibi biçimleri kabul eder. */
export function parseVersion(raw: string | null | undefined): ParsedVersion | null {
  if (typeof raw !== "string") return null;
  const m = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?/.exec(raw.trim());
  if (m === null) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2] ?? 0),
    patch: Number(m[3] ?? 0),
    prerelease: m[4] ?? null
  };
}

function comparePrerelease(a: string | null, b: string | null): number {
  // Kararlı sürüm, aynı sayılara sahip ön sürümden büyüktür (semver kuralı).
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;

  const as = a.split(".");
  const bs = b.split(".");
  for (let i = 0; i < Math.max(as.length, bs.length); i++) {
    const x = as[i];
    const y = bs[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xn = /^\d+$/.test(x) ? Number(x) : null;
    const yn = /^\d+$/.test(y) ? Number(y) : null;
    if (xn !== null && yn !== null) {
      if (xn !== yn) return xn < yn ? -1 : 1;
    } else if (x !== y) {
      // Sayısal alan alfasayısaldan küçüktür.
      if (xn !== null) return -1;
      if (yn !== null) return 1;
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

/** a < b ise negatif, eşitse 0, a > b ise pozitif. Ayrıştırılamayan sürüm 0 döner. */
export function compareVersions(a: string | null | undefined, b: string | null | undefined): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (pa === null || pb === null) return 0;
  if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1;
  if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1;
  if (pa.patch !== pb.patch) return pa.patch < pb.patch ? -1 : 1;
  return comparePrerelease(pa.prerelease, pb.prerelease);
}

/** Uzaktaki sürüm gerçekten daha yeni mi? Eşit ya da eski ise false. */
export function isNewerVersion(remote: string | null | undefined, current: string | null | undefined): boolean {
  return compareVersions(remote, current) > 0;
}
