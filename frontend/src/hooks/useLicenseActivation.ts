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
    lastLoadError?: string | null;
  };
}

async function waitForBackend(timeoutMs = 90_000) {
  const started = Date.now();
  // Give the process a moment to exit before we start polling.
  await new Promise((r) => setTimeout(r, 2000));
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      if (res.ok) return true;
    } catch {
      /* backend still down */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

export function useLicenseActivation() {
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);

  const licenseQuery = useQuery({
    queryKey: ["platform-license"],
    queryFn: async () => (await api.get<LicenseState>("/platform/license")).data,
    retry: false,
    staleTime: 60_000,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["platform-license"] });
    qc.invalidateQueries({ queryKey: ["license"] });
    qc.invalidateQueries({ queryKey: ["premium-modules"] });
    qc.invalidateQueries({ queryKey: ["features"] });
  };

  const handleSuccess = async (data: {
    message?: string;
    needsReload?: boolean;
    needsRestart?: boolean;
    autoRestart?: boolean;
  }) => {
    invalidateAll();
    if (data?.message) {
      toast(data.message, data.needsRestart && !data.autoRestart ? "error" : "success");
    }

    if (data?.autoRestart) {
      toast("Waiting for backend restart…", "success");
      const up = await waitForBackend();
      if (up) {
        toast("Backend is back — refreshing…", "success");
        window.location.reload();
      } else {
        toast("Backend did not come back in time. Restart the panel container manually.", "error");
      }
      return;
    }

    if (data?.needsReload) {
      setTimeout(() => window.location.reload(), data.needsRestart ? 2500 : 800);
    }
  };

  const activate = useMutation({
    mutationFn: async (licenseKey: string) =>
      (await api.post("/platform/license/activate", { licenseKey })).data,
    onSuccess: (data) => {
      void handleSuccess(data);
    },
    onError: (e: any) =>
      toast(e?.response?.data?.message || e?.response?.data?.error || "Activation failed", "error"),
  });

  const deactivate = useMutation({
    mutationFn: async () => (await api.post("/platform/license/deactivate")).data,
    onSuccess: (data) => {
      toast("License deactivated — Community mode restored");
      void handleSuccess({ ...data, message: "Community mode restored. Refreshing…", needsReload: true });
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
    onSuccess: (data) => {
      void handleSuccess(data);
    },
    onError: (e: any) => toast(e?.response?.data?.message || "Bundle update failed", "error"),
  });

  const reloadPlugins = useMutation({
    mutationFn: async () => (await api.post("/platform/license/reload-plugins")).data,
    onSuccess: (data: {
      loaded?: boolean;
      lastLoadError?: string;
      autoRestart?: boolean;
      message?: string;
    }) => {
      void handleSuccess({
        message: data.message,
        needsReload: true,
        needsRestart: !data.loaded || !!data.lastLoadError,
        autoRestart: data.autoRestart,
      });
    },
    onError: (e: any) => toast(e?.response?.data?.message || "Reload failed", "error"),
  });

  return { licenseQuery, activate, deactivate, recheck, updateBundle, reloadPlugins };
}
