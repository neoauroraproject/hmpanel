"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ensureVazirFont, isPersianStorefront } from "@/modules/shared/brand-logo";
import type { StorefrontStore } from "./types";

export type StorefrontLang = "fa" | "en";

const STORAGE_KEY = "hmpanel-storefront-lang";

type LocaleContextValue = {
  lang: StorefrontLang;
  setLang: (lang: StorefrontLang) => void;
  isFa: boolean;
  t: (fa: string, en: string) => string;
  tomanLabel: string;
  formatToman: (value: number | string | null | undefined) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function detectDefaultLang(store?: StorefrontStore | null): StorefrontLang {
  if (typeof window !== "undefined") {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "fa" || saved === "en") return saved;
  }
  return isPersianStorefront(store) ? "fa" : "en";
}

export function StorefrontLocaleProvider({
  store,
  children,
}: {
  store?: StorefrontStore | null;
  children: ReactNode;
}) {
  const [lang, setLangState] = useState<StorefrontLang>(() => detectDefaultLang(store));

  const setLang = useCallback((next: StorefrontLang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (lang === "fa") {
      ensureVazirFont();
      document.documentElement.lang = "fa";
      document.documentElement.dir = "rtl";
    } else {
      document.documentElement.lang = "en";
      document.documentElement.dir = "ltr";
    }
    return () => {
      document.documentElement.dir = "ltr";
      document.documentElement.lang = "en";
    };
  }, [lang]);

  const value = useMemo<LocaleContextValue>(() => {
    const isFa = lang === "fa";
    return {
      lang,
      setLang,
      isFa,
      t: (fa, en) => (isFa ? fa : en),
      tomanLabel: isFa ? "تومان" : "Toman",
      formatToman: (raw) => {
        const n = Number(raw || 0);
        return `${n.toLocaleString()} ${isFa ? "تومان" : "Toman"}`;
      },
    };
  }, [lang, setLang]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useStorefrontLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    return {
      lang: "en" as StorefrontLang,
      setLang: () => undefined,
      isFa: false,
      t: (_fa: string, en: string) => en,
      tomanLabel: "Toman",
      formatToman: (raw: number | string | null | undefined) =>
        `${Number(raw || 0).toLocaleString()} Toman`,
    };
  }
  return ctx;
}

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { lang, setLang, t } = useStorefrontLocale();
  return (
    <div
      className={`inline-flex rounded-full border border-zinc-200/80 bg-white/90 p-1 text-xs font-bold shadow-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/90 ${className}`}
      role="group"
      aria-label={t("زبان", "Language")}
      style={{
        borderColor: "color-mix(in srgb, var(--tma-hint, #a1a1aa) 35%, transparent)",
        background: "color-mix(in srgb, var(--tma-secondary-bg, #fff) 88%, transparent)",
      }}
    >
      <button
        type="button"
        onClick={() => setLang("fa")}
        className={`rounded-full px-3 py-1.5 transition ${
          lang === "fa"
            ? "bg-[color:var(--store-primary,var(--tma-button,#2563eb))] text-white"
            : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
        }`}
        style={lang !== "fa" ? { color: "var(--tma-hint, inherit)" } : undefined}
      >
        فارسی
      </button>
      <button
        type="button"
        onClick={() => setLang("en")}
        className={`rounded-full px-3 py-1.5 transition ${
          lang === "en"
            ? "bg-[color:var(--store-primary,var(--tma-button,#2563eb))] text-white"
            : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
        }`}
        style={lang !== "en" ? { color: "var(--tma-hint, inherit)" } : undefined}
      >
        EN
      </button>
    </div>
  );
}
