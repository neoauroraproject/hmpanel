"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Check,
  Clock,
  CreditCard,
  Headphones,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { fadeUp, fadeUpTransition } from "./design";
import { resolveStorefrontCopy } from "./copy";
import { resolveStorefrontLayout, resolveStorefrontSkin, type StorefrontLayoutId } from "./skins";
import { PrimaryButton, SecondaryButton } from "./buttons";
import { StoreSupportChips } from "./shell";
import { useStorefrontLocale } from "./locale";
import type { StorefrontCategory, StorefrontStore } from "./types";

const FEATURE_ICONS = [ShieldCheck, Zap, Clock, Headphones, CreditCard, Sparkles];

export function WelcomeHero({
  store,
  onBuy,
  onLogin,
  onTrack,
  layout = "classic",
  categories = [],
  onPickCategory,
}: {
  store?: StorefrontStore;
  onBuy: () => void;
  onLogin: () => void;
  onTrack?: () => void;
  layout?: StorefrontLayoutId;
  categories?: StorefrontCategory[];
  onPickCategory?: (id: string) => void;
}) {
  const settings = store?.publishedTheme?.settings;
  const skin = resolveStorefrontSkin(settings);
  const resolvedLayout = layout || resolveStorefrontLayout(settings);
  if (skin === "pulse" || resolvedLayout === "market") {
    return (
      <PulseHero store={store} onBuy={onBuy} onLogin={onLogin} onTrack={onTrack} />
    );
  }
  if (skin === "lumen" || resolvedLayout === "split") {
    return (
      <LumenHero
        store={store}
        onBuy={onBuy}
        onLogin={onLogin}
        onTrack={onTrack}
        categories={categories}
        onPickCategory={onPickCategory}
      />
    );
  }
  if (skin === "cascade" || resolvedLayout === "funnel") {
    return (
      <CascadeHero store={store} onBuy={onBuy} onLogin={onLogin} onTrack={onTrack} />
    );
  }
  return <AtelierHero store={store} onBuy={onBuy} onLogin={onLogin} onTrack={onTrack} />;
}

function AtelierHero({
  store,
  onBuy,
  onLogin,
  onTrack,
}: {
  store?: StorefrontStore;
  onBuy: () => void;
  onLogin: () => void;
  onTrack?: () => void;
}) {
  const { t, isFa } = useStorefrontLocale();
  const copy = resolveStorefrontCopy(store?.publishedTheme?.settings, isFa);
  const logoLight = store?.logoUrl || store?.branding?.logo || null;
  const logoDark = store?.logoDarkUrl || store?.branding?.logoDark || null;
  const name = store?.branding?.name || store?.title || "Store";
  const blurb = store?.branding?.description || store?.description || copy.subhead;
  const reduce = useReducedMotion();

  return (
    <motion.section
      {...(reduce ? {} : fadeUp)}
      transition={fadeUpTransition}
      className="store-enter mx-auto flex max-w-2xl flex-col items-center py-6 text-center sm:py-10"
    >
      {logoLight || logoDark ? (
        <span className="relative mb-5 h-[4.5rem] w-[4.5rem] sm:h-24 sm:w-24">
          {logoLight ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoLight}
              alt={name}
              className={`absolute inset-0 mx-auto h-full w-auto max-w-[9rem] object-contain drop-shadow-sm transition-opacity duration-300 sm:max-w-[11rem] ${
                logoDark ? "opacity-100 dark:opacity-0" : "opacity-100"
              }`}
            />
          ) : null}
          {logoDark ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoDark}
              alt={name}
              className={`absolute inset-0 mx-auto h-full w-auto max-w-[9rem] object-contain drop-shadow-sm transition-opacity duration-300 sm:max-w-[11rem] ${
                logoLight ? "opacity-0 dark:opacity-100" : "opacity-100"
              }`}
            />
          ) : null}
        </span>
      ) : (
        <div className="mb-5 flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-[1.5rem] bg-[color:var(--store-primary)] text-white shadow-[0_16px_40px_-18px_var(--store-primary)] sm:h-24 sm:w-24">
          <ShieldCheck size={36} />
        </div>
      )}
      <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[color:var(--store-muted)]">
        {copy.kicker || t("فروشگاه", "Store")}
      </p>
      <h1 className="mt-2 text-[2rem] font-black tracking-tight sm:text-[2.75rem] [font-family:var(--store-display,inherit)]">
        {name}
      </h1>
      <p className="mt-3 max-w-md whitespace-pre-line text-[15px] leading-relaxed text-[color:var(--store-muted)] sm:text-base">
        {blurb}
      </p>
      <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
        <PrimaryButton onClick={onBuy}>{copy.ctaPrimary}</PrimaryButton>
        <SecondaryButton onClick={onLogin}>{copy.ctaSecondary}</SecondaryButton>
      </div>
      {onTrack ? (
        <button
          type="button"
          onClick={onTrack}
          className="store-focus-ring mt-5 min-h-11 cursor-pointer text-[14px] font-semibold text-[color:var(--store-primary)]"
        >
          {copy.ctaTrack}
        </button>
      ) : null}
      <div className="mt-8 grid w-full gap-3 sm:grid-cols-3">
        {copy.features.slice(0, 3).map((feature) => (
          <div
            key={feature.title}
            className="rounded-[1.25rem] border border-[color:var(--store-panel-border)] bg-[color:var(--store-panel)] px-4 py-3 text-start"
          >
            <div className="text-[13px] font-bold">{feature.title}</div>
            <p className="mt-1 text-[12px] leading-relaxed text-[color:var(--store-muted)]">{feature.body}</p>
          </div>
        ))}
      </div>
      <StoreSupportChips supportLinks={store?.branding?.supportLinks} />
    </motion.section>
  );
}

