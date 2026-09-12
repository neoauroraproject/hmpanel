"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { usePluginRegistry } from "@/store/pluginRegistry";
import { PageHeader, Card, ErrorBox, Spinner } from "@/components/ui";
import { PremiumOverlayBoundary } from "@/components/PremiumOverlayBoundary";
import { useT } from "@/i18n";

export default function PremiumPluginPage() {
  const t = useT();
  const params = useParams();
  const pluginPathSegments = params.plugin as string[];
  const pluginPath = `/${pluginPathSegments.join("/")}`;
  const fullPath = `/premium${pluginPath}`;

  const route = usePluginRegistry((state) => state.routes[fullPath]);
  const [waitMs, setWaitMs] = useState(0);

  useEffect(() => {
    if (route) return;
    const id = window.setInterval(() => setWaitMs((ms) => ms + 500), 500);
    return () => window.clearInterval(id);
  }, [route, fullPath]);

  if (!route) {
    if (waitMs < 12000) {
      return (
        <div className="space-y-6">
          <PageHeader title={t("app.premium")} subtitle={t("premium.moduleLoading")} />
          <Spinner />
        </div>
      );
    }
    return (
      <div className="space-y-6">
        <PageHeader title={t("app.premium")} subtitle={t("premium.moduleMissing")} />
        <Card className="p-8 text-center text-zinc-500">
          <ErrorBox
            message={
              typeof window !== "undefined" && window.__HMPANEL_PREMIUM_LOAD_ERROR
                ? `${t("premium.moduleNotLoaded", { path: fullPath })} ${window.__HMPANEL_PREMIUM_LOAD_ERROR}`
                : t("premium.moduleNotLoaded", { path: fullPath })
            }
          />
        </Card>
      </div>
    );
  }

  const Component = route.component;
  return (
    <PremiumOverlayBoundary
      fallback={
        <div className="space-y-6">
          <PageHeader title={t("app.premium")} subtitle={t("premium.moduleMissing")} />
          <ErrorBox message={t("premium.overlayCrashed")} />
        </div>
      }
    >
      <div id="hmpanel-premium-root" className="min-w-0 max-w-full overflow-x-hidden">
        <Component />
      </div>
    </PremiumOverlayBoundary>
  );
}
