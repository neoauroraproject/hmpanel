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
  link.href = "/api/platform/premium-assets/frontend/premium-runtime.css";
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

  useEffect(() => {
    if (!isPremium || loaded) return;

    exposeSharedModules();
    patchPremiumModulesFetch();

    const script = document.createElement("script");
    script.src = `/api/platform/premium-assets/frontend/premium-runtime.js`;
    script.async = true;
    script.onload = async () => {
      if (window.HMPANEL_PREMIUM_REGISTER) {
        window.HMPANEL_PREMIUM_REGISTER(usePluginRegistry);
      }
      await syncModulesFromCatalog();
      setLoaded(true);
    };
    script.onerror = () => {
      /* Bundle backend may be loaded without frontend runtime yet */
    };
    document.body.appendChild(script);

    return () => {
      script.remove();
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
    if (!isPremium) {
      usePluginRegistry.getState().unregisterAll();
      setLoaded(false);
      removePremiumStyles();
    }
  }, [isPremium]);

  return null;
}
