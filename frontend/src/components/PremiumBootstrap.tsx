"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import * as ReactDOM from "react-dom";
import * as JsxRuntime from "react/jsx-runtime";
import { usePluginRegistry } from "@/store/pluginRegistry";
import { useLicenseActivation } from "@/hooks/useLicenseActivation";
import { usePremiumModules } from "@/hooks/usePremiumModules";
import { api } from "@/lib/api";

declare global {
  interface Window {
    HMPANEL_PREMIUM_REGISTER?: (registry: typeof usePluginRegistry) => void;
    HMPANEL_PREMIUM_SYNC?: (modules: unknown[]) => void;
    __HMPANEL_FETCH_PATCHED?: boolean;
    __HMPANEL_JSX_RUNTIME?: unknown;
    React?: unknown;
    ReactDOM?: unknown;
  }
}

/** Premium runtime is a separate IIFE with React marked external — expose host React so it can resolve it. */
function exposeReactGlobals() {
  if (typeof window === "undefined") return;
  window.React = React;
  window.ReactDOM = ReactDOM;
  window.__HMPANEL_JSX_RUNTIME = JsxRuntime;
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

    exposeReactGlobals();
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
