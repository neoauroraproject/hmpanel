"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Network, Loader2, ExternalLink, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useT } from "@/i18n";

type PortChangeStatus = {
  state: "idle" | "pending" | "running" | "success" | "rolled_back" | "failed";
  httpPort?: number;
  httpsPort?: number;
  message?: string;
  updatedAt?: number;
};

type PortsResponse = { httpPort: number; httpsPort: number; status: PortChangeStatus };

const POLL_MS = 2500;
const GIVE_UP_MS = 4 * 60_000;

function validPort(v: string): number | null {
  if (!/^\d{1,5}$/.test(v.trim())) return null;
  const n = Number(v);
  return n >= 1 && n <= 65535 ? n : null;
}

/** URL of this page once the panel listens on the new ports. */
function targetOrigin(httpPort: number, httpsPort: number): string {
  const { protocol, hostname } = window.location;
  const secure = protocol === "https:";
  const port = secure ? httpsPort : httpPort;
  const isDefault = (secure && port === 443) || (!secure && port === 80);
  const host = hostname.includes(":") ? `[${hostname}]` : hostname;
  return `${protocol}//${host}${isDefault ? "" : `:${port}`}`;
}

/** Any answer (even opaque) means something listens there. */
async function originReachable(origin: string): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    await fetch(`${origin}/api/health?_=${Date.now()}`, {
      mode: "no-cors",
      cache: "no-store",
      signal: ctrl.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function PanelPortsCard() {
  const t = useT();
  const toast = useToast((s) => s.push);
  const { data, refetch } = useQuery({
    queryKey: ["settings-ports"],
    queryFn: async () => (await api.get<PortsResponse>("/settings/ports")).data,
  });

  const [httpPort, setHttpPort] = useState("");
  const [httpsPort, setHttpsPort] = useState("");
  const [phase, setPhase] = useState<"idle" | "submitting" | "switching" | "failed" | "timeout">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    if (data && phase === "idle") {
      setHttpPort(String(data.httpPort));
      setHttpsPort(String(data.httpsPort));
    }
  }, [data, phase]);

  useEffect(() => () => {
    cancelled.current = true;
  }, []);

  const h = validPort(httpPort);
  const s = validPort(httpsPort);
  const unchanged = !!data && h === data.httpPort && s === data.httpsPort;
  const invalid = h === null || s === null || h === s;
  const busy = phase === "submitting" || phase === "switching";

  const watch = async (origin: string, startedAt: number) => {
    const deadline = Date.now() + GIVE_UP_MS;
    // Give the host a moment to take the old ports down first.
    await new Promise((r) => setTimeout(r, 4000));
    while (!cancelled.current && Date.now() < deadline) {
      // Rollback restores the old ports, so this origin answers again.
      try {
        const st = (await api.get<PortChangeStatus>("/settings/ports/status", { timeout: 4000 })).data;
        if ((st.updatedAt ?? 0) >= startedAt && (st.state === "rolled_back" || st.state === "failed")) {
          setPhase("failed");
          setMessage(st.message || t("settings.portsFailed"));
          refetch();
          return;
        }
      } catch {
        // Old ports are down while nginx is recreated.
      }
      if (await originReachable(origin)) {
        window.location.href = `${origin}/login`;
        return;
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    if (!cancelled.current) setPhase("timeout");
  };

  const apply = async () => {
    if (invalid || h === null || s === null) return;
    if (!window.confirm(t("settings.portsConfirm", { http: h, https: s }))) return;
    setPhase("submitting");
    setMessage(null);
    const startedAt = Math.floor(Date.now() / 1000) - 5;
    try {
      const res = (await api.post("/settings/ports", { httpPort: h, httpsPort: s })).data;
      if (!res?.scheduled) {
        setPhase("idle");
        toast(t("settings.portsUnchanged"));
        return;
      }
      const origin = targetOrigin(h, s);
      setTarget(origin);
      setPhase("switching");
      void watch(origin, startedAt);
    } catch (err: any) {
      setPhase("failed");
      setMessage(err?.response?.data?.message || err?.message || t("settings.portsFailed"));
    }
  };

  const inputCls =
    "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-3 rounded-lg bg-sky-500/10 text-sky-500">
          <Network size={24} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">{t("settings.portsTitle")}</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{t("settings.portsHint")}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">{t("settings.portsHttp")}</span>
          <input
            className={inputCls}
            inputMode="numeric"
            dir="ltr"
            value={httpPort}
            disabled={busy}
            onChange={(e) => setHttpPort(e.target.value.replace(/[^\d]/g, ""))}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">{t("settings.portsHttps")}</span>
          <input
            className={inputCls}
            inputMode="numeric"
            dir="ltr"
            value={httpsPort}
            disabled={busy}
            onChange={(e) => setHttpsPort(e.target.value.replace(/[^\d]/g, ""))}
          />
        </label>
      </div>

      {httpPort !== "" && httpsPort !== "" && invalid && (
        <p className="mt-2 text-xs text-red-500">
          {h !== null && h === s ? t("settings.portsSame") : t("settings.portsInvalid")}
        </p>
      )}
      {h !== null && h !== 80 && (
        <p className="mt-3 flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {t("settings.portsSslNote")}
        </p>
      )}
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{t("settings.portsReloginNote")}</p>

      {phase === "switching" && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 text-sm text-sky-700 dark:text-sky-300">
          <Loader2 size={16} className="animate-spin" />
          <span>{t("settings.portsSwitching", { url: target ?? "" })}</span>
        </div>
      )}
      {phase === "timeout" && target && (
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-300">
          {t("settings.portsTimeout")}{" "}
          <a href={`${target}/login`} className="inline-flex items-center gap-1 font-semibold underline" dir="ltr">
            {target} <ExternalLink size={12} />
          </a>
        </div>
      )}
      {phase === "failed" && message && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400">
          {message}
        </div>
      )}

      <button
        type="button"
        onClick={apply}
        disabled={busy || invalid || unchanged}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-500 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Network size={16} />}
        {t("settings.portsApply")}
      </button>
    </Card>
  );
}
