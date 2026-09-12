"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";

export interface PremiumModule {
  id: string;
  name: string;
  description: string;
  kind: "PLATFORM" | "BUSINESS";
  version: string;
  phase: number;
  enabled: boolean;
  frontendPath: string;
  settingsSchema: Record<string, unknown>;
  settings: Record<string, unknown>;
  status: "healthy" | "read_only" | "disabled" | "future";
  mode?: "full" | "read_only" | "disabled";
  canWrite?: boolean;
}

export function usePremiumModules(options?: { enabled?: boolean }) {
  const token = useAuth((s) => s.token);
  const enabled = (options?.enabled ?? true) && !!token;

  return useQuery({
    queryKey: ["premium-modules", token],
    queryFn: async () => {
      try {
        const res = await api.get<PremiumModule[]>("/premium-modules");
        if (Array.isArray(res.data) && res.data.length > 0) return res.data;
      } catch {
        /* bundle API not loaded — fall through */
      }
      try {
        const fallback = await api.get<PremiumModule[]>("/platform/premium-module-catalog");
        return fallback.data ?? [];
      } catch {
        return [];
      }
    },
    enabled,
    staleTime: 15_000,
    retry: false,
  });
}
