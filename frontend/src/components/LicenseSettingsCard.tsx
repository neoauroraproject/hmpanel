"use client";

import { Key, RefreshCw, Power, PowerOff } from "lucide-react";
import { useState } from "react";
import { Card } from "@/components/ui";
import { useLicenseActivation } from "@/hooks/useLicenseActivation";

export function LicenseSettingsCard() {
  const [key, setKey] = useState("");
  const { licenseQuery, activate, deactivate, recheck } = useLicenseActivation();
  const state = licenseQuery.data;

  const statusLabel =
    state?.status === "active"
      ? "Active"
      : state?.status === "grace"
        ? "Grace period"
        : state?.status === "community"
          ? "Community"
          : state?.status || "Unknown";

  const modeBanner =
    state?.mode === "read_only" ? (
      <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-sm p-3 mb-4">
        Premium is in read-only mode. Renew or reconnect to restore full access.
      </div>
    ) : null;

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
          <Key size={20} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">Premium License</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Activate HMPanel Premium with your license key
          </p>
        </div>
      </div>

      {modeBanner}

      <div className="grid grid-cols-2 gap-3 text-sm mb-4">
        <div>
          <span className="text-zinc-500">Status</span>
          <p className="font-medium">{statusLabel}</p>
        </div>
        <div>
          <span className="text-zinc-500">Mode</span>
          <p className="font-medium capitalize">{state?.mode || "—"}</p>
        </div>
        <div>
          <span className="text-zinc-500">Expires</span>
          <p className="font-medium">
            {state?.expiresAt ? new Date(state.expiresAt).toLocaleDateString() : "Never"}
          </p>
        </div>
        <div>
          <span className="text-zinc-500">Bundle</span>
          <p className="font-medium">
            {state?.bundle?.installed
              ? state.bundle.version || "installed"
              : "Not installed"}
          </p>
        </div>
      </div>

      {state?.status === "community" || state?.mode === "disabled" ? (
        <div className="space-y-3">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            License key
          </label>
          <input
            type="text"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="HM-XXXX-XXXX-XXXX"
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-zinc-800 dark:text-zinc-100 outline-none focus:border-emerald-500"
          />
          <button
            type="button"
            disabled={activate.isPending || !key.trim()}
            onClick={() => activate.mutate(key.trim())}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            <Power size={16} />
            {activate.isPending ? "Activating…" : "Activate"}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => recheck.mutate()}
            disabled={recheck.isPending}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            <RefreshCw size={14} className={recheck.isPending ? "animate-spin" : ""} />
            Re-check
          </button>
          <button
            type="button"
            onClick={() => deactivate.mutate()}
            disabled={deactivate.isPending}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/40 text-red-500 text-sm hover:bg-red-500/10"
          >
            <PowerOff size={14} />
            Deactivate
          </button>
        </div>
      )}

      {state?.lastHeartbeatAt && (
        <p className="text-xs text-zinc-500 mt-4">
          Last heartbeat: {new Date(state.lastHeartbeatAt).toLocaleString()}
        </p>
      )}
    </Card>
  );
}
