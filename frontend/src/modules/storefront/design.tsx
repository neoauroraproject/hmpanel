"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { motion, type Transition } from "framer-motion";
import { clsx } from "clsx";

/** Soft spring — sheets / panels (Soft UI Evolution) */
export const springSoft: Transition = { type: "spring", stiffness: 420, damping: 34 };

export const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

export const fadeUpTransition: Transition = { duration: 0.32, ease: [0.22, 1, 0.36, 1] };

export const staggerContainer = {
  animate: { transition: { staggerChildren: 0.06 } },
};

export const staggerItem = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
};

const THEME_KEY = "hmpanel-storefront-theme";

export function useStorefrontTheme() {
  const [theme, setThemeState] = useState<"light" | "dark">("light");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY) as "light" | "dark" | null;
      if (saved === "light" || saved === "dark") {
        setThemeState(saved);
        applyTheme(saved);
        return;
      }
    } catch {
      /* ignore */
    }
    applyTheme("light");
  }, []);

  const setTheme = (next: "light" | "dark") => {
    setThemeState(next);
    applyTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
  };

  const toggle = () => setTheme(theme === "light" ? "dark" : "light");

  return { theme, setTheme, toggle, isDark: theme === "dark" };
}

function applyTheme(theme: "light" | "dark") {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
  root.style.colorScheme = theme;
}

export function StorefrontThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useStorefrontTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      className={clsx(
        "inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-2xl border border-black/[0.06] bg-white text-zinc-600 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition active:scale-95 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300",
        className,
      )}
      aria-label={theme === "light" ? "Dark mode" : "Light mode"}
    >
      {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  );
}

export function MotionPage({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={fadeUp.initial}
      animate={fadeUp.animate}
      exit={fadeUp.exit}
      transition={fadeUpTransition}
    >
      {children}
    </motion.div>
  );
}

/** Soft elevated surface — Soft UI / Apple-style card */
export function Surface({
  children,
  className = "",
  padding = "md",
  interactive,
}: {
  children: React.ReactNode;
  className?: string;
  padding?: "sm" | "md" | "lg" | "none";
  interactive?: boolean;
}) {
  const pad =
    padding === "none"
      ? ""
      : padding === "sm"
        ? "p-4"
        : padding === "lg"
          ? "p-6 sm:p-8"
          : "p-5";
  return (
    <div
      className={clsx(
        "rounded-[1.75rem] border border-black/[0.04] bg-white shadow-[0_8px_30px_-18px_rgba(15,23,42,0.28)] dark:border-white/[0.06] dark:bg-zinc-900 dark:shadow-[0_8px_30px_-18px_rgba(0,0,0,0.65)]",
        interactive && "transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-20px_rgba(15,23,42,0.35)]",
        pad,
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3 sm:mb-5">
      <div className="min-w-0">
        <h2 className="text-[1.35rem] font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-[1.5rem]">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-1 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function FieldBlock({
  title,
  hint,
  accent,
  children,
}: {
  title: string;
  hint?: string;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={clsx(
        "space-y-3 rounded-[1.5rem] border p-4 sm:p-5",
        accent
          ? "border-[color:var(--store-primary)]/25 bg-[color:var(--store-primary)]/[0.06]"
          : "border-black/[0.05] bg-[#F5F5F7] dark:border-white/[0.06] dark:bg-zinc-950/70",
      )}
    >
      <div>
        <div className="text-[15px] font-bold text-zinc-900 dark:text-zinc-50">{title}</div>
        {hint ? <p className="mt-0.5 text-[12px] text-zinc-500">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function AppButton({
  children,
  onClick,
  variant = "primary",
  disabled,
  className = "",
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "inline-flex h-12 min-h-[48px] w-full cursor-pointer items-center justify-center gap-2 rounded-2xl px-4 text-[15px] font-semibold transition duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        variant === "primary" &&
          "bg-[color:var(--store-primary)] text-white shadow-[0_10px_24px_-12px_var(--store-primary)]",
        variant === "secondary" &&
          "border border-black/[0.06] bg-white text-zinc-900 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-50",
        variant === "ghost" && "bg-transparent text-zinc-600 dark:text-zinc-300",
        variant === "danger" && "bg-rose-500 text-white",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Fixed mobile bottom tab bar — the strongest “native app” signal */
export function BottomTabBar({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{
    id: string;
    label: string;
    icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
    badge?: number;
  }>;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 lg:hidden"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto max-w-lg px-3">
        <div className="flex items-stretch gap-1 rounded-[1.6rem] border border-black/[0.06] bg-white/92 p-1.5 shadow-[0_-8px_40px_-12px_rgba(15,23,42,0.25)] backdrop-blur-2xl dark:border-white/10 dark:bg-zinc-950/92">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = value === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onChange(tab.id)}
                className={clsx(
                  "relative flex min-h-[52px] min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[1.2rem] px-1 py-1.5 text-[10px] font-semibold tracking-wide transition duration-200 active:scale-95",
                  active
                    ? "bg-[color:var(--store-primary)]/12 text-[color:var(--store-primary)]"
                    : "text-zinc-400",
                )}
                aria-current={active ? "page" : undefined}
              >
                <span className="relative">
                  <Icon size={22} strokeWidth={active ? 2.5 : 2} />
                  {tab.badge ? (
                    <span className="absolute -end-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                      {tab.badge > 9 ? "9+" : tab.badge}
                    </span>
                  ) : null}
                </span>
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

export function StatTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "accent" | "success" | "warn";
}) {
  return (
    <div
      className={clsx(
        "rounded-[1.35rem] border p-4",
        tone === "accent" &&
          "border-[color:var(--store-primary)]/20 bg-[color:var(--store-primary)]/[0.08]",
        tone === "success" && "border-emerald-500/20 bg-emerald-500/[0.08]",
        tone === "warn" && "border-amber-500/20 bg-amber-500/[0.08]",
        tone === "default" && "border-black/[0.04] bg-white dark:border-white/[0.06] dark:bg-zinc-900",
      )}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">{label}</div>
      <div className="mt-1.5 text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">{value}</div>
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-[1.75rem] border border-dashed border-zinc-300/90 bg-white/60 px-5 py-14 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
      <div className="text-[15px] font-semibold text-zinc-700 dark:text-zinc-200">{title}</div>
      {hint ? <p className="mx-auto mt-1.5 max-w-xs text-[13px] text-zinc-500">{hint}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
