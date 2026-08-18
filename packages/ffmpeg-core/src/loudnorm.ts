/**
 * EBU R128 ses normalizasyonu — iki geçişli.
 *
 * Tek geçişte `loudnorm` hedefi tahminle vurur: ölçümde −14 LUFS istenirken
 * −14.5 çıkıyordu. Doğru kullanım iki geçiş: birinci geçiş kaynağı ölçer
 * (`print_format=json`), ikinci geçiş ölçülen değerleri filtreye geri vererek
 * doğrusal düzeltme uygular. README "EBU R128 loudness normalization" diyordu
 * ama tek geçiş çalışıyordu.
 */

export interface LoudnormTargets {
  /** Hedef bütünleşik ses yüksekliği (LUFS). */
  targetLufs: number;
  /** Gerçek tepe sınırı (dBTP). */
  truePeak: number;
  /** Ses yüksekliği aralığı (LU). */
  lra: number;
}

export interface LoudnormMeasurement {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
}

/** Birinci geçiş: yalnızca ölçüm, çıktı yazılmaz. */
export function buildLoudnormMeasureArgs(inputPath: string, t: LoudnormTargets): string[] {
  return [
    "-i",
    inputPath,
    "-af",
    `loudnorm=I=${t.targetLufs}:TP=${t.truePeak}:LRA=${t.lra}:print_format=json`,
    "-f",
    "null",
    "-"
  ];
}

/**
 * ffmpeg ölçüm JSON'unu stderr'den çıkarır.
 *
 * JSON stderr'in **sonunda** basılır ve öncesinde banner, akış bilgisi ve
 * ilerleme satırları vardır; bu yüzden son `{ … }` bloğu aranır.
 */
export function parseLoudnormJson(stderr: string): LoudnormMeasurement | null {
  const start = stderr.lastIndexOf("{");
  const end = stderr.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const raw = JSON.parse(stderr.slice(start, end + 1)) as Partial<LoudnormMeasurement>;
    const keys: (keyof LoudnormMeasurement)[] = [
      "input_i",
      "input_tp",
      "input_lra",
      "input_thresh",
      "target_offset"
    ];
    for (const k of keys) {
      // `-inf` (tümüyle sessiz girdi) sayıya çevrilemez; ikinci geçiş anlamsız olur.
      const v = raw[k];
      if (typeof v !== "string" || !Number.isFinite(Number(v))) return null;
    }
    return raw as LoudnormMeasurement;
  } catch {
    return null;
  }
}

/** İkinci geçiş: ölçülen değerlerle doğrusal düzeltme. */
export function buildLoudnormApplyArgs(
  inputPath: string,
  outputPath: string,
  t: LoudnormTargets,
  m: LoudnormMeasurement
): string[] {
  const filter = [
    `loudnorm=I=${t.targetLufs}`,
    `TP=${t.truePeak}`,
    `LRA=${t.lra}`,
    `measured_I=${m.input_i}`,
    `measured_TP=${m.input_tp}`,
    `measured_LRA=${m.input_lra}`,
    `measured_thresh=${m.input_thresh}`,
    `offset=${m.target_offset}`,
    "linear=true",
    "print_format=summary"
  ].join(":");
  return ["-i", inputPath, "-af", filter, "-y", outputPath];
}

/** Ölçüm alınamadığında geri düşülen tek geçişli biçim. */
export function buildLoudnormSinglePassArgs(
  inputPath: string,
  outputPath: string,
  t: LoudnormTargets
): string[] {
  return [
    "-i",
    inputPath,
    "-af",
    `loudnorm=I=${t.targetLufs}:TP=${t.truePeak}:LRA=${t.lra}:print_format=none`,
    "-y",
    outputPath
  ];
}