function PulseHero({
  store,
  onBuy,
  onLogin,
  onTrack,
}: {
  store?: StorefrontStore;
  onBuy: () => void;
  onLogin: () => void;
  onTrack?: () => void;
}) {
  const { isFa } = useStorefrontLocale();
  const copy = resolveStorefrontCopy(store?.publishedTheme?.settings, isFa);
  const name = store?.branding?.name || store?.title || "";
  const reduce = useReducedMotion();
  const [mode, setMode] = useState<"buy" | "login">("buy");

  return (
    <motion.section
      {...(reduce ? {} : fadeUp)}
      transition={fadeUpTransition}
      className="store-enter store-panel overflow-hidden rounded-[0.9rem] p-4 sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[18px] font-bold tracking-tight [font-family:var(--store-display,inherit)]">
          {copy.headline}
        </h1>
        <span className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--store-muted)]">{copy.kicker}</span>
      </div>
      {name ? (
        <p className="mt-1 text-[13px] text-[color:var(--store-muted)]">{name}</p>
      ) : null}

      <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-xl bg-black/35 p-1">
        <button
          type="button"
          onClick={() => setMode("buy")}
          className={`store-focus-ring min-h-11 cursor-pointer rounded-lg text-[14px] font-semibold transition duration-200 ${
            mode === "buy"
              ? "bg-[color:var(--store-primary)]/20 text-white shadow-[0_0_24px_color-mix(in_srgb,var(--store-primary)_35%,transparent)]"
              : "text-[color:var(--store-muted)]"
          }`}
        >
          {copy.ctaPrimary}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("login");
            onLogin();
          }}
          className={`store-focus-ring min-h-11 cursor-pointer rounded-lg text-[14px] font-semibold transition duration-200 ${
            mode === "login" ? "bg-white/10 text-white" : "text-[color:var(--store-muted)]"
          }`}
        >
          {copy.ctaSecondary}
        </button>
      </div>

      <div className="mt-4 flex gap-4 border-b border-[color:var(--store-panel-border)] text-[13px] font-semibold">
        {[copy.tabPlans, copy.tabDetails, copy.tabPay].filter(Boolean).map((label, index) => (
          <span
            key={label}
            className={`relative pb-2 ${index === 0 ? "text-white" : "text-[color:var(--store-muted)]"}`}
          >
            {label}
            {index === 0 ? (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[color:var(--store-primary)] shadow-[0_0_12px_var(--store-primary)]" />
            ) : null}
          </span>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between text-[13px]">
        <span className="text-[color:var(--store-muted)]">{copy.availableLabel}</span>
        <span className="font-semibold text-white">{copy.availableHint}</span>
      </div>

      <p className="mt-4 text-[14px] leading-relaxed text-[color:var(--store-muted)]">{copy.subhead}</p>

      <div className="mt-5 space-y-2">
        {copy.features.slice(0, 3).map((feature) => (
          <div
            key={feature.title}
            className="flex items-center justify-between rounded-xl border border-[color:var(--store-panel-border)] bg-black/25 px-3 py-3"
          >
            <div>
              <div className="text-[14px] font-semibold text-white">{feature.title}</div>
              <p className="text-[12px] text-[color:var(--store-muted)]">{feature.body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-[color:var(--store-panel-border)] px-3 py-3 text-[13px]">
        <span className="text-[color:var(--store-muted)]">{copy.orderValue}</span>
        <span className="font-semibold text-white">{name || "—"}</span>
      </div>

      <PrimaryButton className="store-cta-glow mt-5" onClick={onBuy}>
        {copy.ctaPrimary}
      </PrimaryButton>
      {onTrack ? (
        <button
          type="button"
          onClick={onTrack}
          className="store-focus-ring mt-3 min-h-11 w-full cursor-pointer text-center text-[13px] font-semibold text-[color:var(--store-primary)]"
        >
          {copy.ctaTrack}
        </button>
      ) : null}
    </motion.section>
  );
}

function LumenHero({
  store,
  onBuy,
  onLogin,
  onTrack,
  categories,
  onPickCategory,
}: {
  store?: StorefrontStore;
  onBuy: () => void;
  onLogin: () => void;
  onTrack?: () => void;
  categories: StorefrontCategory[];
  onPickCategory?: (id: string) => void;
}) {
  const { isFa } = useStorefrontLocale();
  const copy = resolveStorefrontCopy(store?.publishedTheme?.settings, isFa);
  const reduce = useReducedMotion();
  const [picked, setPicked] = useState<string | null>(null);
  const cards = categories.length
    ? categories.slice(0, 6).map((category) => ({
        id: category.id,
        title: category.name,
        body: category.description || copy.subhead,
        icon: category.icon,
      }))
    : copy.features.slice(0, 6).map((feature, index) => ({
        id: `feature-${index}`,
        title: feature.title,
        body: feature.body,
        icon: null as string | null,
      }));

  return (
    <motion.section {...(reduce ? {} : fadeUp)} transition={fadeUpTransition} className="store-enter py-2 sm:py-6">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-[1.65rem] font-bold tracking-tight text-slate-900 sm:text-[2.15rem] [font-family:var(--store-display,inherit)]">
          {copy.headline}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-slate-500">{copy.subhead}</p>
      </div>
      <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cards.map((card) => {
          const selected = picked === card.id;
          const Icon = FEATURE_ICONS[Math.abs(card.title.length) % FEATURE_ICONS.length];
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => {
                setPicked(card.id);
                if (onPickCategory && categories.some((c) => c.id === card.id)) onPickCategory(card.id);
              }}
              className={`store-focus-ring relative min-h-[7.5rem] cursor-pointer rounded-2xl border p-4 text-start transition duration-200 ${
                selected
                  ? "border-[color:var(--store-primary)] ring-2 ring-[color:var(--store-primary)]/20"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <span
                className={`absolute end-3 top-3 flex h-6 w-6 items-center justify-center rounded-full border ${
                  selected ? "border-transparent bg-[color:var(--store-primary)] text-white" : "border-slate-300 bg-white"
                }`}
              >
                {selected ? <Check size={14} strokeWidth={3} /> : null}
              </span>
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-slate-600">
                {card.icon ? <span className="text-lg">{card.icon}</span> : <Icon size={18} />}
              </span>
              <div className="mt-3 pr-8 text-[15px] font-bold text-slate-900">{card.title}</div>
              <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-slate-500">{card.body}</p>
            </button>
          );
        })}
      </div>
      <div className="mt-6">
        <PrimaryButton onClick={onBuy}>{copy.ctaPrimary}</PrimaryButton>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-4">
        <button type="button" onClick={onLogin} className="store-focus-ring min-h-11 cursor-pointer text-[14px] font-semibold text-slate-600">
          {copy.ctaSecondary}
        </button>
        {onTrack ? (
          <button type="button" onClick={onTrack} className="store-focus-ring min-h-11 cursor-pointer text-[14px] font-semibold text-[color:var(--store-primary)]">
            {copy.ctaTrack}
          </button>
        ) : null}
      </div>
    </motion.section>
  );
}

function CascadeHero({
  store,
  onBuy,
  onLogin,
  onTrack,
}: {
  store?: StorefrontStore;
  onBuy: () => void;
  onLogin: () => void;
  onTrack?: () => void;
}) {
  const { isFa } = useStorefrontLocale();
  const copy = resolveStorefrontCopy(store?.publishedTheme?.settings, isFa);
  const reduce = useReducedMotion();

  return (
    <motion.section
      {...(reduce ? {} : fadeUp)}
      transition={fadeUpTransition}
      className="store-enter mx-auto w-full max-w-lg"
    >
      <div className="store-glass rounded-[1.1rem] p-6 sm:p-8">
        <p className="text-[13px] font-medium text-slate-500">{copy.kicker}</p>
        <h1 className="mt-2 text-[1.75rem] font-semibold leading-tight text-slate-900 [font-family:var(--store-display,inherit)] sm:text-[2rem]">
          {copy.headline}
        </h1>
        {copy.subhead ? (
          <p className="mt-3 text-[15px] leading-[1.55] text-slate-600">{copy.subhead}</p>
        ) : null}
        <div className="mt-7 space-y-3">
          <PrimaryButton onClick={onBuy}>{copy.ctaPrimary}</PrimaryButton>
          <SecondaryButton onClick={onLogin}>{copy.ctaSecondary}</SecondaryButton>
        </div>
        {onTrack ? (
          <button
            type="button"
            onClick={onTrack}
            className="store-focus-ring mt-4 min-h-11 w-full cursor-pointer text-[14px] font-medium text-slate-600"
          >
            {copy.ctaTrack}
          </button>
        ) : null}
      </div>
    </motion.section>
  );
}
