"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { useLicenseActivation } from "@/hooks/useLicenseActivation";
import { PANEL_BRAND } from "@/lib/panel-brand";
import { useLocale } from "@/i18n";

export type ResellerShellSettings = {
  name?: string;
  nameFa?: string;
  logo?: string;
  showGithub?: boolean;
};

export function useResellerShell() {
  const admin = useAuth((s) => s.admin);
  const { locale } = useLocale();
  const { licenseQuery } = useLicenseActivation();
  const isPremium =
    licenseQuery.data?.edition === "PREMIUM" &&
    licenseQuery.data?.status !== "community" &&
    licenseQuery.data?.mode !== "disabled";
  const isReseller = !!admin && admin.role !== "SUPER_ADMIN";

  const { data } = useQuery({
    queryKey: ["reseller-shell"],
    queryFn: async () =>
      (await api.get<ResellerShellSettings>("/premium-modules/reseller-shell")).data,
    enabled: isPremium && !!admin,
    retry: false,
    staleTime: 60_000,
  });

  const customName =
    locale === "fa"
      ? String(data?.nameFa || data?.name || "").trim()
      : String(data?.name || data?.nameFa || "").trim();
  const customLogo = String(data?.logo || "").trim();

  return {
    name: isReseller && customName ? customName : locale === "fa" ? PANEL_BRAND.nameFa : PANEL_BRAND.name,
    logoSrc: isReseller && customLogo ? customLogo : PANEL_BRAND.logoPath,
    isCustomLogo: isReseller && Boolean(customLogo),
    showGithub: admin?.role === "SUPER_ADMIN" || (isReseller && data?.showGithub === true),
  };
}
