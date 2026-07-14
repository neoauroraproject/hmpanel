"use client";

/** Persist / resolve which store the customer is browsing (for portal ↔ shop navigation). */
const SLUG_KEY = "hmpanel-storefront-slug";

export function rememberStoreSlug(slug?: string | null) {
  if (!slug || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SLUG_KEY, slug);
  } catch {
    /* ignore */
  }
}

export function readRememberedStoreSlug(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(SLUG_KEY) || "";
  } catch {
    return "";
  }
}

/** Extract `/shop/{slug}/…` from a pathname. */
export function slugFromPathname(pathname?: string | null): string {
  if (!pathname) return "";
  const m = pathname.match(/^\/shop\/([^/]+)/i);
  if (!m?.[1]) return "";
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

export function resolveStoreSlug(preferred?: string | null): string {
  if (typeof window === "undefined") return preferred || "";
  const fromPath = slugFromPathname(window.location.pathname);
  if (fromPath) {
    rememberStoreSlug(fromPath);
    return fromPath;
  }
  const fromQuery = new URLSearchParams(window.location.search).get("slug");
  if (fromQuery) {
    rememberStoreSlug(fromQuery);
    return fromQuery;
  }
  if (preferred) {
    rememberStoreSlug(preferred);
    return preferred;
  }
  return readRememberedStoreSlug();
}

export function shopPathForSlug(slug?: string | null): string {
  const s = resolveStoreSlug(slug);
  return s ? `/shop/${encodeURIComponent(s)}` : "/";
}

/** Sticky store portal URLs: /shop/{slug}/portal[…] */
export function portalPathForSlug(
  slug?: string | null,
  path: "login" | "dashboard" = "login",
): string {
  const s = resolveStoreSlug(slug);
  if (!s) return path === "dashboard" ? "/portal/dashboard" : "/portal";
  const base = `/shop/${encodeURIComponent(s)}/portal`;
  return path === "dashboard" ? `${base}/dashboard` : base;
}
