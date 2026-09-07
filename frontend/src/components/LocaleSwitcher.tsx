"use client";

import { clsx } from "clsx";
import { useLocale, type Locale } from "@/i18n";

export function LocaleSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useLocale();

  const options: { id: Locale; label: string }[] = [
    { id: "fa", label: t("nav.persian") },
    { id: "en", label: t("nav.english") },
  ];

  return (
    <div
      className={clsx(
        "inline-flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-800",
        className,
      )}
      role="group"
      aria-label={t("nav.language")}
    >
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => setLocale(opt.id)}
          className={clsx(
            "cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium outline-none transition-colors duration-200",
            "focus-visible:ring-2 focus-visible:ring-blue-500/40",
            locale === opt.id
              ? "bg-slate-100 text-slate-900 dark:bg-zinc-800 dark:text-zinc-50"
              : "text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
