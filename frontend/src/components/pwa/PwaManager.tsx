"use client";

import { useEffect } from "react";
import {
  APP_VERSION_STORAGE_KEY,
  fetchAppVersion,
  versionKey,
} from "@/lib/app-brand";

const RELOAD_GUARD_KEY = "hm-reloaded-for";
const RESUME_CHECK_AFTER_MS = 30_000;

async function clearAppCaches() {
  if (typeof caches === "undefined") return;
  const names = await caches.keys();
  await Promise.all(names.filter((n) => n.startsWith("hm-")).map((n) => caches.delete(n)));
}

async function registerWorker(key: string) {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return null;
  if (process.env.NODE_ENV !== "production") return null;
  try {
    const reg = await navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(key)}`, {
      scope: "/",
      updateViaCache: "none",
    });
    reg.update().catch(() => undefined);
    return reg;
  } catch {
    return null;
  }
}

/**
 * Keeps the installed app current: on every launch (and when it returns from the background)
 * it compares the server's panel + premium version with the last one seen and, if it changed,
 * drops cached assets and reloads once so the new build is live without a manual refresh.
 */
export function PwaManager() {
  useEffect(() => {
    let cancelled = false;
    let hiddenAt = 0;

    const check = async () => {
      let key: string;
      try {
        key = versionKey(await fetchAppVersion());
      } catch {
        return;
      }
      if (cancelled) return;

      await registerWorker(key);

      const previous = localStorage.getItem(APP_VERSION_STORAGE_KEY);
      localStorage.setItem(APP_VERSION_STORAGE_KEY, key);

      // UI build id baked into the JS bundle — if the server moved ahead but
      // this tab still has an old chunk, force one hard reload.
      const build = (process.env.NEXT_PUBLIC_APP_VERSION || "").replace(/^v/i, "");
      const runtime = key.split("-")[0]?.replace(/^v/i, "") || "";
      const uiStale =
        !!build &&
        build !== "unknown" &&
        !!runtime &&
        runtime !== "unknown" &&
        build !== runtime;

      if (!uiStale && (!previous || previous === key)) return;
      if (sessionStorage.getItem(RELOAD_GUARD_KEY) === key) return;

      sessionStorage.setItem(RELOAD_GUARD_KEY, key);
      await clearAppCaches().catch(() => undefined);
      window.location.reload();
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt && Date.now() - hiddenAt > RESUME_CHECK_AFTER_MS) void check();
      hiddenAt = 0;
    };

    void check();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
