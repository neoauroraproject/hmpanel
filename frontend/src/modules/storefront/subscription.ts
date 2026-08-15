"use client";

import { portalPathForSlug } from "./store-slug";

/** Same System Sub link as Clients page: /s/{subId} */
export function buildSubscriptionLink(
  subId?: string | null,
  fallback?: string | null,
  nativeUrl?: string | null,
) {
  if (nativeUrl && /^https?:\/\//i.test(nativeUrl)) return nativeUrl;
  const key = subId || fallback;
  if (key && /^https?:\/\//i.test(key)) return key;
  if (!key) return "";
  if (typeof window === "undefined") return `/s/${key}`;
  return `${window.location.origin}/s/${key}`;
}

/**
 * Extract token from pasted sub URL or raw token.
 * Supports panel `/s/{token}`, 3x-ui `/sub/{token}`, and trailing path tokens.
 */
export function parseSubscriptionToken(input: string): string {
  const raw = String(input || "").trim();
  if (!raw) return "";

  const pathPatterns = [
    /\/s\/([^/?#]+)/i,
    /\/sub\/([^/?#]+)/i,
    /\/subscribe\/([^/?#]+)/i,
  ];
  for (const re of pathPatterns) {
    const m = raw.match(re);
    if (m?.[1]) return decodeURIComponent(m[1]).trim();
  }

  try {
    const u = new URL(raw);
    for (const re of pathPatterns) {
      const m = u.pathname.match(re);
      if (m?.[1]) return decodeURIComponent(m[1]).trim();
    }
    const segments = u.pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1];
    if (last && /^[A-Za-z0-9._-]{6,}$/.test(last)) {
      return decodeURIComponent(last).trim();
    }
  } catch {
    /* not a URL — treat as raw token */
  }

  return raw.replace(/^[@#]/, "").trim();
}

export function buildPortalBridgeLink(token?: string | null, storeSlug?: string | null) {
  const base = portalPathForSlug(storeSlug, "login");
  if (!token) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}token=${encodeURIComponent(token)}`;
}
