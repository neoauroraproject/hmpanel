"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ExternalLink, Gem, LayoutDashboard, PanelTop, Sparkles, Store, SwatchBook, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { useT } from "@/i18n";

type WhatsNew = { show: boolean; version?: string; from?: string | null };

/**
 * Release notes shown once to the panel owner after an update. The backend decides
 * (first boot on a new version, owner only); closing it in any way marks it seen.
 */
export function WhatsNewModal() {
  const t = useT();
  const qc = useQueryClient();
  const isOwner = useAuth((s) => s.admin?.isOwner === true);
  const startRef = useRef<HTMLButtonElement>(null);

  const { data } = useQuery<WhatsNew>({
    queryKey: ["whats-new"],
    queryFn: async () => (await api.get<WhatsNew>("/settings/whats-new")).data,
    enabled: isOwner,
    staleTime: Infinity,
    retry: false,
  });
  const seen = useMutation({
    mutationFn: async () => (await api.post("/settings/whats-new/seen")).data,
    onSettled: () => qc.setQueryData(["whats-new"], { show: false }),
  });

  const open = !!data?.show;
  const close = () => {
    qc.setQueryData(["whats-new"], { show: false });
    seen.mutate();
  };

  useEffect(() => {
    if (!open) return;
    startRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // close only changes identity per render; the listener reads the latest one
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const points = [
    { icon: LayoutDashboard, title: t("whatsNew.p1Title"), text: t("whatsNew.p1") },
    { icon: PanelTop, title: t("whatsNew.p2Title"), text: t("whatsNew.p2") },
    { icon: Store, title: t("whatsNew.p3Title"), text: t("whatsNew.p3") },
    { icon: SwatchBook, title: t("whatsNew.p4Title"), text: t("whatsNew.p4") },
  ];

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="whats-new-title"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
            className="relative grid max-h-[92dvh] w-full max-w-4xl overflow-hidden rounded-[28px] bg-white shadow-[0_40px_120px_-30px_rgb(0_0_0/0.6)] md:grid-cols-[1fr_1.05fr] dark:bg-zinc-950"
          >
            <button
              type="button"
              onClick={close}
              aria-label={t("common.close")}
              className="absolute end-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-black/5 text-zinc-600 outline-none transition-colors hover:bg-black/10 focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:bg-white/10 dark:text-zinc-300 md:text-white md:hover:bg-white/20"
            >
              <X size={16} />
            </button>

            <div className="overflow-y-auto p-7 sm:p-8">
              <span className="inline-flex items-center gap-2 rounded-full bg-blue-500/10 px-3 py-1 text-[12px] font-semibold text-blue-700 dark:text-blue-300">
                <Sparkles size={13} aria-hidden /> {t("whatsNew.badge")}
                {data?.version ? <span className="tabular-nums" dir="ltr">v{data.version}</span> : null}
              </span>
              <h2 id="whats-new-title" className="mt-4 text-2xl font-bold leading-tight tracking-tight text-zinc-900 dark:text-zinc-50">
                {t("whatsNew.title")}
              </h2>
              <p className="mt-2 text-[13.5px] leading-7 text-zinc-600 dark:text-zinc-400">{t("whatsNew.subtitle")}</p>

              <ul className="mt-5 space-y-3.5">
                {points.map(({ icon: Icon, title, text }) => (
                  <li key={title} className="flex gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">
                      <Icon size={16} aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-semibold text-zinc-900 dark:text-zinc-50">{title}</span>
                      <span className="mt-0.5 block text-[12.5px] leading-6 text-zinc-500 dark:text-zinc-400">{text}</span>
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-5 flex items-start gap-2 rounded-2xl bg-amber-500/10 px-3.5 py-3 text-[12.5px] leading-6 text-amber-800 dark:text-amber-200">
                <Gem size={15} className="mt-1 shrink-0" aria-hidden />
                {t("whatsNew.premium")}
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-2">
                <button
                  ref={startRef}
                  type="button"
                  onClick={close}
                  className="group inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-[14px] font-semibold text-white outline-none transition-colors hover:bg-blue-500 focus-visible:ring-4 focus-visible:ring-blue-500/30"
                >
                  {t("whatsNew.start")}
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" aria-hidden />
                </button>
                <a
                  href="https://github.com/neoauroraproject/hmpanel/blob/main/CHANGELOG.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-[13px] font-medium text-zinc-600 outline-none hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-blue-500/50 dark:text-zinc-300 dark:hover:bg-zinc-900"
                >
                  <ExternalLink size={14} aria-hidden /> {t("whatsNew.changelog")}
                </a>
              </div>
            </div>

            <div className="relative hidden overflow-hidden bg-zinc-950 md:block">
              <div className="pointer-events-none absolute -top-24 start-0 h-80 w-80 rounded-full bg-blue-600/40 blur-[90px]" aria-hidden />
              <div className="pointer-events-none absolute -bottom-24 end-0 h-80 w-80 rounded-full bg-cyan-400/25 blur-[90px]" aria-hidden />
              {/* eslint-disable-next-line @next/next/no-img-element -- static preview image */}
              <img
                src="/brand/v3-preview.webp"
                alt=""
                aria-hidden
                className="absolute start-10 top-16 w-[150%] max-w-none rounded-2xl border border-white/10 shadow-[0_40px_80px_-30px_rgb(0_0_0/0.9)]"
              />
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
