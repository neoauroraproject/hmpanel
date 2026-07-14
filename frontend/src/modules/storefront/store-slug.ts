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

export function resolveStoreSlug(preferred?: string | null): string {
  if (typeof window === "undefined") return preferred || "";
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
