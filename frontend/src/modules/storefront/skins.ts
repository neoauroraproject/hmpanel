/** Client-side skin resolver (mirrors backend storefront-skins). */
export type StorefrontSkinId = "default" | "atelier" | "pulse" | "lumen" | "cascade";
export type StorefrontLayoutId = "classic" | "market" | "split" | "funnel";

const SKIN_ALIASES: Record<string, StorefrontSkinId> = {
  noir: "pulse",
  harbor: "lumen",
};

export function resolveStorefrontSkin(settings: unknown): StorefrontSkinId {
  if (!settings || typeof settings !== "object") return "default";
  let skin = String((settings as { skin?: string }).skin || "")
    .trim()
    .toLowerCase();
  skin = SKIN_ALIASES[skin] || skin;
  if (skin === "atelier" || skin === "pulse" || skin === "lumen" || skin === "cascade") return skin;
  return "default";
}

export function resolveStorefrontLayout(settings: unknown): StorefrontLayoutId {
  if (settings && typeof settings === "object") {
    let layout = String((settings as { layout?: string }).layout || "")
      .trim()
      .toLowerCase();
    if (layout === "minimal") layout = "split";
    if (layout === "desk") layout = "market";
    if (layout === "classic" || layout === "market" || layout === "split" || layout === "funnel") {
      return layout;
    }
  }
  const skin = resolveStorefrontSkin(settings);
  if (skin === "pulse") return "market";
  if (skin === "lumen") return "split";
  if (skin === "cascade") return "funnel";
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

export function defaultPrimaryForSkin(skin: StorefrontSkinId): string {
  if (skin === "atelier") return "#0D9488";
  if (skin === "pulse") return "#10B981";
  if (skin === "lumen") return "#2563EB";
  if (skin === "cascade") return "#3B82F6";
  return "#3b82f6";
}

export const SKIN_FONT_HREF: Record<Exclude<StorefrontSkinId, "default">, string> = {
  atelier:
    "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap",
  pulse:
    "https://fonts.googleapis.com/css2?family=Exo+2:wght@500;600;700;800&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap",
  lumen:
    "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap",
  cascade:
    "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
};

export function skinChrome(
  skin: StorefrontSkinId,
  layout?: StorefrontLayoutId,
): {
  rootClass: string;
  style: Record<string, string>;
  forceDark: boolean;
  layout: StorefrontLayoutId;
} {
  const resolvedLayout =
    layout ||
    (skin === "pulse" ? "market" : skin === "lumen" ? "split" : skin === "cascade" ? "funnel" : "classic");

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
  if (skin === "pulse") {
    return {
      rootClass: "store-skin-pulse store-skin-noir store-layout-market dark",
      forceDark: true,
      layout: resolvedLayout,
      style: {
        "--store-bg": "#0B0F0E",
        "--store-fg": "#F4FBF7",
        "--store-muted": "#8BA39A",
        "--store-panel": "rgba(18, 24, 22, 0.92)",
        "--store-panel-border": "rgba(16, 185, 129, 0.18)",
        "--store-radius": "0.75rem",
        "--store-font": '"IBM Plex Sans", "Vazirmatn", ui-sans-serif, system-ui, sans-serif',
        "--store-display": '"Exo 2", "Vazirmatn", ui-sans-serif, system-ui, sans-serif',
        "--store-glow": "0 0 28px color-mix(in srgb, var(--store-primary) 42%, transparent)",
      },
    };
  }
  if (skin === "lumen") {
    return {
      rootClass: "store-skin-lumen store-skin-harbor store-layout-split",
      forceDark: false,
      layout: resolvedLayout,
      style: {
        "--store-bg": "#FFFFFF",
        "--store-fg": "#0F172A",
        "--store-muted": "#64748B",
        "--store-panel": "#FFFFFF",
        "--store-panel-border": "rgba(15, 23, 42, 0.08)",
        "--store-radius": "0.85rem",
        "--store-font": '"Archivo", "Vazirmatn", ui-sans-serif, system-ui, sans-serif',
        "--store-display": '"Space Grotesk", "Vazirmatn", ui-sans-serif, system-ui, sans-serif',
      },
    };
  }
  if (skin === "cascade") {
    return {
      rootClass: "store-skin-cascade store-layout-funnel",
      forceDark: false,
      layout: resolvedLayout,
      style: {
        "--store-bg": "transparent",
        "--store-backdrop": "linear-gradient(165deg, #38BDF8 0%, #4F46E5 52%, #6D28D9 100%)",
        "--store-fg": "#0F172A",
        "--store-muted": "#475569",
        "--store-panel": "rgba(255,255,255,0.94)",
        "--store-panel-border": "rgba(255,255,255,0.65)",
        "--store-radius": "1.1rem",
        "--store-font": '"Inter", "Vazirmatn", ui-sans-serif, system-ui, sans-serif',
        "--store-display": '"Inter", "Vazirmatn", ui-sans-serif, system-ui, sans-serif',
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
