"use client";

import { useSyncExternalStore } from "react";

/**
 * Reads the effective look from <html data-ui> instead of the host's zustand store.
 * Premium bundles compile Community sources into their own runtime, so a store import
 * would create a second, disconnected instance; the DOM attribute is the one value both
 * sides share. On hosts that predate the modern look the attribute never appears, so
 * callers simply render their classic layout.
 */
function subscribe(onChange: () => void) {
  if (typeof document === "undefined") return () => undefined;
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-ui", "data-ui-nav"] });
  return () => observer.disconnect();
}

function snapshot() {
  return typeof document !== "undefined" && document.documentElement.getAttribute("data-ui") === "modern";
}

export function useModernUi(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
