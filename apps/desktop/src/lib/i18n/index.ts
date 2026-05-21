import { browser } from "$app/environment";
import { register, init, getLocaleFromNavigator, locale } from "svelte-i18n";

const STORAGE_KEY = "lpc-locale";
export const SUPPORTED_LOCALES = ["tr", "en"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

register("tr", () => import("./tr.json"));
register("en", () => import("./en.json"));

export function setupI18n() {
  const saved = browser ? (localStorage.getItem(STORAGE_KEY) as SupportedLocale | null) : null;
  const nav = getLocaleFromNavigator() ?? "tr";
  const initial = saved ?? (nav.startsWith("tr") ? "tr" : "en");

  init({
    fallbackLocale: "tr",
    initialLocale: initial,
  });
}

export function setLocale(loc: SupportedLocale) {
  locale.set(loc);
  if (browser) localStorage.setItem(STORAGE_KEY, loc);
}

export { locale };
