"use client";

import { useEffect, useState } from "react";
import { useLicenseActivation } from "@/hooks/useLicenseActivation";
import { usePremiumModules } from "@/hooks/usePremiumModules";
import { usePluginRegistry } from "@/store/pluginRegistry";
import { useAuth } from "@/store/auth";
import { PageHeader, Card, Spinner, ErrorBox } from "@/components/ui";
import { PremiumOverlayBoundary } from "@/components/PremiumOverlayBoundary";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useT } from "@/i18n";
import { PremiumGem } from "@/components/PremiumGem";

const OVERLAY_WAIT_MS = 15_000;

function runtimeLoadError() {
  if (typeof window === "undefined") return "";
  return String(window.__HMPANEL_PREMIUM_LOAD_ERROR || "").trim();
}

export default function PremiumSettingsPage() {
  const t = useT();
  const admin = useAuth((s) => s.admin);
  const premiumRoute = usePluginRegistry((s) => s.routes["/settings/premium"]);
  const { licenseQuery } = useLicenseActivation();
  const state = licenseQuery.data;
  const [waitMs, setWaitMs] = useState(0);

  const isPremium =
    state?.edition === "PREMIUM" &&
    state?.status !== "community" &&
    state?.mode !== "disabled";
  const bundleInstalled = Boolean(state?.bundle?.installed);
  const wantsOverlay = isPremium && bundleInstalled;

  const { data: modules, isLoading } = usePremiumModules({ enabled: isPremium });

  useEffect(() => {
    if (premiumRoute || !wantsOverlay) return;
    const id = window.setInterval(() => setWaitMs((ms) => ms + 400), 400);
    return () => window.clearInterval(id);
  }, [premiumRoute, wantsOverlay]);

  if (licenseQuery.isLoading && !state) return <Spinner />;

  if (admin && admin.role !== "SUPER_ADMIN") {
    return <ErrorBox message="Only Super Admin can access Premium Settings." />;
  }

  if (licenseQuery.isError && !state) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("premium.settingsTitle")} subtitle={t("premium.settingsSubtitle")} />
        <ErrorBox message={t("premium.licenseUnreachable")} />
      </div>
    );
  }

  if (!isPremium) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("premium.settingsTitle")} subtitle={t("premium.settingsSubtitle")} />
        <Card className="p-6 text-sm text-zinc-500">
          Activate your premium license under Global Settings → Premium License.
        </Card>
      </div>
    );
  }

  if (premiumRoute) {
    const Component = premiumRoute.component;
    return (
      <PremiumOverlayBoundary
        fallback={
          <div className="space-y-6">
            <PageHeader title={t("premium.settingsTitle")} subtitle={t("premium.settingsSubtitle")} />
            <ErrorBox message={t("premium.overlayCrashed")} />
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
            >
              {t("premium.reloadPage")}
            </button>
          </div>
        }
      >
        <div id="hmpanel-premium-root" className="min-w-0">
          <Component />
        </div>
      </PremiumOverlayBoundary>
    );
  }

  if (wantsOverlay && waitMs < OVERLAY_WAIT_MS) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("premium.settingsTitle")} subtitle={t("premium.settingsSubtitle")} />
        <Spinner />
        <p className="text-center text-sm text-zinc-500">{t("premium.overlayLoading")}</p>
      </div>
    );
  }

  const loadError =
    runtimeLoadError() ||
    String(state?.bundle?.lastLoadError || "").trim();

  return (
    <div className="space-y-6">
      <PageHeader title={t("premium.settingsTitle")} subtitle={t("premium.settingsSubtitle")} />
      {wantsOverlay ? (
        <ErrorBox
          message={
            loadError
              ? `${t("premium.overlayFailed")} ${loadError}`
              : t("premium.overlayFailed")
          }
        />
      ) : (
        <Card className="p-4 text-sm text-zinc-500">{t("premium.bundleNotInstalled")}</Card>
      )}
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
      >
        {t("premium.reloadPage")}
      </button>
      {isLoading ? (
        <Spinner />
      ) : (
        <div className="grid gap-3">
          {(modules || []).map((mod) => (
            <Link key={mod.id} href={mod.frontendPath}>
              <Card className="p-4 flex items-center justify-between hover:border-emerald-500/50 transition-colors">
                <div className="flex items-center gap-3">
                  <PremiumGem size={18} className="text-emerald-500" />
                  <div>
                    <p className="font-medium text-zinc-800 dark:text-zinc-100">{mod.name}</p>
                    <p className="text-xs text-zinc-500">{mod.description}</p>
                  </div>
                </div>
                <ChevronRight className="text-zinc-400" size={18} />
              </Card>
            </Link>
          ))}
          {!modules?.length && (
            <Card className="p-6 text-sm text-zinc-500">
              Premium modules are loading. If this persists, restart the panel service and refresh.
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
