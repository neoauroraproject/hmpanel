"use client";

import { useEffect, useState } from "react";
import { usePluginRegistry } from "@/store/pluginRegistry";
import { useLicenseActivation } from "@/hooks/useLicenseActivation";

declare global {
  interface Window {
    HMPANEL_PREMIUM_REGISTER?: (registry: typeof usePluginRegistry) => void;
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

    const script = document.createElement("script");
    script.src = `/api/platform/premium-assets/frontend/premium-runtime.js`;
    script.async = true;
    script.onload = () => {
      if (window.HMPANEL_PREMIUM_REGISTER) {
        window.HMPANEL_PREMIUM_REGISTER(usePluginRegistry);
      }
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
