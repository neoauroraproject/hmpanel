"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Diamond } from "lucide-react";
import { useAuth } from "@/store/auth";
import { usePluginRegistry } from "@/store/pluginRegistry";
import { usePremiumModules } from "@/hooks/usePremiumModules";
import { useLicenseActivation } from "@/hooks/useLicenseActivation";
import { api } from "@/lib/api";
import { useT } from "@/i18n";
import { translatePremiumMenuTitle } from "@/lib/premium-nav";
import {
  PREMIUM_MENU_ICONS,
  buildAppNav,
  type NavIcon,
  type PremiumNavInput,
} from "@/lib/nav-config";

export function useAppNav() {
  const t = useT();
  const admin = useAuth((s) => s.admin);
  const { licenseQuery } = useLicenseActivation();
  const dynamicMenus = usePluginRegistry((s) => s.menus);

  const isPremium =
    licenseQuery.data?.edition === "PREMIUM" &&
    licenseQuery.data?.status !== "community" &&
    licenseQuery.data?.mode !== "disabled";

  const { data: premiumModules = [] } = usePremiumModules({ enabled: isPremium });

  const storeModuleEnabled = premiumModules.some(
    (m) => m.id === "store" && m.enabled && m.status !== "disabled" && m.status !== "future",
  );
  const { data: storeDash } = useQuery<{ newOrders?: number }>({
    queryKey: ["store-dashboard"],
    queryFn: async () => (await api.get("/premium-modules/store/dashboard")).data,
    enabled: isPremium && storeModuleEnabled,
    refetchInterval: 20_000,
    staleTime: 10_000,
    retry: false,
  });
  const storeHasNewOrders = (storeDash?.newOrders ?? 0) > 0;

  const { data: rechargePending } = useQuery<{ count?: number }>({
    queryKey: ["admin-recharge-pending-count"],
    queryFn: async () =>
      (await api.get("/premium-modules/admin-recharge/pending-count")).data,
    enabled: isPremium && admin?.role === "SUPER_ADMIN",
    refetchInterval: 20_000,
    staleTime: 10_000,
    retry: false,
  });
  const rechargePendingCount = rechargePending?.count ?? 0;

  const premiumItems: PremiumNavInput[] = useMemo(() => {
    if (!isPremium) return [];
    const items: PremiumNavInput[] = [];
    if (admin?.role === "SUPER_ADMIN") {
      items.push({
        title: t("nav.premiumSettings"),
        href: "/settings/premium",
        icon: Diamond,
        moduleId: "premium-settings",
      });
      for (const m of dynamicMenus) {
        items.push({
          title: translatePremiumMenuTitle(t, {
            moduleId: m.moduleId as string | undefined,
            href: m.href,
            fallback: m.title,
          }),
          href: m.href,
          icon: (PREMIUM_MENU_ICONS[String(m.moduleId || "")] ||
            (m.icon as NavIcon) ||
            Diamond) as NavIcon,
          moduleId: m.moduleId as string | undefined,
        });
      }
    }
    for (const m of premiumModules) {
      if (m.status === "disabled" || m.status === "future" || !m.enabled) continue;
      if (admin?.role !== "SUPER_ADMIN" && m.kind !== "BUSINESS") continue;
      items.push({
        title: translatePremiumMenuTitle(t, {
          moduleId: m.id,
          href: m.frontendPath,
          fallback: m.name,
        }),
        href: m.frontendPath,
        icon: PREMIUM_MENU_ICONS[m.id] || Diamond,
        moduleId: m.id,
      });
    }
    if (admin?.role === "SUPER_ADMIN") {
      items.push({
        title: t("nav.themes"),
        href: "/premium/themes",
        icon: PREMIUM_MENU_ICONS.themes,
        moduleId: "themes",
      });
    }
    return items.filter((menu, i, arr) => arr.findIndex((x) => x.href === menu.href) === i);
  }, [isPremium, admin?.role, dynamicMenus, premiumModules, t]);

  const sections = useMemo(
    () => buildAppNav(admin?.role, premiumItems),
    [admin?.role, premiumItems],
  );

  return {
    sections,
    storeHasNewOrders,
    rechargePendingCount,
  };
}
