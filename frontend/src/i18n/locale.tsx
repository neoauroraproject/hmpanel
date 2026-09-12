"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import en from "./messages/en.json";
import fa from "./messages/fa.json";

export type Locale = "fa" | "en";

export const LOCALE_STORAGE_KEY = "hmpanel-locale";
export const DEFAULT_LOCALE: Locale = "fa";

type Dict = Record<string, unknown>;

const BASE: Record<Locale, Dict> = { en: en as Dict, fa: fa as Dict };

function getByPath(obj: Dict, path: string): string | undefined {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Dict)[p];
  }
  return typeof cur === "string" ? cur : undefined;
}

function interpolate(template: string, params?: Record<string, string | number>) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    params[key] != null ? String(params[key]) : `{${key}}`,
  );
}

export function readStoredLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (raw === "fa" || raw === "en") return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_LOCALE;
}

export function applyDocumentLocale(locale: Locale) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.lang = locale;
  root.dir = locale === "fa" ? "rtl" : "ltr";
  root.classList.toggle("locale-fa", locale === "fa");
  root.classList.toggle("locale-en", locale === "en");

  const linkId = "hmpanel-vazirmatn";
  let link = document.getElementById(linkId) as HTMLLinkElement | null;
  if (locale === "fa") {
    if (!link) {
      link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      link.href = "/fonts/vazirmatn/vazirmatn.css";
      document.head.appendChild(link);
    }
  } else {
    link?.remove();
  }
}

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  dir: "rtl" | "ltr";
  mergeMessages: (locale: Locale, partial: Dict) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [extra, setExtra] = useState<Record<Locale, Dict>>({ en: {}, fa: {} });

  useEffect(() => {
    const stored = readStoredLocale();
    setLocaleState(stored);
    applyDocumentLocale(stored);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
      document.cookie = `${LOCALE_STORAGE_KEY}=${next};path=/;max-age=31536000;SameSite=Lax`;
    } catch {
      /* ignore */
    }
    applyDocumentLocale(next);
  }, []);

  const mergeMessages = useCallback((loc: Locale, partial: Dict) => {
    setExtra((prev) => ({
      ...prev,
      [loc]: deepMerge(prev[loc] || {}, partial),
    }));
  }, []);

  // Premium runtime (and other plugins) merge catalogs via this window hook.
  useEffect(() => {
    const w = window as Window & {
      __HMPANEL_MERGE_I18N?: (loc: Locale, partial: Dict) => void;
      HMPANEL_PREMIUM_I18N?: { en?: Dict; fa?: Dict };
    };
    w.__HMPANEL_MERGE_I18N = (loc, partial) => mergeMessages(loc, partial);
    const pending = w.HMPANEL_PREMIUM_I18N;
    if (pending?.en) mergeMessages("en", pending.en);
    if (pending?.fa) mergeMessages("fa", pending.fa);
    return () => {
      if (w.__HMPANEL_MERGE_I18N) delete w.__HMPANEL_MERGE_I18N;
    };
  }, [mergeMessages]);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      const fromExtra = getByPath(extra[locale] || {}, key);
      const fromBase = getByPath(BASE[locale] || {}, key);
      const fromEn = getByPath(BASE.en || {}, key);
      const raw = fromExtra ?? fromBase ?? fromEn ?? key;
      return interpolate(raw, params);
    },
    [locale, extra],
  );

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
      dir: (locale === "fa" ? "rtl" : "ltr") as "rtl" | "ltr",
      mergeMessages,
    }),
    [locale, setLocale, t, mergeMessages],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

function deepMerge(a: Dict, b: Dict): Dict {
  const out: Dict = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (v && typeof v === "object" && !Array.isArray(v) && typeof a[k] === "object" && a[k]) {
      out[k] = deepMerge(a[k] as Dict, v as Dict);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}

export function useT() {
  return useLocale().t;
}

/** Optional hook for components that may render outside provider (SSR safety). */
export function useTOptional() {
  const ctx = useContext(LocaleContext);
  return ctx?.t ?? ((key: string) => key);
}
