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
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            locale === opt.id
              ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
              : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
