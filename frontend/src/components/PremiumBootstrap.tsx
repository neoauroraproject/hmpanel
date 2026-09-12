"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import * as ReactDOM from "react-dom";
import * as ReactDOMClient from "react-dom/client";
import * as JsxRuntime from "react/jsx-runtime";
import * as ReactQuery from "@tanstack/react-query";
import * as NextNavigation from "next/navigation";
import * as NextLink from "next/link";
import { usePathname } from "next/navigation";
import { usePluginRegistry } from "@/store/pluginRegistry";
import { useLicenseActivation } from "@/hooks/useLicenseActivation";
import { usePremiumModules } from "@/hooks/usePremiumModules";
import { api } from "@/lib/api";
import { isPublicAppPath } from "@/lib/public-paths";
import { useAuth } from "@/store/auth";
import * as ToastModule from "@/components/toast";
import * as I18nModule from "@/i18n";

declare global {
  interface Window {
    HMPANEL_PREMIUM_REGISTER?: (registry: typeof usePluginRegistry) => void;
    HMPANEL_PREMIUM_SYNC?: (modules: unknown[]) => void;
    __HMPANEL_FETCH_PATCHED?: boolean;
    __HMPANEL_SHARED?: Record<string, unknown>;
    __HMPANEL_PREMIUM_LOAD_ERROR?: string;
    React?: unknown;
    ReactDOM?: unknown;
  }
}

/**
 * Premium pages are plugins that render inside the panel's own React tree, so they must
 * reuse the host's React, react-query client (shared data cache), Next router, and toast
 * store instead of bundling their own. The premium runtime marks these external and
 * resolves them from this map at load time.
 */
function exposeSharedModules() {
  if (typeof window === "undefined") return;
  window.__HMPANEL_SHARED = {
    react: React,
    "react-dom": ReactDOM,
    "react-dom/client": ReactDOMClient,
    "react/jsx-runtime": JsxRuntime,
    "react/jsx-dev-runtime": JsxRuntime,
    "@tanstack/react-query": ReactQuery,
    "next/navigation": NextNavigation,
    "next/link": NextLink,
    // Stable key + import path aliases so premium-runtime never gets a second zustand toast store.
    "hmpanel/toast": ToastModule,
    "@/components/toast": ToastModule,
    // Same LocaleProvider context as the host shell (useT / mergeMessages).
    "hmpanel/i18n": I18nModule,
    "@/i18n": I18nModule,
  };
  window.React = React;
  window.ReactDOM = ReactDOM;
}

const PREMIUM_STYLE_ID = "hmpanel-premium-styles";

function isPremiumRoute(pathname: string) {
  return pathname.startsWith("/premium") || pathname.startsWith("/settings/premium");
}

/** Premium-only Tailwind utilities — must not load on free panel pages. */
function injectPremiumStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(PREMIUM_STYLE_ID)) return;
  const link = document.createElement("link");
  link.id = PREMIUM_STYLE_ID;
  link.rel = "stylesheet";
  link.href = "/api/platform/premium-assets/frontend/styles";
  document.head.appendChild(link);
}

function removePremiumStyles() {
  document.getElementById(PREMIUM_STYLE_ID)?.remove();
}

function patchPremiumModulesFetch() {
  if (window.__HMPANEL_FETCH_PATCHED) return;
  const origFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    // Only redirect the bare module list — never subpaths like /all, /assignments, /branding.
    try {
      const path = new URL(url, window.location.origin).pathname.replace(/\/+$/, "");
      if (path === "/api/premium-modules") {
        return origFetch("/api/platform/premium-module-catalog", {
          ...init,
          credentials: init?.credentials ?? "include",
        });
      }
    } catch {
      /* ignore malformed URLs */
    }
    return origFetch(input, init);
  }) as typeof fetch;
  window.__HMPANEL_FETCH_PATCHED = true;
}

async function syncModulesFromCatalog() {
  try {
    const res = await api.get("/platform/premium-module-catalog");
    const modules = Array.isArray(res.data) ? res.data : [];
    if (modules.length && window.HMPANEL_PREMIUM_SYNC) {
      window.HMPANEL_PREMIUM_SYNC(modules);
    }
  } catch {
    /* runtime registers default routes without API list */
  }
}

