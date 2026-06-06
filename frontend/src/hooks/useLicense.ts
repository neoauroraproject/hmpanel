"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type PremiumFeature =
  | 'CUSTOM_DOMAINS'
  | 'WHITE_LABEL'
  | 'CUSTOM_SUBSCRIPTION_PORTAL'
  | 'ADVANCED_ANALYTICS'
  | 'REMOTE_BACKUPS'
  | 'SMART_ALERTS'
  | 'XRAY_PRO';

export function useLicense() {
  const { data: features, isLoading } = useQuery({
    queryKey: ["license"],
    queryFn: async () => {
      try {
        const res = await api.get<Record<PremiumFeature, boolean>>("/settings/license");
        return res.data;
      } catch (e) {
        // Fallback to all false if the server is unreachable
        return {} as Record<PremiumFeature, boolean>;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });

  const hasFeature = (feature: PremiumFeature) => {
    if (!features) return false;
    return !!features[feature];
  };

  return { features, isLoading, hasFeature };
}
