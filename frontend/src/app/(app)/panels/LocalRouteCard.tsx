"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, LoaderCircle, Radar, Server, XCircle } from "lucide-react";
import { clsx } from "clsx";
import { api } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useT } from "@/i18n";

type RouteState = { localUrl: string | null; active: boolean };
type Probe = { url: string; ok: boolean; verified: boolean; ms: number; status?: number; error?: string };
type Detect = { tokenChecked: boolean; direct: Probe; candidates: Probe[]; best: string | null };

function errorText(e: any, t: (k: string) => string) {
  const code = String(e?.response?.data?.message || "");
  if (code === "LOCAL_URL_UNREACHABLE") return t("panels.localRoute.unreachable");
  if (code === "LOCAL_URL_INVALID") return t("panels.localRoute.invalid");
  return code || t("common.updateFailed");
}

/**
 * Local connection for a 3x-ui on the same server: API calls skip the domain and go
 * to a local address. Shown in the panel edit dialog.
 */
export function LocalRouteCard({ panelId }: { panelId: string }) {
  const t = useT();
  const toast = useToast((s) => s.push);
  const qc = useQueryClient();
  const [manual, setManual] = useState("");
  const key = ["panel-local-route", panelId];

  const { data: state } = useQuery<RouteState>({
    queryKey: key,
    queryFn: async () => (await api.get(`/panels/${panelId}/local-route`)).data,
  });

  const detect = useMutation({
    mutationFn: async () => (await api.post<Detect>(`/panels/${panelId}/local-route/detect`)).data,
    onError: (e) => toast(errorText(e, t), "error"),
  });

  const save = useMutation({
    mutationFn: async (localUrl: string | null) =>
      (await api.put<RouteState>(`/panels/${panelId}/local-route`, { localUrl })).data,
    onSuccess: async (next) => {
      toast(next.localUrl ? t("panels.localRoute.saved") : t("panels.localRoute.off"));
      setManual("");
      detect.reset();
      await qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast(errorText(e, t), "error"),
  });

  const result = detect.data;
  const best = result?.candidates.find((c) => c.url === result.best);

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-start gap-2">
        <Server size={16} className="mt-0.5 shrink-0 text-zinc-500" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{t("panels.localRoute.title")}</div>
          <p className="text-xs leading-relaxed text-zinc-500">{t("panels.localRoute.hint")}</p>
        </div>
      </div>

      {state?.localUrl ? (
        <div
          className={clsx(
            "flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-xs",
            state.active
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "bg-amber-500/10 text-amber-700 dark:text-amber-300",
          )}
        >
          {state.active ? <CheckCircle2 size={14} aria-hidden /> : <XCircle size={14} aria-hidden />}
          <span className="font-medium">{state.active ? t("panels.localRoute.on") : t("panels.localRoute.paused")}</span>
          <span className="font-mono" dir="ltr">
            {state.localUrl}
          </span>
          <button
            type="button"
            disabled={save.isPending}
            onClick={() => save.mutate(null)}
            className="ms-auto rounded-md px-2 py-0.5 font-medium underline-offset-2 hover:underline disabled:opacity-50"
          >
            {t("panels.localRoute.turnOff")}
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={detect.isPending}
          onClick={() => detect.mutate()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          {detect.isPending ? <LoaderCircle size={14} className="animate-spin" aria-hidden /> : <Radar size={14} aria-hidden />}
          {t("panels.localRoute.detect")}
        </button>
      </div>

      {result ? (
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2 text-zinc-500">
            <span>{t("panels.localRoute.viaDomain")}</span>
            <span className="tabular-nums" dir="ltr">
              {result.direct.ok ? `${result.direct.ms} ms` : result.direct.error || `HTTP ${result.direct.status}`}
            </span>
          </div>
          <ul className="space-y-1">
            {result.candidates.map((c) => (
              <li key={c.url} className="flex items-center gap-2">
                {c.ok ? (
                  <CheckCircle2 size={13} className="shrink-0 text-emerald-500" aria-hidden />
                ) : (
                  <XCircle size={13} className="shrink-0 text-zinc-400" aria-hidden />
                )}
                <span className={clsx("min-w-0 flex-1 truncate font-mono", !c.ok && "text-zinc-400")} dir="ltr">
                  {c.url}
                </span>
                <span className="shrink-0 tabular-nums text-zinc-500" dir="ltr">
                  {c.ok ? `${c.ms} ms` : c.error || (c.status ? `HTTP ${c.status}` : "—")}
                </span>
              </li>
            ))}
          </ul>
          {best ? (
            <button
              type="button"
              disabled={save.isPending || state?.localUrl === best.url}
              onClick={() => save.mutate(best.url)}
              className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {t("panels.localRoute.use", { url: best.url, ms: best.ms })}
            </button>
          ) : (
            <p className="rounded-lg bg-zinc-100 px-3 py-2 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
              {t("panels.localRoute.notFound")}
            </p>
          )}
          {!result.tokenChecked ? <p className="text-amber-600">{t("panels.localRoute.noToken")}</p> : null}
        </div>
      ) : null}

      <div className="flex gap-2">
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="http://host.docker.internal:2053"
          dir="ltr"
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 font-mono text-xs text-zinc-800 outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
        <button
          type="button"
          disabled={!manual.trim() || save.isPending}
          onClick={() => save.mutate(manual.trim())}
          className="shrink-0 rounded-lg border border-zinc-300 px-3 text-sm font-medium disabled:opacity-50 dark:border-zinc-700"
        >
          {t("panels.localRoute.saveManual")}
        </button>
      </div>
    </div>
  );
}
