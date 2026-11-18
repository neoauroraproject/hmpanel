"use client";

/*
 * One-screen top-up for an admin: shared pool or each panel's traffic, plus days and client
 * cap. Sends only what changed; per-panel rows go through PATCH /admins/:id { panelQuotas }
 * which updates just those panels (other caps and the ledger stay intact).
 */

import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Database, HardDrive, Infinity as InfinityIcon, Users, X, Zap } from "lucide-react";
import { api } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { useT } from "@/i18n";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/ui";
import { MOTION_CONFIG } from "@/lib/motion";
import { applyCountDelta, applyExpiryDeltaMs, parseAdjustDelta } from "./quota-adjust";
import type { Admin } from "./page";

const GB = 1024 ** 3;
const GB_CHIPS = [10, 50, 100, 500, 1000];
const DAY_CHIPS = [7, 30, 90];
const FIELD =
  "h-10 w-full min-w-0 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100";
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50";

function Chips({ values, unit, onPick }: { values: number[]; unit: string; onPick: (v: number) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onPick(v)}
          className={clsx(
            "h-7 cursor-pointer rounded-full border border-zinc-200 px-2.5 text-[11px] font-semibold text-zinc-700 transition hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-blue-500/10 dark:hover:text-blue-300",
            FOCUS,
          )}
          dir="ltr"
        >
          +{v >= 1000 && unit === "GB" ? `${v / 1000} TB` : `${v} ${unit}`}
        </button>
      ))}
    </div>
  );
}

function addTo(raw: string, v: number) {
  const n = Number(String(raw || "").trim() || 0);
  return String((Number.isFinite(n) ? n : 0) + v);
}

