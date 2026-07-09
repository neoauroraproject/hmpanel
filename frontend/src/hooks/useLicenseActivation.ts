"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/components/toast";

export interface LicenseState {
  status: string;
  mode: string;
  expiresAt: string | null;
  lastHeartbeatAt?: string | null;
  bundleVersion?: string | null;
  edition: string;
  bundle?: { installed: boolean; version: string | null };
}

export function useLicenseActivation() {
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);

  const licenseQuery = useQuery({
    queryKey: ["platform-license"],
    queryFn: async () => (await api.get<LicenseState>("/platform/license")).data,
  });

  const activate = useMutation({
    mutationFn: async (licenseKey: string) =>
      (await api.post("/platform/license/activate", { licenseKey })).data,
    onSuccess: () => {
      toast("License activated successfully");
      qc.invalidateQueries({ queryKey: ["platform-license"] });
      qc.invalidateQueries({ queryKey: ["features"] });
    },
    onError: (e: any) => toast(e?.response?.data?.message || "Activation failed", "error"),
  });

  const deactivate = useMutation({
    mutationFn: async () => (await api.post("/platform/license/deactivate")).data,
    onSuccess: () => {
      toast("License deactivated");
      qc.invalidateQueries({ queryKey: ["platform-license"] });
    },
    onError: () => toast("Deactivate failed", "error"),
  });

  const recheck = useMutation({
    mutationFn: async () => (await api.post("/platform/license/recheck")).data,
    onSuccess: () => {
      toast("License rechecked");
      qc.invalidateQueries({ queryKey: ["platform-license"] });
    },
  });

  return { licenseQuery, activate, deactivate, recheck };
}
