"use client";

import { useEffect, useState } from "react";
import { usePluginRegistry } from "@/store/pluginRegistry";
import { useLicenseActivation } from "@/hooks/useLicenseActivation";
import { api } from "@/lib/api";

declare global {
  interface Window {
    HMPANEL_PREMIUM_REGISTER?: (registry: typeof usePluginRegistry) => void;
    HMPANEL_PREMIUM_SYNC?: (modules: unknown[]) => void;
    __HMPANEL_FETCH_PATCHED?: boolean;
  }
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

async function syncModulesAfterRuntime() {
  if (window.HMPANEL_PREMIUM_SYNC) return;
  try {
    const res = await api.get("/platform/premium-module-catalog");
    const modules = Array.isArray(res.data) ? res.data : [];
    if (modules.length && window.HMPANEL_PREMIUM_REGISTER) {
      window.HMPANEL_PREMIUM_REGISTER(usePluginRegistry);
    }
  } catch {
    /* runtime internal fetch handles registration when patched */
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

  useEffect(() => {
    if (!isPremium || loaded) return;

    patchPremiumModulesFetch();

    const script = document.createElement("script");
    script.src = `/api/platform/premium-assets/frontend/premium-runtime.js`;
    script.async = true;
    script.onload = async () => {
      if (window.HMPANEL_PREMIUM_REGISTER) {
        window.HMPANEL_PREMIUM_REGISTER(usePluginRegistry);
      }
      await syncModulesAfterRuntime();
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
      usePluginRegistry.getState().unregisterAll();
      setLoaded(false);
    }
  }, [isPremium]);

  return null;
}
