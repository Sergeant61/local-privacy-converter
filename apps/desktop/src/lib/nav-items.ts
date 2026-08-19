/**
 * Kenar çubuğu ile üst çubuğun ortak gezinme listesi.
 *
 * Liste iki yerde birden kullanılıyor: kenar çubuğu satırları ve üst çubuktaki
 * "açık ekran" başlığı. Tek kaynakta durmazsa ikisi kaçınılmaz olarak
 * birbirinden ayrışır (ekran eklenir, başlık eski kalır).
 */
export type NavIconId =
  | "convert" | "aspect" | "resolution" | "audioMerge" | "videoMerge" | "frames"
  | "batch" | "gif" | "apng" | "multiOutput" | "pdf" | "settings" | "trim"
  | "normalize" | "watermark" | "metadata";

export type NavItem = { href: string; labelKey: string; icon: NavIconId };

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", labelKey: "nav.convert", icon: "convert" },
  { href: "/aspect-ratio", labelKey: "nav.aspectRatio", icon: "aspect" },
  { href: "/resolution", labelKey: "nav.resolution", icon: "resolution" },
  { href: "/audio-merge", labelKey: "nav.audioMerge", icon: "audioMerge" },
  { href: "/video-merge", labelKey: "nav.videoMerge", icon: "videoMerge" },
  { href: "/frames", labelKey: "nav.frames", icon: "frames" },
  { href: "/batch", labelKey: "nav.batch", icon: "batch" },
  { href: "/gif", labelKey: "nav.gif", icon: "gif" },
  { href: "/apng", labelKey: "nav.apng", icon: "apng" },
  { href: "/multi-output", labelKey: "nav.multiOutput", icon: "multiOutput" },
  { href: "/pdf", labelKey: "nav.pdf", icon: "pdf" },
  { href: "/trim", labelKey: "nav.trim", icon: "trim" },
  { href: "/normalize", labelKey: "nav.normalize", icon: "normalize" },
  { href: "/watermark", labelKey: "nav.watermark", icon: "watermark" },
  { href: "/metadata", labelKey: "nav.metadata", icon: "metadata" },
  { href: "/settings", labelKey: "nav.settings", icon: "settings" }
];

/** Geçmiş ekranı kenar çubuğunda değil, üst çubukta duruyor. */
export const HISTORY_ROUTE = "/history";

/**
 * Rota kimliğinin çeviri anahtarı — üst çubuktaki başlık için.
 *
 * Adres değil rota kimliği kullanılıyor: uygulama hash yönlendirmesinde
 * (`router.type: "hash"`) `location.pathname` her zaman `/` kalıyor.
 */
export function labelKeyForRoute(routeId: string | null): string | null {
  if (routeId === HISTORY_ROUTE) return "nav.history";
  return NAV_ITEMS.find((item) => item.href === routeId)?.labelKey ?? null;
}
