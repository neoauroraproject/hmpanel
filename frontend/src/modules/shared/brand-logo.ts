/** Portal / storefront themes that sit on light backgrounds. */
export const LIGHT_PORTAL_THEMES = new Set([
  "Light",
  "Minimalist",
  "Sunset",
  "Neo Default",
  "Neo Minimal",
]);

export function isLightPortalTheme(theme?: string | null) {
  return LIGHT_PORTAL_THEMES.has(theme || "");
}

export function resolveThemeLogo(options: {
  logoLight?: string | null;
  logoDark?: string | null;
  theme?: string | null;
  /** When set, prefer this over theme (e.g. storefront system dark mode). */
  preferDark?: boolean | null;
}) {
  const light = options.logoLight || "";
  const dark = options.logoDark || "";
  const wantDark =
    typeof options.preferDark === "boolean"
      ? options.preferDark
      : !isLightPortalTheme(options.theme);

  if (wantDark) return dark || light || null;
  return light || dark || null;
}

export function hasPersianText(...parts: Array<string | null | undefined>) {
  return parts.some((p) => !!p && /[\u0600-\u06FF]/.test(p));
}

export function isPersianStorefront(store?: {
  title?: string | null;
  description?: string | null;
  defaultCurrency?: string | null;
  branding?: { name?: string | null; description?: string | null } | null;
} | null) {
  const currency = (store?.defaultCurrency || "").toUpperCase();
  if (["IRT", "IRR", "TOMAN", "TMN"].includes(currency)) return true;
  return hasPersianText(
    store?.title,
    store?.description,
    store?.branding?.name,
    store?.branding?.description,
  );
}

const VAZIR_HREF =
  "https://cdn.jsdelivr.net/npm/vazirmatn@33.003/Vazirmatn-font-face.css";

/** Inject Vazirmatn once; safe to call repeatedly. */
export function ensureVazirFont() {
  if (typeof document === "undefined") return;
  const id = "hmpanel-vazirmatn-font";
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = VAZIR_HREF;
  document.head.appendChild(link);
}
