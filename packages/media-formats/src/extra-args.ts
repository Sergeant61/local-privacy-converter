/**
 * Kullanıcının serbest metin olarak yazdığı ek FFmpeg argümanlarını böler
 * (DENETIM.md D-23).
 *
 * Eskiden `split(/\s+/)` kullanılıyordu: tırnak desteği olmadığı için boşluk
 * içeren hiçbir değer yazılamıyordu. `-metadata title=My Movie` üç ayrı
 * argümana bölünüyor, ffmpeg `Movie`'yi çıktı yolu sanıyordu.
 *
 * Kabuk değil, kabuk benzeri bir bölme: tek ve çift tırnak grupları korunur,
 * ters bölü bir sonraki karakteri kaçırır. Değişken genişletme, glob ve boru
 * bilinçli olarak YOK — bu bir argüman listesi, komut satırı değil.
 */
export function parseExtraFfmpegArgs(raw: string | undefined | null): string[] {
  if (raw == null) return [];

  const tokens: string[] = [];
  let current = "";
  let started = false;
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;

    if (ch === "\\" && i + 1 < raw.length && quote !== "'") {
      current += raw[i + 1];
      started = true;
      i++;
      continue;
    }

    if (quote !== null) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      started = true;
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      // Boş tırnak da geçerli bir argümandır: `-metadata comment=""`.
      started = true;
      continue;
    }

    if (/\s/.test(ch)) {
      if (started) {
        tokens.push(current);
        current = "";
        started = false;
      }
      continue;
    }

    current += ch;
    started = true;
  }

  if (started) {
    tokens.push(current);
  }

  return tokens;
}
