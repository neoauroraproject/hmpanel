"use client";

import { portalPathForSlug } from "./store-slug";

/** Same System Sub link as Clients page: /s/{subId} */
export function buildSubscriptionLink(subId?: string | null, fallback?: string | null) {
  const key = subId || fallback;
  if (!key) return "";
  if (typeof window === "undefined") return `/s/${key}`;
  return `${window.location.origin}/s/${key}`;
}

/** Extract token from pasted sub URL or raw token. */
export function parseSubscriptionToken(input: string): string {
  const raw = String(input || "").trim();
  if (!raw) return "";
  const match = raw.match(/\/s\/([^/?#]+)/i);
  if (match?.[1]) return decodeURIComponent(match[1]);
  try {
    const u = new URL(raw);
    const pathMatch = u.pathname.match(/\/s\/([^/?#]+)/i);
    if (pathMatch?.[1]) return decodeURIComponent(pathMatch[1]);
  } catch {
    /* not a URL */
  }
  return raw;
}

export function buildPortalBridgeLink(token?: string | null, storeSlug?: string | null) {
  const base = portalPathForSlug(storeSlug, "login");
  if (!token) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}token=${encodeURIComponent(token)}`;
}
