import { describe, expect, it } from "vitest";
import en from "./en.json";
import tr from "./tr.json";

/** İki sözlüğün simetrisi elle korunamıyor: bir sayfa çevrilirken yalnızca bir
 * dosyaya anahtar eklemek sessizce Türkçe fallback'e düşürüyor (H-03). */
function flatten(value: unknown, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (val !== null && typeof val === "object") {
      for (const [k, v] of flatten(val, path)) out.set(k, v);
    } else {
      out.set(path, String(val));
    }
  }
  return out;
}

const trKeys = flatten(tr);
const enKeys = flatten(en);

describe("çeviri sözlükleri", () => {
  it("tr ve en aynı anahtar kümesine sahip", () => {
    expect([...enKeys.keys()].sort()).toEqual([...trKeys.keys()].sort());
  });

  it("hiçbir değer boş değil", () => {
    for (const [key, value] of [...trKeys, ...enKeys]) {
      expect(value.trim(), key).not.toBe("");
    }
  });

  it("İngilizce metinlerde Türkçe karakter yok", () => {
    const offenders = [...enKeys].filter(([, v]) => /[çğıöşüÇĞİÖŞÜ]/.test(v));
    expect(offenders).toEqual([]);
  });

  it("aynı anahtarın iki dilde de aynı yer tutucuları var", () => {
    // ICU çoğul gövdeleri de süslü parantezli ({count, plural, one {# kayıt} …});
    // ileriye bakış yalnızca `{ad}` ve `{ad, plural` biçimlerini yakalıyor.
    const placeholders = (s: string) =>
      [...s.matchAll(/\{\s*([a-zA-Z0-9_]+)\s*(?=[},])/g)].map((m) => m[1]).sort();
    for (const [key, trValue] of trKeys) {
      expect(placeholders(enKeys.get(key) ?? ""), key).toEqual(placeholders(trValue));
    }
  });
});
