/**
 * Panel look ("classic" = the original UI, "modern" = the redesigned one) and, for modern,
 * where the navigation sits. The choice is applied as attributes on <html> so the whole
 * redesign lives behind `html[data-ui="modern"]` and classic stays byte-for-byte untouched.
 */
export type UiStyle = "classic" | "modern";
export type UiNav = "top" | "side";

export const UI_STYLE_STORAGE_KEY = "hmpanel-ui-style";
export const UI_NAV_STORAGE_KEY = "hmpanel-ui-nav";
/** Last known panel-wide default (set by the super admin), cached for a flash-free boot. */
export const UI_DEFAULT_STORAGE_KEY = "hmpanel-ui-default";

export const UI_STYLE_SETTING_KEY = "ui_style_default";
export const UI_NAV_SETTING_KEY = "ui_nav_default";

/** Since v3 the new look with the side menu is the default; classic stays one click away. */
export const FALLBACK_UI_STYLE: UiStyle = "modern";
export const FALLBACK_UI_NAV: UiNav = "side";

export function parseUiStyle(value: unknown): UiStyle | null {
  return value === "classic" || value === "modern" ? value : null;
}

export function parseUiNav(value: unknown): UiNav | null {
  return value === "top" || value === "side" ? value : null;
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage disabled */
  }
}

export function readPersonalUi(): { style: UiStyle | null; nav: UiNav | null } {
  return {
    style: parseUiStyle(readStorage(UI_STYLE_STORAGE_KEY)),
    nav: parseUiNav(readStorage(UI_NAV_STORAGE_KEY)),
  };
}

export function writePersonalUi(style: UiStyle | null, nav: UiNav | null) {
  writeStorage(UI_STYLE_STORAGE_KEY, style);
  writeStorage(UI_NAV_STORAGE_KEY, nav);
}

export function readCachedUiDefault(): { style: UiStyle | null; nav: UiNav | null } {
  try {
    const raw = JSON.parse(readStorage(UI_DEFAULT_STORAGE_KEY) || "null");
    return { style: parseUiStyle(raw?.style), nav: parseUiNav(raw?.nav) };
  } catch {
    return { style: null, nav: null };
  }
}

export function writeCachedUiDefault(style: UiStyle, nav: UiNav) {
  writeStorage(UI_DEFAULT_STORAGE_KEY, JSON.stringify({ style, nav }));
}

export function applyUiAttributes(style: UiStyle, nav: UiNav) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (style === "modern") {
    root.setAttribute("data-ui", "modern");
    root.setAttribute("data-ui-nav", nav);
  } else {
    root.removeAttribute("data-ui");
    root.removeAttribute("data-ui-nav");
  }
}

export function clearUiAttributes() {
  if (typeof document === "undefined") return;
  document.documentElement.removeAttribute("data-ui");
  document.documentElement.removeAttribute("data-ui-nav");
}

/**
 * Runs before hydration on admin routes: personal choice → cached panel default → modern + side.
 * Kept dependency-free because it is inlined as a string.
 */
export const UI_STYLE_BOOT_SCRIPT = `(function(){try{
var h=document.documentElement,g=function(k){try{return localStorage.getItem(k)}catch(e){return null}};
var d={};try{d=JSON.parse(g('${UI_DEFAULT_STORAGE_KEY}')||'{}')||{}}catch(e){}
var s=g('${UI_STYLE_STORAGE_KEY}')||d.style,n=g('${UI_NAV_STORAGE_KEY}')||d.nav;
if(s!=='classic'){h.setAttribute('data-ui','modern');h.setAttribute('data-ui-nav',n==='top'?'top':'side');}
}catch(e){}})();`;
