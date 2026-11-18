"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { ArrowDown, ArrowUp, Gem, PanelTop, Plus, RotateCcw, X } from "lucide-react";
import { useT } from "@/i18n";
import { MAX_PINS, NAV_LABEL_KEYS, type AppNavItem, type AppNavSection } from "@/lib/nav-config";
import { useNavPins } from "@/store/navPins";

/**
 * Lets each user choose which pages sit directly in the top bar, and in which
 * order. Everything else stays in its section menu or the Premium menu.
 */
export function NavPinsDialog({
  sections,
  pins,
  defaultPins,
  onClose,
}: {
  sections: AppNavSection[];
  pins: string[];
  defaultPins: string[];
  onClose: () => void;
}) {
  const t = useT();
  const setPins = useNavPins((s) => s.setPins);
  const [draft, setDraft] = useState<string[]>(pins);
  const all = sections.flatMap((s) => s.items);
  const byHref = new Map(all.map((i) => [i.href, i] as const));
  const label = (i: AppNavItem) => i.title || t(i.labelKey || NAV_LABEL_KEYS[i.href] || i.href);
  const full = draft.length >= MAX_PINS;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const move = (i: number, d: -1 | 1) =>
    setDraft((cur) => {
      const next = [...cur];
      const j = i + d;
      if (j < 0 || j >= next.length) return cur;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const iconBtn =
    "grid h-8 w-8 place-items-center rounded-lg text-zinc-500 outline-none transition-colors hover:bg-zinc-900/[0.06] hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:opacity-30 dark:hover:bg-white/[0.08] dark:hover:text-zinc-50";

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[8vh] backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="nav-pins-title"
        onClick={(e) => e.stopPropagation()}
        className="hm-pop w-full max-w-2xl overflow-hidden rounded-[28px] border border-[var(--hm-line)] bg-[var(--hm-surface)] shadow-[0_30px_80px_-28px_rgb(0_0_0/0.55)]"
      >
        <div className="flex items-start gap-3 border-b border-[var(--hm-line)] px-5 py-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">
            <PanelTop size={18} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="nav-pins-title" className="text-[15px] font-bold text-zinc-900 dark:text-zinc-50">{t("navPins.title")}</h2>
            <p className="mt-0.5 text-[12.5px] text-zinc-500 dark:text-zinc-400">{t("navPins.hint", { max: MAX_PINS })}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className={iconBtn}>
            <X size={16} />
          </button>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center justify-between text-[12px] font-semibold text-zinc-500">
              <span>{t("navPins.inBar")}</span>
              <span className="tabular-nums">{draft.length}/{MAX_PINS}</span>
            </div>
            {draft.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-[var(--hm-line)] p-4 text-center text-[12.5px] text-zinc-500">{t("navPins.empty")}</p>
            ) : (
              <ol className="space-y-1.5">
                {draft.map((href, i) => {
                  const item = byHref.get(href);
                  if (!item) return null;
                  const Icon = item.icon;
                  return (
                    <li key={href} className="flex items-center gap-2 rounded-2xl border border-[var(--hm-line)] bg-zinc-900/[0.02] py-1.5 pe-1.5 ps-3 dark:bg-white/[0.03]">
                      <span className="w-4 text-center text-[11px] font-semibold tabular-nums text-zinc-400">{i + 1}</span>
                      <Icon size={16} className={clsx("shrink-0", item.isPremium ? "text-amber-500" : "text-zinc-500")} aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-zinc-800 dark:text-zinc-100">{label(item)}</span>
                      <button type="button" className={iconBtn} disabled={i === 0} onClick={() => move(i, -1)} aria-label={t("navPins.up")}>
                        <ArrowUp size={14} />
                      </button>
                      <button type="button" className={iconBtn} disabled={i === draft.length - 1} onClick={() => move(i, 1)} aria-label={t("navPins.down")}>
                        <ArrowDown size={14} />
                      </button>
                      <button
                        type="button"
                        className={clsx(iconBtn, "hover:text-rose-600")}
                        onClick={() => setDraft((cur) => cur.filter((h) => h !== href))}
                        aria-label={t("navPins.remove")}
                      >
                        <X size={14} />
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          <div className="max-h-[52vh] overflow-y-auto">
            <div className="mb-2 text-[12px] font-semibold text-zinc-500">{t("navPins.available")}</div>
            <div className="space-y-3">
              {sections.map((s) => {
                const rest = s.items.filter((i) => !draft.includes(i.href));
                if (!rest.length) return null;
                return (
                  <div key={s.id}>
                    {s.labelKey ? <div className="px-1 pb-1 text-[11px] font-semibold text-zinc-400">{t(s.labelKey)}</div> : null}
                    <div className="space-y-1">
                      {rest.map((item) => {
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.href}
                            type="button"
                            disabled={full}
                            onClick={() => setDraft((cur) => [...cur, item.href])}
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-start text-[13px] text-zinc-700 outline-none transition-colors hover:bg-zinc-900/[0.05] focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-200 dark:hover:bg-white/[0.06]"
                          >
                            <Icon size={15} className={clsx("shrink-0", item.isPremium ? "text-amber-500" : "text-zinc-500")} aria-hidden />
                            <span className="min-w-0 flex-1 truncate">{label(item)}</span>
                            {item.isPremium ? <Gem size={11} className="shrink-0 text-amber-500" aria-hidden /> : null}
                            <Plus size={14} className="shrink-0 text-zinc-400" aria-hidden />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--hm-line)] px-5 py-3.5">
          <button
            type="button"
            onClick={() => {
              setPins(null);
              onClose();
            }}
            className="me-auto inline-flex h-10 items-center gap-2 rounded-full px-3 text-[13px] font-medium text-zinc-600 outline-none hover:bg-zinc-900/[0.05] focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:text-zinc-300 dark:hover:bg-white/[0.06]"
            title={defaultPins.map((h) => (byHref.get(h) ? label(byHref.get(h)!) : "")).filter(Boolean).join(" · ")}
          >
            <RotateCcw size={14} aria-hidden /> {t("navPins.reset")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center rounded-full border border-[var(--hm-line)] px-4 text-[13px] font-medium text-zinc-700 outline-none hover:bg-zinc-900/[0.04] focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:text-zinc-200"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => {
              setPins(draft);
              onClose();
            }}
            className="inline-flex h-10 items-center rounded-full bg-zinc-900 px-5 text-[13px] font-semibold text-white outline-none hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:bg-white dark:text-zinc-900"
          >
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
