"use client";

import { portalPathForSlug } from "./store-slug";

/** Same System Sub link as Clients page: /s/{subId} */
export function buildSubscriptionLink(subId?: string | null, fallback?: string | null) {
  const key = subId || fallback;
  if (!key) return "";
  if (typeof window === "undefined") return `/s/${key}`;
  return `${window.location.origin}/s/${key}`;
}

export function buildPortalBridgeLink(token?: string | null, storeSlug?: string | null) {
  const base = portalPathForSlug(storeSlug, "login");
  if (!token) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}token=${encodeURIComponent(token)}`;
}
