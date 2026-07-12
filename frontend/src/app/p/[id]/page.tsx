"use client";

import DefaultTheme from "./themes/DefaultTheme";

/**
 * Community / free edition subscription portal.
 * Only the classic Dark DefaultTheme is available.
 * Premium themes (Aurora, Light, Cyberpunk, Sunset, Minimalist, Hacker) ship in Panel - Premium.
 */
export default function SubscriptionPage({ params }: { params: Promise<{ id: string }> }) {
  return <DefaultTheme params={params} />;
}
