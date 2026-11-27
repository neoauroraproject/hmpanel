"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, HardDrive, Layers, Network, Power, PowerOff, Trash2, Users, X } from "lucide-react";
import { clsx } from "clsx";
import { api } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useT } from "@/i18n";

type Action = "enable" | "disable" | "addTraffic" | "addDays" | "addClients" | "addInbounds" | "removeInbounds";
type InboundRow = { id: string; tag: string; remark?: string | null; port: number; protocol: string; panel: { id: string; name: string; panelType?: string | null } };
type BulkResult = { success: number; skipped: number; failed: number; errors: string[] };
type PanelRow = { id: string; name: string; panelType?: string | null };
/** "" = whole account · "panel:<id>" = one 3x-ui panel · "plus:eylan|pasarguard" = Panel Plus (Premium) */
type Scope = string;

/**
 * Bulk actions for the selected admins: enable/disable, add or remove traffic, days and
 * client capacity, and grant or revoke inbounds. Every admin goes through the normal edit.
 */
export function AdminBulkBar({ ids, onClear }: { ids: string[]; onClear: () => void }) {
  const t = useT();
  const toast = useToast((s) => s.push);
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<Action | null>(null);
  const [value, setValue] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [scope, setScope] = useState<Scope>("");

  const panelsQuery = useQuery<PanelRow[]>({
    queryKey: ["panels-bulk-scope"],
    queryFn: async () => {
      const rows = (await api.get("/panels")).data as PanelRow[] | { data?: PanelRow[] };
      return Array.isArray(rows) ? rows : rows?.data || [];
    },
    staleTime: 60_000,
  });
  const xuiPanels = (panelsQuery.data ?? []).filter((p) => !["eylan", "pasarguard"].includes(String(p.panelType || "")));
  const plusProviders = (["eylan", "pasarguard"] as const).filter((k) =>
    (panelsQuery.data ?? []).some((p) => p.panelType === k),
  );
  const plus = scope.startsWith("plus:") ? scope.slice(5) : null;
  const panelId = scope.startsWith("panel:") ? scope.slice(6) : undefined;

  const inboundsQuery = useQuery<InboundRow[]>({
    queryKey: ["inbounds-all"],
    queryFn: async () => (await api.get<InboundRow[]>("/inbounds")).data,
    enabled: dialog === "addInbounds" || dialog === "removeInbounds",
  });
  const inbounds = useMemo(
    () =>
      (inboundsQuery.data ?? []).filter(
        (i) =>
          !["eylan", "pasarguard"].includes(String(i.panel?.panelType || "")) &&
          (!panelId || i.panel?.id === panelId) &&
          (!filter.trim() ||
            `${i.panel?.name} ${i.remark || ""} ${i.tag} ${i.port}`.toLowerCase().includes(filter.trim().toLowerCase())),
      ),
    [inboundsQuery.data, filter],
  );

  const run = useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      plus
        ? (await api.post<BulkResult>("/premium-modules/admin-recharge/provider-access/bulk", { ids, provider: plus, ...body })).data
        : (await api.post<BulkResult>("/admins/bulk", { ids, ...(panelId ? { panelId } : {}), ...body })).data,
    onSuccess: (r) => {
      toast(
        t("adminBulk.done", { ok: r.success, skipped: r.skipped, failed: r.failed }),
        r.failed ? "error" : "success",
      );
      if (r.errors?.length) console.warn("Bulk admin errors:", r.errors);
      qc.invalidateQueries({ queryKey: ["admins"] });
      setDialog(null);
      setValue("");
      setPicked([]);
      onClear();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => toast(e?.response?.data?.message || t("adminBulk.failed"), "error"),
  });

  if (!ids.length) return null;

  const open = (a: Action) => {
    setValue("");
    setPicked([]);
    setFilter("");
    setDialog(a);
  };
  const numeric = dialog === "addTraffic" || dialog === "addDays" || dialog === "addClients";
  const n = Number(value);
  const canApply = numeric ? Number.isFinite(n) && n !== 0 : picked.length > 0;
  const btn =
    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-white/15 disabled:opacity-40";

  return (
    <>
      <div className="fixed inset-x-0 bottom-[calc(var(--hm-bottom-nav,0px)+1rem)] z-[45] flex justify-center px-4">
        <div className="flex max-w-full flex-wrap items-center gap-1 rounded-2xl bg-zinc-900 px-3 py-2 text-white shadow-2xl dark:bg-zinc-100 dark:text-zinc-900">
          <span className="px-2 text-sm font-semibold">{t("adminBulk.selected", { count: ids.length })}</span>
          {xuiPanels.length > 1 || plusProviders.length ? (
            <label className="inline-flex items-center gap-1.5 rounded-full bg-white/10 ps-2.5 text-xs dark:bg-black/10">
              <Layers size={14} aria-hidden />
              <span className="sr-only">{t("adminBulk.scope")}</span>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="max-w-[11rem] rounded-full bg-transparent py-1.5 pe-2 text-xs font-semibold outline-none [&>option]:text-zinc-900"
                title={t("adminBulk.scope")}
              >
                <option value="">{t("adminBulk.scopeAll")}</option>
                {xuiPanels.length > 1
                  ? xuiPanels.map((p) => (
                      <option key={p.id} value={`panel:${p.id}`}>
                        {t("adminBulk.scopePanel", { name: p.name })}
                      </option>
                    ))
                  : null}
                {plusProviders.map((k) => (
                  <option key={k} value={`plus:${k}`}>
                    {t("adminBulk.scopePlus", { name: k === "eylan" ? "Eylan" : "Pasarguard" })}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button type="button" className={btn} disabled={run.isPending} onClick={() => run.mutate({ action: "enable" })}>
            <Power size={14} aria-hidden /> {t("adminBulk.enable")}
          </button>
          <button type="button" className={btn} disabled={run.isPending} onClick={() => run.mutate({ action: "disable" })}>
            <PowerOff size={14} aria-hidden /> {t("adminBulk.disable")}
          </button>
          <button type="button" className={btn} onClick={() => open("addTraffic")}>
            <HardDrive size={14} aria-hidden /> {t("adminBulk.traffic")}
          </button>
          <button type="button" className={btn} onClick={() => open("addDays")}>
            <CalendarPlus size={14} aria-hidden /> {t("adminBulk.days")}
          </button>
          <button type="button" className={btn} onClick={() => open("addClients")}>
            <Users size={14} aria-hidden /> {t("adminBulk.clients")}
          </button>
          {!plus ? (
            <button type="button" className={btn} onClick={() => open("addInbounds")}>
              <Network size={14} aria-hidden /> {t("adminBulk.inbounds")}
            </button>
          ) : null}
          {!plus ? (
            <button
              type="button"
              className={clsx(btn, "text-rose-300 hover:bg-rose-500/20 dark:text-rose-600")}
              disabled={run.isPending}
              onClick={() => {
                if (window.confirm(t("adminBulk.deleteConfirm", { count: ids.length }))) run.mutate({ action: "delete" });
              }}
            >
              <Trash2 size={14} aria-hidden /> {t("adminBulk.delete")}
            </button>
          ) : null}
          <button type="button" className={clsx(btn, "ms-1")} onClick={onClear} aria-label={t("adminBulk.clear")}>
            <X size={14} aria-hidden />
          </button>
        </div>
      </div>

      {dialog && dialog !== "enable" && dialog !== "disable"
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setDialog(null)}>
              <div
                role="dialog"
                aria-modal="true"
                className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl dark:bg-zinc-900"
                onClick={(e) => e.stopPropagation()}
              >
                <div>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                    {t(`adminBulk.title.${numeric ? dialog : "inbounds"}`, { count: ids.length })}
                  </h3>
                  <p className="mt-1 text-xs text-zinc-500">{t(`adminBulk.hint.${numeric ? dialog : "inbounds"}`)}</p>
                  {scope ? (
                    <p className="mt-2 inline-flex rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300">
                      {plus
                        ? t("adminBulk.scopePlus", { name: plus === "eylan" ? "Eylan" : "Pasarguard" })
                        : t("adminBulk.scopePanel", { name: xuiPanels.find((p) => `panel:${p.id}` === scope)?.name || "" })}
                      {" · "}
                      {t(plus ? "adminBulk.scopePlusNote" : "adminBulk.scopePanelNote")}
                    </p>
                  ) : null}
                </div>

                {numeric ? (
                  <input
                    autoFocus
                    type="number"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={t(`adminBulk.placeholder.${dialog}`)}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    dir="ltr"
                  />
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      {(["addInbounds", "removeInbounds"] as const).map((a) => (
                        <button
                          key={a}
                          type="button"
                          aria-pressed={dialog === a}
                          onClick={() => setDialog(a)}
                          className={clsx(
                            "rounded-xl border px-3 py-2 text-sm font-semibold",
                            dialog === a ? "border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300" : "border-zinc-200 dark:border-zinc-800",
                          )}
                        >
                          {t(`adminBulk.${a}`)}
                        </button>
                      ))}
                    </div>
                    <input
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      placeholder={t("adminBulk.searchInbounds")}
                      className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    />
                    <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-zinc-200 p-2 dark:border-zinc-800">
                      {inboundsQuery.isLoading ? <p className="p-2 text-sm text-zinc-500">…</p> : null}
                      {inbounds.map((i) => (
                        <label key={i.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
                          <input
                            type="checkbox"
                            checked={picked.includes(i.id)}
                            onChange={(e) => setPicked((p) => (e.target.checked ? [...p, i.id] : p.filter((x) => x !== i.id)))}
                          />
                          <span className="min-w-0 flex-1 truncate">
                            <span className="font-medium">{i.panel?.name}</span>
                            <span className="text-zinc-500"> · {i.remark || i.tag} · {i.protocol}:{i.port}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </>
                )}

                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setDialog(null)} className="rounded-xl px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-300">
                    {t("common.cancel")}
                  </button>
                  <button
                    type="button"
                    disabled={!canApply || run.isPending}
                    onClick={() =>
                      run.mutate(numeric ? { action: dialog, value: n } : { action: dialog, inboundIds: picked })
                    }
                    className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    {t("adminBulk.apply", { count: ids.length })}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
