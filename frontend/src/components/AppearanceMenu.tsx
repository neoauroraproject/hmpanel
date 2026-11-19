"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { clsx } from "clsx";
import { PanelLeft, PanelTop, SwatchBook } from "lucide-react";
import { useT } from "@/i18n";
import { useUiStyle, useUiStyleStore } from "@/store/uiStyle";
import type { UiNav, UiStyle } from "@/lib/ui-style";

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string; icon?: typeof PanelTop }[];
  onChange: (next: T) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</div>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex rounded-full border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-800 dark:bg-zinc-900"
      >
        {options.map((opt) => {
          const active = opt.id === value;
          const Icon = opt.icon;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt.id)}
              className={clsx(
                "flex min-h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 text-xs outline-none transition-colors duration-150",
                "focus-visible:ring-2 focus-visible:ring-blue-500/50",
                active
                  ? "bg-zinc-900 font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
              )}
            >
              {Icon ? <Icon size={14} aria-hidden /> : null}
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The user's own look for this browser. Falls back to the panel default until they choose. */
export function AppearanceControls({ className }: { className?: string }) {
  const t = useT();
  const { style, nav } = useUiStyle();
  const personalStyle = useUiStyleStore((s) => s.personalStyle);
  const personalNav = useUiStyleStore((s) => s.personalNav);
  const setPersonal = useUiStyleStore((s) => s.setPersonal);
  const hasPersonal = personalStyle !== null || personalNav !== null;

  return (
    <div className={clsx("space-y-3", className)}>
      <Segmented<UiStyle>
        label={t("appearance.styleLabel")}
        value={style}
        onChange={(next) => setPersonal({ style: next })}
        options={[
          { id: "classic", label: t("appearance.classic") },
          { id: "modern", label: t("appearance.modern") },
        ]}
      />
      {style === "modern" ? (
        <Segmented<UiNav>
          label={t("appearance.navLabel")}
          value={nav}
          onChange={(next) => setPersonal({ nav: next })}
          options={[
            { id: "top", label: t("appearance.navTop"), icon: PanelTop },
            { id: "side", label: t("appearance.navSide"), icon: PanelLeft },
          ]}
        />
      ) : null}
      {hasPersonal ? (
        <button
          type="button"
          onClick={() => setPersonal({ style: null, nav: null })}
          className="cursor-pointer text-xs font-medium text-blue-600 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-blue-500/50 dark:text-blue-400"
        >
          {t("appearance.usePanelDefault")}
        </button>
      ) : null}
    </div>
  );
}

const POPOVER_W = 240;
const EDGE = 8;

/**
 * Icon button + popover with the appearance controls. `placement` is where the popover
 * opens. The popover is fixed to the viewport, centred on the button and kept inside the
 * screen, so a narrow or clipped container (the sidebar) can never cut it off.
 */
export function AppearanceButton({
  placement = "top",
  className,
}: {
  placement?: "top" | "bottom";
  className?: string;
}) {
  const t = useT();
  const [pos, setPos] = useState<React.CSSProperties | null>(null);
  const open = pos !== null;
  const setOpen = (next: boolean | ((v: boolean) => boolean)) => {
    const want = typeof next === "function" ? next(open) : next;
    if (!want) return setPos(null);
    const r = buttonRef.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.min(Math.max(EDGE, r.left + r.width / 2 - POPOVER_W / 2), window.innerWidth - POPOVER_W - EDGE);
    setPos(
      placement === "top"
        ? { position: "fixed", left, bottom: window.innerHeight - r.top + EDGE, width: POPOVER_W }
        : { position: "fixed", left, top: r.bottom + EDGE, width: POPOVER_W },
    );
  };
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || popRef.current?.contains(target)) return;
      setPos(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPos(null);
    };
    // A fixed popover would drift from its button; close it instead.
    const onMove = () => setPos(null);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onMove);
    };
  }, [open]);

  return (
    <div ref={ref} className={clsx("relative shrink-0", className)}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t("appearance.title")}
        title={t("appearance.title")}
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg bg-slate-100 text-slate-600 outline-none transition-colors duration-200 hover:bg-slate-200 focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
      >
        <SwatchBook size={16} />
      </button>
      {/* Portal: a transformed ancestor (the sidebar) would otherwise anchor "fixed" to itself. */}
      {open && typeof document !== "undefined" ? createPortal(
        <div
          ref={popRef}
          role="dialog"
          aria-label={t("appearance.title")}
          style={pos ?? undefined}
          className="hm-pop z-[70] rounded-2xl border border-zinc-200 bg-white p-3.5 shadow-xl shadow-black/10 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/50"
        >
          <div className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {t("appearance.title")}
          </div>
          <AppearanceControls />
          <p className="mt-3 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            {t("appearance.personalHint")}
          </p>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