export function QuickQuotaDialog({ adminId, onClose }: { adminId: string; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);

  const { data: admin, isLoading } = useQuery({
    queryKey: ["admin", adminId],
    queryFn: async () => (await api.get<Admin>(`/admins/${adminId}`)).data,
  });

  // Captured once: day counts only need day precision and render must stay pure.
  const [now] = useState(() => Date.now());
  const [globalGb, setGlobalGb] = useState("");
  const [days, setDays] = useState("");
  const [clients, setClients] = useState("");
  const [panelGb, setPanelGb] = useState<Record<string, string>>({});
  const [panelClients, setPanelClients] = useState<Record<string, string>>({});

  const perPanel = admin?.quotaMode === "PER_PANEL";
  const rows = useMemo(() => admin?.panelQuotas ?? [], [admin]);

  const plan = useMemo(() => {
    if (!admin) return null;
    const payload: Record<string, unknown> = {};
    if (perPanel) {
      const changed = rows
        .map((q) => {
          const gb = q.unlimitedTraffic ? null : parseAdjustDelta(panelGb[q.panelId] ?? "");
          const cl = String(panelClients[q.panelId] ?? "").trim();
          if (gb == null && !cl) return null;
          const current = Math.max(0, Math.round(Number(q.balance || 0)));
          return {
            panelId: q.panelId,
            // Always send the balance: the server treats a missing value as 0 (a deduction).
            balanceBytes: gb != null ? Math.max(0, Math.round(current + gb * GB)) : current,
            ...(cl ? { maxClients: applyCountDelta(Number(q.maxClients || 0), cl) } : {}),
          };
        })
        .filter(Boolean);
      if (changed.length) payload.panelQuotas = changed;
    } else if (!admin.unlimitedTraffic) {
      const gb = parseAdjustDelta(globalGb);
      if (gb != null) payload.balance = Math.max(0, Math.round(Number(admin.balance || 0) + gb * GB));
      if (String(clients).trim()) payload.maxClients = applyCountDelta(Number(admin.maxClients || 0), clients);
    }
    if (parseAdjustDelta(days) != null) payload.expiryTime = applyExpiryDeltaMs(Number(admin.expiryTime || 0), days, now);
    return payload;
  }, [admin, perPanel, rows, panelGb, panelClients, globalGb, clients, days, now]);

  const hasChanges = !!plan && Object.keys(plan).length > 0;

  const apply = useMutation({
    mutationFn: async () => (await api.patch(`/admins/${adminId}`, plan)).data,
    onSuccess: async () => {
      toast(t("adminTools.applied"));
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admins"] }),
        qc.invalidateQueries({ queryKey: ["admin", adminId] }),
      ]);
      onClose();
    },
    onError: (err: { response?: { data?: { message?: string | string[] } } }) => {
      const msg = err?.response?.data?.message;
      toast(Array.isArray(msg) ? msg.join(", ") : msg || t("admins.actionFailed"), "error");
    },
  });

  const expiryAfter = admin && parseAdjustDelta(days) != null ? applyExpiryDeltaMs(Number(admin.expiryTime || 0), days, now) : null;

  return (
    <motion.div
      {...MOTION_CONFIG.modalOverlay}
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/60 px-4 pt-[8dvh] backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <motion.div
        {...MOTION_CONFIG.modalContent}
        role="dialog"
        aria-modal="true"
        aria-label={t("adminTools.quickTitle", { name: admin?.username ?? "" })}
        onClick={(e) => e.stopPropagation()}
        className="mb-8 w-full max-w-xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/12 text-amber-600">
              <Zap size={17} />
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-50">
                {t("adminTools.quickTitle", { name: admin?.username ?? "" })}
              </h3>
              {admin ? (
                <p className="text-xs text-zinc-500">{perPanel ? t("admins.quotaModePerPanel") : t("admins.quotaModeGlobal")}</p>
              ) : null}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label={t("common.cancel")} className={clsx("flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800", FOCUS)}>
            <X size={17} />
          </button>
        </div>

        {isLoading || !admin ? (
          <Spinner />
        ) : (
          <div className="max-h-[65dvh] space-y-5 overflow-y-auto px-5 py-5">
            {perPanel ? (
              <section className="space-y-2.5">
                <h4 className="flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                  <Database size={15} className="text-zinc-400" /> {t("adminTools.perPanelTraffic")}
                </h4>
                {!rows.length ? <p className="text-xs text-zinc-500">{t("adminTools.noPanels")}</p> : null}
                {rows.map((q) => {
                  const delta = parseAdjustDelta(panelGb[q.panelId] ?? "");
                  const after = delta != null ? Math.max(0, Number(q.balance || 0) + delta * GB) : null;
                  return (
                    <div key={q.panelId} className="rounded-2xl border border-zinc-200 p-3.5 dark:border-zinc-800">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50" dir="auto">{q.panelName || q.panelId}</div>
                          <div className="mt-0.5 text-[11px] text-zinc-500">
                            {q.unlimitedTraffic
                              ? t("admins.stockUnlimited")
                              : t("adminTools.remainingOf", { left: formatBytes(Number(q.balance || 0)), total: formatBytes(Number(q.totalAssigned || 0)) })}
                          </div>
                        </div>
                        {after != null ? (
                          <span className="shrink-0 rounded-full bg-emerald-500/12 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300" dir="ltr">
                            → {formatBytes(after)}
                          </span>
                        ) : null}
                      </div>
                      {q.unlimitedTraffic ? (
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500">
                          <InfinityIcon size={14} /> {t("adminTools.unlimitedPanel")}
                        </div>
                      ) : (
                        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_11rem]">
                          <div className="space-y-1.5">
                            <input
                              className={FIELD}
                              inputMode="decimal"
                              placeholder={t("adminTools.addGbPlaceholder")}
                              value={panelGb[q.panelId] ?? ""}
                              onChange={(e) => setPanelGb((s) => ({ ...s, [q.panelId]: e.target.value }))}
                              aria-label={`${t("adminTools.addGb")} — ${q.panelName || q.panelId}`}
                            />
                            <Chips values={GB_CHIPS} unit="GB" onPick={(v) => setPanelGb((s) => ({ ...s, [q.panelId]: addTo(s[q.panelId] ?? "", v) }))} />
                          </div>
                          <input
                            className={FIELD}
                            inputMode="numeric"
                            placeholder={t("adminTools.clientsPlaceholder", { now: q.maxClients ? String(q.maxClients) : "∞" })}
                            value={panelClients[q.panelId] ?? ""}
                            onChange={(e) => setPanelClients((s) => ({ ...s, [q.panelId]: e.target.value }))}
                            aria-label={`${t("adminTools.addClients")} — ${q.panelName || q.panelId}`}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            ) : admin.unlimitedTraffic ? (
              <div className="flex items-center gap-2 rounded-2xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:bg-zinc-950 dark:text-zinc-300">
                <InfinityIcon size={16} /> {t("admins.unlimitedTrafficLabel")}
              </div>
            ) : (
              <section className="space-y-2.5">
                <h4 className="flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                  <HardDrive size={15} className="text-zinc-400" /> {t("adminTools.sharedPool")}
                </h4>
                <div className="flex items-center justify-between rounded-2xl bg-zinc-50 px-4 py-3 dark:bg-zinc-950">
                  <span className="text-xs text-zinc-500">
                    {t("adminTools.remainingOf", { left: formatBytes(Number(admin.balance || 0)), total: formatBytes(Number(admin.totalAssigned || 0)) })}
                  </span>
                  {parseAdjustDelta(globalGb) != null ? (
                    <span className="rounded-full bg-emerald-500/12 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300" dir="ltr">
                      → {formatBytes(Math.max(0, Number(admin.balance || 0) + (parseAdjustDelta(globalGb) as number) * GB))}
                    </span>
                  ) : null}
                </div>
                <input className={FIELD} inputMode="decimal" placeholder={t("adminTools.addGbPlaceholder")} value={globalGb} onChange={(e) => setGlobalGb(e.target.value)} aria-label={t("adminTools.addGb")} />
                <Chips values={GB_CHIPS} unit="GB" onPick={(v) => setGlobalGb((s) => addTo(s, v))} />
                <label className="block space-y-1.5 pt-1">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                    <Users size={13} /> {t("adminTools.addClients")}
                  </span>
                  <input
                    className={FIELD}
                    inputMode="numeric"
                    placeholder={t("adminTools.clientsPlaceholder", { now: admin.maxClients ? String(admin.maxClients) : "∞" })}
                    value={clients}
                    onChange={(e) => setClients(e.target.value)}
                  />
                </label>
              </section>
            )}

            <section className="space-y-2.5 border-t border-zinc-100 pt-4 dark:border-zinc-800">
              <h4 className="flex items-center justify-between gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                <span className="flex items-center gap-2">
                  <CalendarPlus size={15} className="text-zinc-400" /> {t("adminTools.addDays")}
                </span>
                {expiryAfter != null ? (
                  <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                    {expiryAfter === 0 ? t("common.never") : t("adminTools.daysAfter", { count: Math.max(0, Math.ceil((expiryAfter - now) / 86_400_000)) })}
                  </span>
                ) : null}
              </h4>
              <input className={FIELD} inputMode="numeric" placeholder={t("adminTools.addDaysPlaceholder")} value={days} onChange={(e) => setDays(e.target.value)} aria-label={t("adminTools.addDays")} />
              <Chips values={DAY_CHIPS} unit={t("adminTools.dayUnit")} onPick={(v) => setDays((s) => addTo(s, v))} />
            </section>
            <p className="text-[11px] leading-relaxed text-zinc-500">{t("adminTools.deltaHint")}</p>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <button type="button" onClick={onClose} className={clsx("h-10 cursor-pointer rounded-xl px-4 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800", FOCUS)}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={!hasChanges || apply.isPending}
            onClick={() => apply.mutate()}
            className={clsx("inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50", FOCUS)}
          >
            <Zap size={15} /> {apply.isPending ? t("common.saving") : t("adminTools.apply")}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
