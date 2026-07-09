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

export function usePremiumModules() {
  const token = useAuth((s) => s.token);

  return useQuery({
    queryKey: ["premium-modules", token],
    queryFn: async () => {
      try {
        return (await api.get<PremiumModule[]>("/premium-modules")).data;
      } catch {
        return [];
      }
    },
    enabled: !!token,
    staleTime: 15_000,
    retry: false,
  });
}
