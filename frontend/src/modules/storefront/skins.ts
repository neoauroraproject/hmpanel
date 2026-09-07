/** Client-side skin resolver (mirrors backend storefront-skins). */
export type StorefrontSkinId = "default" | "atelier" | "noir";

export function resolveStorefrontSkin(settings: unknown): StorefrontSkinId {
  if (!settings || typeof settings !== "object") return "default";
  const skin = String((settings as { skin?: string }).skin || "")
    .trim()
    .toLowerCase();
  if (skin === "atelier" || skin === "noir") return skin;
  return "default";
}

/** CSS variables + root classes for a skin. Branding primaryColor still wins for --store-primary when set. */
export function skinChrome(skin: StorefrontSkinId): {
  rootClass: string;
  style: Record<string, string>;
  forceDark: boolean;
} {
  if (skin === "atelier") {
    return {
      rootClass: "store-skin-atelier",
      forceDark: false,
      style: {
        "--store-bg": "#F1F5F9",
        "--store-fg": "#0F172A",
        "--store-muted": "#64748B",
        "--store-panel": "#FFFFFF",
        "--store-panel-border": "rgba(15,23,42,0.08)",
        "--store-radius": "1.25rem",
        "--store-font": '"Plus Jakarta Sans", "Vazirmatn", ui-sans-serif, system-ui, sans-serif',
        "--store-display": '"Plus Jakarta Sans", "Vazirmatn", ui-sans-serif, system-ui, sans-serif',
      },
    };
  }
  if (skin === "noir") {
    return {
      rootClass: "store-skin-noir dark",
      forceDark: true,
      style: {
        "--store-bg": "#0C0A09",
        "--store-fg": "#FAFAF9",
        "--store-muted": "#A8A29E",
        "--store-panel": "rgba(28,25,23,0.82)",
        "--store-panel-border": "rgba(250,250,249,0.1)",
        "--store-radius": "1rem",
        "--store-font": '"DM Sans", "Vazirmatn", ui-sans-serif, system-ui, sans-serif',
        "--store-display": '"DM Sans", "Vazirmatn", ui-sans-serif, system-ui, sans-serif',
      },
    };
  }
  return {
    rootClass: "store-skin-default",
    forceDark: false,
    style: {},
  };
}
