import { browser } from "$app/environment";
import { addMessages, init, getLocaleFromNavigator, locale } from "svelte-i18n";
import tr from "./tr.json";
import en from "./en.json";

const STORAGE_KEY = "lpc-locale";
export const SUPPORTED_LOCALES = ["tr", "en"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

addMessages("tr", tr);
addMessages("en", en);

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
