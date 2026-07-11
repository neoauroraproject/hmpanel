"use client";

/** Same System Sub link as Clients page: /s/{subId} */
export function buildSubscriptionLink(subId?: string | null, fallback?: string | null) {
  const key = subId || fallback;
  if (!key) return "";
  if (typeof window === "undefined") return `/s/${key}`;
  return `${window.location.origin}/s/${key}`;
}

export function buildPortalBridgeLink(token?: string | null) {
  if (!token) return "/portal";
  return `/portal/${token}`;
}
