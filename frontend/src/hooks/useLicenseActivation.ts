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
  supportUrl?: string;
  bundle?: {
    installed: boolean;
    version: string | null;
    pluginsLoaded?: boolean;
  };
}

export function useLicenseActivation() {
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);

  const licenseQuery = useQuery({
    queryKey: ["platform-license"],
    queryFn: async () => (await api.get<LicenseState>("/platform/license")).data,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["platform-license"] });
    qc.invalidateQueries({ queryKey: ["license"] });
    qc.invalidateQueries({ queryKey: ["premium-modules"] });
    qc.invalidateQueries({ queryKey: ["features"] });
  };

  const handleSuccess = (data: { message?: string; needsReload?: boolean; needsRestart?: boolean }) => {
    invalidateAll();
    if (data?.message) {
      toast(data.message, data.needsRestart ? "error" : "success");
    }
    if (data?.needsReload) {
      setTimeout(() => window.location.reload(), data.needsRestart ? 2500 : 800);
    }
  };

  const activate = useMutation({
    mutationFn: async (licenseKey: string) =>
      (await api.post("/platform/license/activate", { licenseKey })).data,
    onSuccess: (data) => handleSuccess(data),
    onError: (e: any) =>
      toast(e?.response?.data?.message || e?.response?.data?.error || "Activation failed", "error"),
  });

  const deactivate = useMutation({
    mutationFn: async () => (await api.post("/platform/license/deactivate")).data,
    onSuccess: (data) => {
      toast("License deactivated — Community mode restored");
      handleSuccess({ ...data, message: "Community mode restored. Refreshing…", needsReload: true });
    },
    onError: () => toast("Deactivate failed", "error"),
  });

  const recheck = useMutation({
    mutationFn: async () => (await api.post("/platform/license/recheck")).data,
    onSuccess: () => {
      toast("License rechecked");
      invalidateAll();
    },
  });

  const updateBundle = useMutation({
    mutationFn: async () => (await api.post("/platform/license/update-bundle")).data,
    onSuccess: (data) => handleSuccess(data),
    onError: (e: any) => toast(e?.response?.data?.message || "Bundle update failed", "error"),
  });

  return { licenseQuery, activate, deactivate, recheck, updateBundle };
}
