"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardPaste, LoaderCircle, Network, Radar, XCircle } from "lucide-react";
import { clsx } from "clsx";
import { api } from "@/lib/api";
import { Card } from "@/components/ui";
import { useToast } from "@/components/toast";
import { SwitchInput } from "@/components/SwitchInput";
import { useT } from "@/i18n";

type Cfg = {
  enabled: boolean;
  mode: "fallback" | "always";
  type: "socks5" | "http";
  host: string;
  port: number;
  username?: string;
  password?: string;
  passwordSet?: boolean;
};
type Path = { ok: boolean; ms: number; status?: number; error?: string };

/** socks5://u:p@host:port · http://host:port · host:port · t.me/socks?server=… */
export function parseProxyLink(raw: string): Partial<Cfg> | null {
  const text = raw.trim();
  if (!text || /[?&]secret=/i.test(text)) return null;
  const share = text.match(/^(?:tg:\/\/socks|https?:\/\/(?:t\.me|telegram\.me)\/socks)\?(.+)$/i);
  if (share) {
    const q = new URLSearchParams(share[1]);
    const port = Number(q.get("port") || 0);
    if (!q.get("server") || !port) return null;
    return { type: "socks5", host: q.get("server") || "", port, username: q.get("user") || "", password: q.get("pass") || "" };
  }
  const m = text.match(/^(?:(socks5h?|socks|https?):\/\/)?(?:([^:@/]*)(?::([^@/]*))?@)?(\[[^\]]+\]|[^\s:/?#@]+)(?::(\d{1,5}))?\/?$/i);
  if (!m) return null;
  const type: Cfg["type"] = (m[1] || "").toLowerCase().startsWith("http") ? "http" : "socks5";
  return {
    type,
    host: m[4].replace(/^\[|\]$/g, ""),
    port: Number(m[5] || 0) || (type === "http" ? 8080 : 1080),
    username: m[2] ? decodeURIComponent(m[2]) : "",
    password: m[3] ? decodeURIComponent(m[3]) : "",
  };
}

function PathChip({ label, r }: { label: string; r: Path }) {
  const t = useT();
  return (
    <div className={clsx("flex items-center gap-2 rounded-xl px-3 py-2 text-sm", r.ok ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200" : "bg-rose-500/10 text-rose-800 dark:text-rose-200")}>
      {r.ok ? <CheckCircle2 size={15} aria-hidden /> : <XCircle size={15} aria-hidden />}
      <span className="font-semibold">{label}</span>
      <span className="ms-auto text-xs opacity-80" dir="ltr">
        {r.ok ? `${r.ms} ms` : r.error || t("panelProxy.failed")}
      </span>
    </div>
  );
}

/**
 * Settings → General: a proxy the panel uses to reach 3x-ui servers. By default it is
 * only a fallback: calls go direct and switch to the proxy when the direct path fails.
 */
export function PanelProxyCard() {
  const t = useT();
  const toast = useToast((s) => s.push);
  const qc = useQueryClient();
  // Unsaved edits; until the first edit the form shows what the server returned.
  const [draft, setDraft] = useState<Cfg | null>(null);
  const [link, setLink] = useState("");
  const [panelId, setPanelId] = useState("");

  const { data } = useQuery<Cfg>({
    queryKey: ["panel-connection-proxy"],
    queryFn: async () => (await api.get<Cfg>("/panels/connection-proxy")).data,
  });
  const { data: panels = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["panels-for-proxy-test"],
    queryFn: async () => {
      const rows = (await api.get("/panels")).data as Array<{ id: string; name: string }> | { data?: Array<{ id: string; name: string }> };
      return Array.isArray(rows) ? rows : rows?.data || [];
    },
  });
  const form: Cfg | null = draft ?? (data ? { ...data, password: "" } : null);

  const save = useMutation({
    mutationFn: async () => (await api.put<Cfg>("/panels/connection-proxy", form)).data,
    onSuccess: (next) => {
      qc.setQueryData(["panel-connection-proxy"], next);
      setDraft(null);
      toast(t("panelProxy.saved"), "success");
    },
    onError: () => toast(t("panelProxy.saveFailed"), "error"),
  });
  const probe = useMutation({
    mutationFn: async () =>
      (await api.post<{ direct: Path; viaProxy: Path }>("/panels/connection-proxy/test", { panelId: panelId || panels[0]?.id, proxy: form })).data,
  });

  if (!form) return null;
  const set = (patch: Partial<Cfg>) => setDraft({ ...form, ...patch });
  const input = "w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950";

  return (
    <Card className="space-y-4 p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-indigo-500/10 p-2 text-indigo-500">
          <Network size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">{t("panelProxy.title")}</h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{t("panelProxy.hint")}</p>
        </div>
        <SwitchInput checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
      </div>

      {form.enabled ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            {(["fallback", "always"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => set({ mode: m })}
                aria-pressed={form.mode === m}
                className={clsx(
                  "rounded-xl border px-3 py-2.5 text-start text-sm",
                  form.mode === m ? "border-blue-500 bg-blue-500/10" : "border-zinc-200 dark:border-zinc-800",
                )}
              >
                <span className="block font-semibold">{t(`panelProxy.mode.${m}`)}</span>
                <span className="mt-0.5 block text-xs text-zinc-500">{t(`panelProxy.modeHint.${m}`)}</span>
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="socks5://user:pass@1.2.3.4:1080" className={clsx(input, "min-w-0 flex-1 font-mono")} dir="ltr" />
            <button
              type="button"
              disabled={!link.trim()}
              onClick={() => {
                const parsed = parseProxyLink(link);
                if (!parsed) return toast(t("panelProxy.pasteInvalid"), "error");
                set(parsed);
                setLink("");
              }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-zinc-300 px-3 text-sm font-medium disabled:opacity-40 dark:border-zinc-700"
            >
              <ClipboardPaste size={15} aria-hidden /> {t("panelProxy.paste")}
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-[8rem_1fr_7rem]">
            <select value={form.type} onChange={(e) => set({ type: e.target.value === "http" ? "http" : "socks5" })} className={input} dir="ltr">
              <option value="socks5">SOCKS5</option>
              <option value="http">HTTP</option>
            </select>
            <input value={form.host} onChange={(e) => set({ host: e.target.value })} placeholder={t("panelProxy.host")} className={clsx(input, "font-mono")} dir="ltr" />
            <input type="number" min={1} max={65535} value={form.port} onChange={(e) => set({ port: Number(e.target.value) || 0 })} className={clsx(input, "font-mono")} dir="ltr" />
            <input value={form.username || ""} onChange={(e) => set({ username: e.target.value })} placeholder={t("panelProxy.username")} className={clsx(input, "sm:col-span-1")} dir="ltr" />
            <input
              type="password"
              value={form.password || ""}
              onChange={(e) => set({ password: e.target.value })}
              placeholder={form.passwordSet ? t("panelProxy.passwordKept") : t("panelProxy.password")}
              className={clsx(input, "sm:col-span-2")}
              dir="ltr"
              autoComplete="new-password"
            />
          </div>

          <div className="space-y-2 rounded-xl border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{t("panelProxy.testTitle")}</span>
              <select value={panelId} onChange={(e) => setPanelId(e.target.value)} className="ms-auto rounded-lg border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700">
                {panels.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => probe.mutate()}
                disabled={probe.isPending || !panels.length || !form.host.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-zinc-900"
              >
                {probe.isPending ? <LoaderCircle size={14} className="animate-spin" aria-hidden /> : <Radar size={14} aria-hidden />}
                {t("panelProxy.testRun")}
              </button>
            </div>
            {probe.data ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <PathChip label={t("panelProxy.direct")} r={probe.data.direct} />
                <PathChip label={t("panelProxy.viaProxy")} r={probe.data.viaProxy} />
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending || (form.enabled && !form.host.trim())}
          className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {t("common.save")}
        </button>
      </div>
    </Card>
  );
}
