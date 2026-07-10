"use client";

import { Key, RefreshCw, Power, PowerOff, ExternalLink, Sparkles } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui";
import { useLicenseActivation } from "@/hooks/useLicenseActivation";
import { formatLicenseExpiry } from "@/lib/format";

const SUPPORT_URL = "https://t.me/hmraysupport";

export function LicenseSettingsCard() {
  const [key, setKey] = useState("");
  const { licenseQuery, activate, deactivate, recheck, updateBundle, reloadPlugins } = useLicenseActivation();
  const state = licenseQuery.data;
  const autoReloadTried = useRef(false);

  useEffect(() => {
    if (autoReloadTried.current) return;
    if (
      state?.bundle?.installed &&
      state?.edition === "PREMIUM" &&
      state?.bundle?.pluginsLoaded === false
    ) {
      autoReloadTried.current = true;
      reloadPlugins.mutate();
    }
  }, [state?.bundle?.installed, state?.bundle?.pluginsLoaded, state?.edition]);

  const isPremium =
    state?.edition === "PREMIUM" &&
    state?.status !== "community" &&
    state?.mode !== "disabled";

  const statusLabel = isPremium
    ? "Premium Edition"
    : state?.status === "grace"
      ? "Grace period"
      : "Community Edition";

  const expiryLabel = state?.expiresAt ? formatLicenseExpiry(state.expiresAt) : null;

  const expiryBanner =
    isPremium && expiryLabel ? (
      <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-sm p-3 mb-4">
        License valid until <strong>{expiryLabel}</strong>
      </div>
    ) : null;

  const modeBanner =
    state?.mode === "read_only" ? (
      <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-sm p-3 mb-4">
        Premium is in read-only mode. Renew or reconnect to restore full access.
      </div>
    ) : null;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${isPremium ? "bg-emerald-500/10 text-emerald-500" : "bg-zinc-500/10 text-zinc-500"}`}>
            {isPremium ? <Sparkles size={20} /> : <Key size={20} />}
          </div>
          <div>
            <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">
              {isPremium ? "Premium Edition" : "Premium License"}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              {isPremium
                ? "Your panel is running with premium modules"
                : "Activate HMPanel Premium with your license key"}
            </p>
          </div>
        </div>
        <span
          className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
            isPremium
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              : "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400"
          }`}
        >
          {statusLabel}
        </span>
      </div>

      {expiryBanner}
      {modeBanner}

      <div className="grid grid-cols-2 gap-3 text-sm mb-4">
        <div>
          <span className="text-zinc-500">Status</span>
          <p className="font-medium capitalize">{state?.status || "—"}</p>
        </div>
        <div>
          <span className="text-zinc-500">Mode</span>
          <p className="font-medium capitalize">{state?.mode || "—"}</p>
        </div>
        <div>
          <span className="text-zinc-500">Expires</span>
          <p className="font-medium">{expiryLabel || "Never"}</p>
        </div>
        <div>
          <span className="text-zinc-500">Bundle</span>
          <p className="font-medium">
            {state?.bundle?.installed
              ? state.bundle.version || "installed"
              : "Not installed"}
          </p>
          {state?.bundle?.installed && state.bundle.pluginsLoaded === false && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              Modules not loaded
              {state.bundle.lastLoadError ? `: ${state.bundle.lastLoadError}` : ""}
            </p>
          )}
        </div>
      </div>

      <a
        href={SUPPORT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm text-blue-500 hover:text-blue-400 mb-4"
      >
        <ExternalLink size={14} />
        Purchase or renew license — Telegram support
      </a>

      {!isPremium ? (
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
            {activate.isPending ? "Activating…" : "Activate Premium"}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => updateBundle.mutate()}
            disabled={updateBundle.isPending}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            <RefreshCw size={14} className={updateBundle.isPending ? "animate-spin" : ""} />
            Update premium bundle
          </button>
          <button
            type="button"
            onClick={() => recheck.mutate()}
            disabled={recheck.isPending}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            <RefreshCw size={14} className={recheck.isPending ? "animate-spin" : ""} />
            Re-check license
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