function applyPendingPremiumI18n() {
  const pending = (window as Window & {
    HMPANEL_PREMIUM_I18N?: { en?: Record<string, unknown>; fa?: Record<string, unknown> };
  }).HMPANEL_PREMIUM_I18N;
  const merge = (window as Window & {
    __HMPANEL_MERGE_I18N?: (loc: "en" | "fa", partial: Record<string, unknown>) => void;
  }).__HMPANEL_MERGE_I18N;
  if (typeof merge === "function" && pending) {
    if (pending.en) merge("en", pending.en);
    if (pending.fa) merge("fa", pending.fa);
  }
}

async function fetchPremiumRuntimeCode() {
  const urls = [
    "/platform/premium-assets/frontend/runtime",
    "/platform/premium-assets/frontend/premium-runtime.js",
  ];
  let last = "premium-runtime.js not available";
  for (const url of urls) {
    try {
      const res = await api.get(url, {
        responseType: "text",
        timeout: 60_000,
        transformResponse: [(data) => data],
        headers: { Accept: "application/javascript,text/javascript,text/plain,*/*" },
      });
      const code = typeof res.data === "string" ? res.data : String(res.data ?? "");
      if (code.length < 500 || /Premium runtime not installed|<!DOCTYPE html>/i.test(code)) {
        last = `invalid runtime from ${url} (${code.length} bytes)`;
        continue;
      }
      return code;
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      last = e?.response?.data?.message || e?.message || String(err);
    }
  }
  throw new Error(last);
}

function registerPremiumOverlay() {
  const register = window.HMPANEL_PREMIUM_REGISTER;
  if (!register) return false;
  register(usePluginRegistry);
  return true;
}

async function executePremiumRuntime(code: string) {
  exposeSharedModules();
  const blob = new Blob([code], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  try {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.dataset.hmpanelPremiumRuntime = "1";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("premium runtime failed to execute"));
      script.src = url;
      document.body.appendChild(script);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Loads premium frontend runtime from installed bundle when license is active. */
export function PremiumBootstrap() {
  const pathname = usePathname();
  const token = useAuth((s) => s.token);
  const onPublicPage = isPublicAppPath(pathname);
  const { licenseQuery } = useLicenseActivation();
  const [loaded, setLoaded] = useState(false);
  const state = licenseQuery.data;

  // Never bootstrap premium admin runtime on public guest pages.
  const isPremium =
    !onPublicPage &&
    !!token &&
    state?.edition === "PREMIUM" &&
    state?.status !== "community" &&
    state?.mode !== "disabled" &&
    state?.bundle?.installed;

  const { data: premiumModules } = usePremiumModules({ enabled: isPremium });
  const licenseUnknown =
    !!token && !onPublicPage && !licenseQuery.isFetched && !licenseQuery.data;

  useEffect(() => {
    if (!isPremium || loaded) return;

    let cancelled = false;
    exposeSharedModules();
    patchPremiumModulesFetch();
    delete window.__HMPANEL_PREMIUM_LOAD_ERROR;

    void (async () => {
      try {
        if (!registerPremiumOverlay()) {
          const code = await fetchPremiumRuntimeCode();
          if (cancelled) return;
          await executePremiumRuntime(code);
          exposeSharedModules();
          applyPendingPremiumI18n();
          if (!registerPremiumOverlay()) {
            throw new Error(
              "premium-runtime.js loaded but did not register (init threw before HMPANEL_PREMIUM_REGISTER)",
            );
          }
        }
        await syncModulesFromCatalog();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to load premium-runtime.js";
        window.__HMPANEL_PREMIUM_LOAD_ERROR = message;
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isPremium, loaded]);

  useEffect(() => {
    if (!isPremium) {
      removePremiumStyles();
      return;
    }
    if (isPremiumRoute(pathname)) {
      injectPremiumStyles();
    } else {
      removePremiumStyles();
    }
  }, [isPremium, pathname]);

  useEffect(() => {
    if (!isPremium || !premiumModules?.length) return;
    if (window.HMPANEL_PREMIUM_SYNC) {
      window.HMPANEL_PREMIUM_SYNC(premiumModules);
    }
  }, [isPremium, premiumModules]);

  useEffect(() => {
    if (licenseUnknown) return;
    if (!isPremium) {
      usePluginRegistry.getState().unregisterAll();
      setLoaded(false);
      removePremiumStyles();
    }
  }, [isPremium, licenseUnknown]);

  return null;
}
