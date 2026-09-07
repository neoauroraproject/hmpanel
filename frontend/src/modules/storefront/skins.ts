/** Client-side skin resolver (mirrors backend storefront-skins). */
export type StorefrontSkinId = "default" | "atelier" | "noir" | "harbor";
export type StorefrontLayoutId = "classic" | "market" | "minimal";

export function resolveStorefrontSkin(settings: unknown): StorefrontSkinId {
  if (!settings || typeof settings !== "object") return "default";
  const skin = String((settings as { skin?: string }).skin || "")
    .trim()
    .toLowerCase();
  if (skin === "atelier" || skin === "noir" || skin === "harbor") return skin;
  return "default";
}

export function resolveStorefrontLayout(settings: unknown): StorefrontLayoutId {
  if (settings && typeof settings === "object") {
    const layout = String((settings as { layout?: string }).layout || "")
      .trim()
      .toLowerCase();
    if (layout === "classic" || layout === "market" || layout === "minimal") return layout;
  }
  const skin = resolveStorefrontSkin(settings);
  if (skin === "noir") return "market";
  if (skin === "harbor") return "minimal";
  return "classic";
}

export function sanitizeThemeCss(raw: unknown): string {
  const css = String(raw || "").slice(0, 24_000);
  if (!css.trim()) return "";
  return css
    .replace(/@import[^;]+;?/gi, "")
    .replace(/expression\s*\([^)]*\)/gi, "none")
    .replace(/javascript\s*:/gi, "")
    .replace(/behavior\s*:[^;]+;?/gi, "")
    .replace(/<\/?script[^>]*>/gi, "")
    .replace(/url\s*\(\s*['"]?\s*data:[^)]*\)/gi, "none");
}

export function skinChrome(skin: StorefrontSkinId, layout?: StorefrontLayoutId): {
  rootClass: string;
  style: Record<string, string>;
  forceDark: boolean;
  layout: StorefrontLayoutId;
} {
  const resolvedLayout =
    layout || (skin === "noir" ? "market" : skin === "harbor" ? "minimal" : "classic");

  if (skin === "atelier") {
    return {
      rootClass: "store-skin-atelier store-layout-classic",
      forceDark: false,
      layout: resolvedLayout,
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
      rootClass: "store-skin-noir store-layout-market dark",
      forceDark: true,
      layout: resolvedLayout,
      style: {
        "--store-bg": "#0C0A09",
        "--store-fg": "#FAFAF9",
        "--store-muted": "#A8A29E",
        "--store-panel": "rgba(28,25,23,0.82)",
        "--store-panel-border": "rgba(250,250,249,0.1)",
        "--store-radius": "0.5rem",
        "--store-font": '"DM Sans", "Vazirmatn", ui-sans-serif, system-ui, sans-serif',
        "--store-display": '"DM Sans", "Vazirmatn", ui-sans-serif, system-ui, sans-serif',
      },
    };
  }
  if (skin === "harbor") {
    return {
      rootClass: "store-skin-harbor store-layout-minimal",
      forceDark: false,
      layout: resolvedLayout,
      style: {
        "--store-bg": "#EDE6D9",
        "--store-fg": "#1C1917",
        "--store-muted": "#78716C",
        "--store-panel": "#F7F3EB",
        "--store-panel-border": "rgba(28,25,23,0.12)",
        "--store-radius": "0.25rem",
        "--store-font": '"Figtree", "Vazirmatn", ui-sans-serif, system-ui, sans-serif',
        "--store-display": '"Fraunces", "Vazirmatn", Georgia, serif',
      },
    };
  }
  return {
    rootClass: "store-skin-default store-layout-classic",
    forceDark: false,
    layout: resolvedLayout,
    style: {},
  };
}
