/** Portal / storefront themes that sit on light (or frosted) backgrounds → use light logo. */
export const LIGHT_PORTAL_THEMES = new Set(["Nordic", "Pulse"]);

export function normalizePortalTheme(theme?: string | null) {
  const raw = String(theme || "").trim();
  if (!raw) return "Aurora";
  // Tolerate casing / spacing drift from older saves
  const lower = raw.toLowerCase().replace(/\s+/g, " ");
  const aliases: Record<string, string> = {
    aurora: "Aurora",
    obsidian: "Obsidian",
    nordic: "Nordic",
    pulse: "Pulse",
    neon: "Neon",
    ember: "Ember",
    studio: "Studio",
    // Legacy portal themes → new set
    dark: "Aurora",
    light: "Nordic",
    "neo eclipse": "Aurora",
    "neo dashboard": "Aurora",
    "neo default": "Nordic",
    "neo minimal": "Nordic",
    "neo glass": "Studio",
    "neo vibrant": "Ember",
    sunset: "Ember",
    cyberpunk: "Neon",
    hacker: "Neon",
    minimalist: "Pulse",
  };
  return aliases[lower] || raw;
}

export function isLightPortalTheme(theme?: string | null) {
  return LIGHT_PORTAL_THEMES.has(normalizePortalTheme(theme));
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

const VAZIR_LOCAL_HREF = "/fonts/vazirmatn/vazirmatn.css";

/** Inject Vazirmatn once from same-origin assets (works without external CDN). */
export function ensureVazirFont() {
  if (typeof document === "undefined") return;
  const id = "hmpanel-vazirmatn-font";
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = VAZIR_LOCAL_HREF;
  document.head.appendChild(link);
}
