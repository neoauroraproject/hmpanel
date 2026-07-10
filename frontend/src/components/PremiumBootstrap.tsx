"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import * as ReactDOM from "react-dom";
import * as ReactDOMClient from "react-dom/client";
import * as JsxRuntime from "react/jsx-runtime";
import * as ReactQuery from "@tanstack/react-query";
import * as NextNavigation from "next/navigation";
import * as NextLink from "next/link";
import { usePluginRegistry } from "@/store/pluginRegistry";
import { useLicenseActivation } from "@/hooks/useLicenseActivation";
import { usePremiumModules } from "@/hooks/usePremiumModules";
import { api } from "@/lib/api";

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
 * reuse the host's React, react-query client (shared data cache) and Next router instead
 * of bundling their own. The premium runtime marks these external and resolves them from
 * this map at load time.
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
  };
  window.React = React;
  window.ReactDOM = ReactDOM;
}

/** Tailwind utilities used only by premium module files aren't in the panel CSS — load the bundle's own. */
function injectPremiumStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById("hmpanel-premium-styles")) return;
  const link = document.createElement("link");
  link.id = "hmpanel-premium-styles";
  link.rel = "stylesheet";
  link.href = "/api/platform/premium-assets/frontend/premium-runtime.css";
  document.head.appendChild(link);
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
    if (
      url.includes("/premium-modules") &&
      !url.match(/\/premium-modules\/[a-z]/i)
    ) {
      return origFetch("/api/platform/premium-module-catalog", {
        ...init,
        credentials: init?.credentials ?? "include",
      });
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
  const { licenseQuery } = useLicenseActivation();
  const [loaded, setLoaded] = useState(false);
  const state = licenseQuery.data;

  const isPremium =
    state?.edition === "PREMIUM" &&
    state?.status !== "community" &&
    state?.mode !== "disabled" &&
    state?.bundle?.installed;

  const { data: premiumModules } = usePremiumModules({ enabled: isPremium });

  useEffect(() => {
    if (!isPremium || loaded) return;

    exposeSharedModules();
    patchPremiumModulesFetch();
    injectPremiumStyles();

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
    if (!isPremium || !premiumModules?.length) return;
    if (window.HMPANEL_PREMIUM_SYNC) {
      window.HMPANEL_PREMIUM_SYNC(premiumModules);
    }
  }, [isPremium, premiumModules]);

  useEffect(() => {
    if (!isPremium) {
      usePluginRegistry.getState().unregisterAll();
      setLoaded(false);
    }
  }, [isPremium]);

  return null;
}
