"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpRight, X } from "lucide-react";
import { useT } from "@/i18n";

export type CommunityAd = {
  id: string;
  title: string;
  body: string;
  buttonText: string;
  linkUrl: string;
  badge: string;
};

const DISMISS_KEY = "hm-dismissed-ads";

function readDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

function writeDismissed(ids: Set<string>) {
  localStorage.setItem(DISMISS_KEY, JSON.stringify([...ids]));
}

async function fetchAds(): Promise<CommunityAd[]> {
  const res = await fetch("/api/public/ads", { cache: "no-store" });
  if (!res.ok) throw new Error(`ads ${res.status}`);
  const data = (await res.json()) as { ads?: CommunityAd[] };
  return Array.isArray(data.ads) ? data.ads : [];
}

/**
 * Community-only promo strip. Replaces the Premium revenue card on the dashboard.
 * Matches the reserved-ad layout: badge, title/body, CTA, dismiss.
 */
export function CommunityAdsCard() {
  const t = useT();
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setDismissed(readDismissed());
    setReady(true);
  }, []);

  const { data: ads = [], isLoading, isError } = useQuery({
    queryKey: ["community-ads"],
    queryFn: fetchAds,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const ad = useMemo(() => {
    if (!ready) return null;
    return ads.find((a) => a?.id && !dismissed.has(a.id)) ?? null;
  }, [ads, dismissed, ready]);

  const dismiss = () => {
    if (!ad) return;
    const next = new Set(dismissed);
    next.add(ad.id);
    setDismissed(next);
    writeDismissed(next);
  };

  if (!ready || isLoading) {
    return (
      <div
        className="sm:col-span-2 h-[7.5rem] animate-pulse rounded-2xl border border-zinc-200/80 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40"
        aria-hidden
      />
    );
  }

  if (isError || !ad) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.aside
        key={ad.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="relative sm:col-span-2 overflow-hidden rounded-2xl border border-emerald-500/20 bg-white shadow-[0_1px_0_rgba(16,185,129,0.06)] dark:bg-zinc-950 dark:border-emerald-500/15"
      >
        {/* Accent on the reading-start edge (right in RTL); soft wash toward the CTA */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 start-0 w-1 bg-emerald-500"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-emerald-500/[0.08] via-transparent to-transparent rtl:bg-gradient-to-l dark:from-emerald-400/[0.07]"
        />

        <button
          type="button"
          onClick={dismiss}
          aria-label={t("dashboard.adDismiss")}
          className="absolute end-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          <X size={16} strokeWidth={2} />
        </button>

        <div className="relative flex flex-col gap-4 p-4 ps-5 pe-12 sm:flex-row sm:items-center sm:gap-6 sm:p-5 sm:ps-6 sm:pe-14">
          <div className="min-w-0 flex-1 text-start">
            <span className="inline-flex items-center rounded-full border border-zinc-200/90 bg-zinc-50 px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
              {ad.badge || "Ads"}
            </span>
            <h3 className="mt-2 text-lg font-bold leading-snug tracking-tight text-zinc-900 dark:text-zinc-50">
              {ad.title}
            </h3>
            {ad.body ? (
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-zinc-500 dark:text-zinc-400 line-clamp-2">
                {ad.body}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 sm:ms-auto">
            <a
              href={ad.linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-600/20 transition-[transform,background-color,box-shadow] hover:bg-emerald-500 hover:shadow-md hover:shadow-emerald-500/25 active:scale-[0.98] sm:w-auto"
            >
              <ArrowUpRight
                size={16}
                strokeWidth={2.25}
                className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              />
              <span>{ad.buttonText}</span>
            </a>
          </div>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}
