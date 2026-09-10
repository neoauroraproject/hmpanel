"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import QRCode from "react-qr-code";
import {
  Check,
  Copy,
  KeyRound,
  LoaderCircle,
  QrCode,
  X,
} from "lucide-react";
import { formatBytes, formatDate, formatExpiry } from "@/lib/format";
import { copyToClipboard } from "@/lib/clipboard";
import { useStorefrontLocale } from "./locale";
import { fadeUp } from "./design";
import { type StorefrontLayoutId } from "./skins";
import { PrimaryButton, SecondaryButton } from "./buttons";
import type {
  CustomerNotification,
  CustomerOrder,
  CustomerService,
  StorefrontCategory,
  StorefrontProduct,
} from "./types";

export { StoreShell } from "./shell";
export { WelcomeHero } from "./heroes";
export { PrimaryButton, SecondaryButton };


export function CategoryCard({
  category,
  selected = false,
  onSelect,
  locked = false,
}: {
  category: StorefrontCategory;
  productCount?: number;
  selected?: boolean;
  onSelect: () => void;
  locked?: boolean;
}) {
  const { t } = useStorefrontLocale();
  const initial = (category.name || "?").trim().slice(0, 1).toUpperCase();

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      disabled={locked && !selected}
      layout
      whileHover={locked ? undefined : { y: -2 }}
      whileTap={locked ? undefined : { scale: 0.99 }}
      animate={
        selected
          ? { boxShadow: "0 16px 40px -18px color-mix(in srgb, var(--store-primary) 55%, transparent)" }
          : { boxShadow: "0 10px 28px -20px rgba(15,23,42,0.28)" }
      }
      transition={{ duration: 0.2 }}
      className={`store-focus-ring group relative flex h-full min-h-[5.5rem] w-full items-center overflow-hidden rounded-[var(--store-radius,1.65rem)] border p-4 text-start sm:min-h-[6rem] sm:p-5 ${
        selected
          ? "border-[color:var(--store-primary)] bg-[color:var(--store-primary)]/[0.1] ring-2 ring-[color:var(--store-primary)]/35"
          : "border-black/[0.05] bg-white/90 hover:border-black/[0.1] dark:border-white/[0.07] dark:bg-zinc-900/90"
      } ${locked && !selected ? "cursor-default opacity-60" : "cursor-pointer"}`}
    >
      <AnimatePresence>
        {selected ? (
          <motion.div
            key="cat-glow"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 80% 70% at 100% 0%, color-mix(in srgb, var(--store-primary) 22%, transparent), transparent 65%)",
            }}
          />
        ) : null}
      </AnimatePresence>
      <div className="relative flex w-full items-center gap-3.5">
        <motion.div
          animate={selected ? { scale: 1.06, rotate: -4 } : { scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 18 }}
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[1.1rem] text-lg font-black text-white shadow-sm sm:h-14 sm:w-14 sm:text-xl ${
            selected ? "" : "bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900"
          }`}
          style={selected ? { background: "var(--store-primary)" } : undefined}
        >
          {category.icon?.trim() ? (
            <span className="text-[1.35rem] leading-none">{category.icon.trim()}</span>
          ) : (
            initial
          )}
        </motion.div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="text-[15px] font-bold leading-snug tracking-tight sm:text-[16px]">
              {category.name}
            </div>
            <AnimatePresence>
              {selected ? (
                <motion.span
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[color:var(--store-primary)] px-2 py-0.5 text-[10px] font-bold text-white"
                >
                  <Check size={11} strokeWidth={3} />
                  {locked ? t("قفل", "Locked") : t("انتخاب شد", "Selected")}
                </motion.span>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
        <AnimatePresence>
          {selected ? (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 22 }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--store-primary)] text-white shadow-md"
            >
              <Check size={16} strokeWidth={3} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.button>
  );
}

export function CategoryGrid({
  categories,
  selectedId,
  productCounts,
  onSelect,
  lockedId,
  layout = "classic",
}: {
  categories: StorefrontCategory[];
  selectedId?: string | null;
  productCounts?: Record<string, number>;
  onSelect: (category: StorefrontCategory) => void;
  lockedId?: string | null;
  layout?: StorefrontLayoutId;
}) {
  return (
    <div
      className={
        layout === "market"
          ? "flex flex-col gap-2"
          : layout === "split"
            ? "grid grid-cols-1 gap-3 sm:grid-cols-2"
            : layout === "funnel"
              ? "grid grid-cols-1 gap-3 sm:grid-cols-2"
              : "grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2"
      }
    >
      {categories.map((category, index) => (
        <motion.div
          key={category.id}
          className="h-full min-h-0"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.04, duration: 0.28 }}
        >
          <CategoryCard
            category={category}
            selected={selectedId === category.id}
            locked={!!lockedId && lockedId !== category.id}
            onSelect={() => onSelect(category)}
          />
        </motion.div>
      ))}
    </div>
  );
}

export function ProductCard({
  product,
  onSelect,
  selected = false,
  currency,
  layout = "classic",
}: {
  product: StorefrontProduct;
  onSelect: () => void;
  selected?: boolean;
  currency?: string | null;
  layout?: StorefrontLayoutId;
}) {
  const { formatProductPrice, t } = useStorefrontLocale();
  const price = formatProductPrice(product, currency);

  if (layout === "market") {
    return (
      <PlanPickRow product={product} selected={selected} onSelect={onSelect} currency={currency} />
    );
  }

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.99 }}
      transition={{ duration: 0.2 }}
      className={`store-focus-ring relative min-w-0 w-full cursor-pointer overflow-hidden border bg-[color:var(--store-panel,#fff)] p-5 text-start ${
        layout === "split"
          ? "rounded-[0.9rem] shadow-none"
          : layout === "funnel"
            ? "store-glass rounded-[1.1rem]"
            : "rounded-[1.75rem] shadow-[0_8px_30px_-18px_rgba(15,23,42,0.28)]"
      } ${
        selected
          ? "border-[color:var(--store-primary)] ring-2 ring-[color:var(--store-primary)]/25"
          : "border-black/[0.04] hover:border-black/[0.08] dark:border-white/[0.06]"
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {product.featured ? (
          <span className="inline-flex rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            {t("ویژه", "Featured")}
          </span>
        ) : null}
        {product.badge ? (
          <span className="inline-flex rounded-full bg-[color:var(--store-primary)]/10 px-2.5 py-1 text-xs font-semibold text-[color:var(--store-primary)]">
            {product.badge}
          </span>
        ) : null}
        {Array.isArray(product.ipLimitOptions) && product.ipLimitOptions.length === 1 ? (
          <span className="inline-flex rounded-full bg-sky-500/10 px-2.5 py-1 text-xs font-semibold text-sky-700 dark:text-sky-300">
            {product.ipLimitOptions[0].label || `${product.ipLimitOptions[0].limitIp} users`}
          </span>
        ) : null}
        {selected ? (
          <span className="ms-auto inline-flex rounded-full bg-[color:var(--store-primary)] px-2.5 py-1 text-[11px] font-bold text-white">
            {t("انتخاب شد", "Selected")}
          </span>
        ) : null}
      </div>
      <div className="text-lg font-bold">{product.name}</div>
      {product.description ? (
        <p
          className={`mt-2 min-w-0 whitespace-pre-line break-words text-sm leading-relaxed text-zinc-500 dark:text-zinc-400 [overflow-wrap:anywhere] ${
            selected ? "" : "line-clamp-3"
          }`}
        >
          {product.description}
        </p>
      ) : null}
      <div className="mt-5 space-y-1">
        {price ? (
          <div className="text-2xl font-black text-[color:var(--store-primary)]">{price}</div>
        ) : (
          <div className="text-lg font-bold text-zinc-400">{t("تماس برای قیمت", "Contact for price")}</div>
        )}
      </div>
      <div className="mt-4 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
        <div className="flex justify-between gap-3">
          <span>{t("ترافیک", "Traffic")}</span>
          <span>{formatBytes(product.traffic)}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span>{t("مدت", "Duration")}</span>
          <span>
            {product.durationDays} {t("روز", "days")}
          </span>
        </div>
      </div>
    </motion.button>
  );
}

export function PlanPickRow({
  product,
  selected = false,
  onSelect,
  currency,
}: {
  product: StorefrontProduct;
  selected?: boolean;
  onSelect: () => void;
  currency?: string | null;
}) {
  const { formatProductPrice, t } = useStorefrontLocale();
  const price = formatProductPrice(product, currency) || "—";

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      layout
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.99 }}
      animate={
        selected
          ? {
              boxShadow: "0 16px 40px -14px color-mix(in srgb, var(--store-primary) 58%, transparent)",
            }
          : { boxShadow: "0 0 0 transparent" }
      }
      transition={{ duration: 0.2 }}
      className={`store-focus-ring relative flex min-h-14 w-full items-center justify-between gap-3 overflow-hidden rounded-[var(--store-radius,1.35rem)] border px-3.5 py-3.5 text-start ${
        selected
          ? "border-[color:var(--store-primary)] bg-[color:var(--store-primary)]/[0.12] ring-2 ring-[color:var(--store-primary)]/40"
          : "border-[color:var(--store-panel-border)] bg-[color:var(--store-panel)]"
      }`}
    >
      <AnimatePresence>
        {selected ? (
          <motion.div
            key="row-glow"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 80% 100% at 0% 50%, color-mix(in srgb, var(--store-primary) 22%, transparent), transparent 70%)",
            }}
          />
        ) : null}
      </AnimatePresence>
      <div className="relative flex min-w-0 flex-1 items-center gap-3">
        <motion.div
          animate={selected ? { scale: 1.08 } : { scale: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 20 }}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 ${
            selected
              ? "border-[color:var(--store-primary)] bg-[color:var(--store-primary)] text-white"
              : "border-zinc-200 bg-zinc-50 text-transparent dark:border-zinc-700 dark:bg-zinc-900"
          }`}
        >
          <AnimatePresence mode="wait">
            {selected ? (
              <motion.span
                key="on"
                initial={{ scale: 0, rotate: -50 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0 }}
                transition={{ type: "spring", stiffness: 560, damping: 18 }}
              >
                <Check size={17} strokeWidth={3} className="text-white" />
              </motion.span>
            ) : (
              <motion.span key="off" className="h-2.5 w-2.5 rounded-full bg-zinc-300 dark:bg-zinc-600" />
            )}
          </AnimatePresence>
        </motion.div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className={`truncate font-semibold ${selected ? "text-[color:var(--store-primary)]" : ""}`}>
              {product.name}
            </div>
            <AnimatePresence>
              {selected ? (
                <motion.span
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.7 }}
                  className="shrink-0 rounded-full bg-[color:var(--store-primary)] px-2 py-0.5 text-[10px] font-bold text-white"
                >
                  {t("انتخاب شد", "Selected")}
                </motion.span>
              ) : null}
            </AnimatePresence>
          </div>
          <div className="mt-0.5 text-xs text-zinc-500">
            {formatBytes(product.traffic)} · {product.durationDays} {t("روز", "days")}
          </div>
        </div>
      </div>
      <motion.div
        animate={selected ? { scale: 1.05 } : { scale: 1 }}
        className="relative shrink-0 text-sm font-bold text-[color:var(--store-primary)]"
      >
        {price}
      </motion.div>
    </motion.button>
  );
}

export function Stepper({
  labels,
  activeIndex,
  layout = "classic",
}: {
  labels: string[];
  activeIndex: number;
  layout?: StorefrontLayoutId;
}) {
  if (layout === "funnel") {
    return (
      <ol className="store-glass mb-5 flex items-center gap-2 overflow-x-auto rounded-[1.1rem] px-3 py-3 sm:mb-6 sm:px-4">
        {labels.map((label, index) => {
          const done = index < activeIndex;
          const now = index === activeIndex;
          return (
            <li key={`${index}-${label}`} className="flex min-w-0 flex-1 items-center gap-2">
              {index > 0 ? (
                <span
                  aria-hidden
                  className={`hidden h-px w-4 shrink-0 sm:block ${
                    done || now ? "bg-[color:var(--store-primary)]/40" : "bg-slate-200"
                  }`}
                />
              ) : null}
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${
                  done
                    ? "bg-emerald-500 text-white"
                    : now
                      ? "bg-[color:var(--store-primary)] text-white"
                      : "bg-slate-100 text-slate-400"
                }`}
              >
                {done ? <Check size={14} strokeWidth={3} /> : index + 1}
              </span>
              <span
                className={`min-w-0 truncate text-[13px] ${
                  now ? "font-semibold text-slate-900" : "font-medium text-slate-500"
                }`}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    );
  }

  if (layout === "market") {
    return (
      <div className="mb-5 flex gap-4 overflow-x-auto border-b border-[color:var(--store-panel-border)] text-[13px] font-semibold">
        {labels.map((label, index) => (
          <span
            key={`${index}-${label}`}
            className={`relative shrink-0 pb-2 ${
              index <= activeIndex ? "text-[color:var(--store-fg)]" : "text-[color:var(--store-muted)]"
            }`}
          >
            {label}
            {index === activeIndex ? (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[color:var(--store-primary)] shadow-[0_0_10px_var(--store-primary)]" />
            ) : null}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="mb-6 flex items-center justify-between gap-1 overflow-x-auto pb-1 text-[10px] font-semibold uppercase tracking-wide sm:mb-8 sm:justify-center sm:gap-2 sm:text-xs">
      {labels.map((label, index) => (
        <div key={`${index}-${label}`} className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors duration-200 ${
              index <= activeIndex
                ? "border-[color:var(--store-primary)] bg-[color:var(--store-primary)] text-white"
                : "border-[color:var(--store-panel-border)] bg-[color:var(--store-panel)] text-[color:var(--store-muted)]"
            }`}
          >
            {index + 1}
          </div>
          <span className={index <= activeIndex ? "text-[color:var(--store-fg)]" : "text-[color:var(--store-muted)]"}>
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function PendingOrderCard({
  trackingCode,
  customerToken,
  onTrack,
  orderStatus,
  invoiceUrl,
}: {
  trackingCode: string;
  customerToken: string;
  orderStatus: string;
  invoiceUrl?: string | null;
  onCopy?: () => void;
  onTrack: () => void;
}) {
  const { t } = useStorefrontLocale();
  const [copied, setCopied] = useState<"token" | "tracking" | null>(null);

  const handleCopy = async (value: string, kind: "token" | "tracking") => {
    await copyToClipboard(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1800);
  };

  return (
    <motion.div
      {...fadeUp}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="mx-auto max-w-xl rounded-[2rem] border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-600">
        <LoaderCircle size={14} className="animate-spin" />
        {orderStatus.replaceAll("_", " ")}
      </div>
      <h2 className="text-2xl font-black">{t("سفارش ثبت شد", "Order Submitted")}</h2>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        {invoiceUrl
          ? t(
              "فاکتور Telegram Stars آماده است. پرداخت را کامل کنید؛ سرویس فقط بعد از تأیید سرور فعال می‌شود.",
              "Your Telegram Stars invoice is ready. Complete payment — delivery happens only after backend verification.",
            )
          : t(
              "در انتظار تأیید. معمولاً ظرف چند دقیقه بررسی می‌شود.",
              "Waiting for approval. Your order will usually be reviewed within a few minutes.",
            )}
      </p>
      {invoiceUrl ? (
        <button
          type="button"
          onClick={() => {
            const tg = window.Telegram?.WebApp as { openInvoice?: (u: string) => void } | undefined;
            if (tg?.openInvoice) tg.openInvoice(invoiceUrl);
            else window.open(invoiceUrl, "_blank", "noopener,noreferrer");
          }}
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-2xl bg-[color:var(--store-primary,#2563eb)] px-4 text-sm font-semibold text-white"
        >
          {t("پرداخت با استارز", "Pay with Stars")}
        </button>
      ) : null}

      <div className="mt-6 rounded-2xl border border-amber-500/15 bg-amber-500/5 p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
            <LoaderCircle size={18} className="animate-spin" />
          </div>
          <div>
            <div className="font-semibold text-amber-700 dark:text-amber-400">
              {t("در حال بررسی", "Review in progress")}
            </div>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {t(
                "لطفاً صبر کنید — ادمین به‌زودی پرداخت را بررسی می‌کند. این صفحه و داشبورد پس از تأیید به‌روز می‌شوند.",
                "Hang tight — an admin will check your payment shortly. This page and your dashboard update automatically once approved.",
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-950">
        <div className="text-xs uppercase tracking-wide text-zinc-500">
          {t("کد پیگیری", "Tracking Code")}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="min-w-0 flex-1 truncate font-mono text-lg font-bold">{trackingCode}</div>
          <CopyFeedbackButton
            copied={copied === "tracking"}
            onClick={() => handleCopy(trackingCode, "tracking")}
          />
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-[color:var(--store-primary)]/20 bg-[color:var(--store-primary)]/5 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--store-primary)]">
          <KeyRound size={16} /> {t("توکن ورود وب", "Web login token")}
        </div>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <code className="w-full break-all rounded-xl bg-white px-3 py-3 font-mono text-sm font-bold tracking-wide dark:bg-zinc-900 sm:flex-1">
            {customerToken}
          </code>
          <PrimaryButton
            className="w-full shrink-0 sm:w-auto sm:min-w-[7.5rem]"
            onClick={() => handleCopy(customerToken, "token")}
          >
            <span className="inline-flex items-center justify-center gap-2">
              {copied === "token" ? <Check size={16} /> : <Copy size={16} />}
              {copied === "token" ? t("کپی شد", "Copied") : t("کپی", "Copy")}
            </span>
          </PrimaryButton>
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          {t(
            "این کد فقط برای ورود از وب/پورتال است. در مینی‌اپ تلگرام لازم نیست.",
            "Only needed for web/portal login. Not required inside the Telegram Mini App.",
          )}
        </p>
      </div>

      <SecondaryButton className="mt-5" onClick={onTrack}>
        {t("پیگیری سفارش", "Track Order")}
      </SecondaryButton>
    </motion.div>
  );
}

export function ServiceCard({
  service,
  subLink,
  onCopy,
  onOpen,
  onRenew,
  onHide,
  hiding,
}: {
  service: CustomerService;
  /** Full subscription URL for QR / open / copy */
  subLink?: string | null;
  onCopy: () => void;
  onOpen: () => void;
  onRenew: () => void;
  onHide?: () => void;
  hiding?: boolean;
}) {
  const { t, isFa } = useStorefrontLocale();
  const isEylan = service.providerId === "eylan";
  const used = Number(service.up) + Number(service.down);
  const total = Number(service.total);
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const remaining = total > 0 ? Math.max(total - used, 0) : null;
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const qrValue = String(subLink || "").trim();
  // Belt-and-suspenders: id / deliveryHint even if older API omitted providerId.
  const treatAsEylan =
    isEylan ||
    service.deliveryHint === "eylan_download" ||
    String(service.id || "").startsWith("eylan:");

  const statusTone =
    service.status === "active" || service.status === "pending"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
      : service.status === "expired" || service.status === "depleted"
        ? "bg-rose-500/15 text-rose-700 dark:text-rose-400"
        : "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400";

  const statusLabel =
    service.status === "expired"
      ? t("منقضی", "Expired")
      : service.status === "depleted"
        ? t("حجم تمام", "Traffic ended")
        : service.status === "disabled"
          ? t("غیرفعال", "Disabled")
          : service.unused || service.status === "pending"
            ? t("آمادۀ اتصال", "Ready")
            : t("فعال", "Active");

  const barColor =
    pct >= 90 ? "bg-rose-500" : pct >= 75 ? "bg-amber-500" : "bg-emerald-500";

  const planLabelFa = (() => {
    if (!service.planLabel) return null;
    return service.planLabel
      .replace("Unlimited", "نامحدود")
      .replace("No expiry", "بدون انقضا")
      .replace(/(\d+)\s*days?/i, "$1 روز")
      .replace("1 month", "۱ ماهه");
  })();

  if (treatAsEylan) {
    return (
      <motion.div
        {...fadeUp}
        transition={{ duration: 0.35 }}
        className="overflow-hidden rounded-2xl border border-violet-200/80 bg-gradient-to-b from-violet-50/80 to-white shadow-[0_8px_30px_rgba(91,33,182,0.06)] dark:border-violet-900/50 dark:from-violet-950/40 dark:to-zinc-950"
      >
        <div className="flex items-start justify-between gap-3 border-b border-violet-100/80 px-5 py-4 dark:border-violet-900/40">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="truncate text-base font-semibold tracking-tight">
                {service.productName || service.remark || service.email}
              </span>
              <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700 dark:text-violet-300">
                Eylan
              </span>
            </div>
            <div className="mt-1 min-w-0 break-all font-mono text-xs text-zinc-500 [overflow-wrap:anywhere]" dir="ltr">
              {service.email}
            </div>
            {(isFa ? planLabelFa : service.planLabel) ? (
              <div className="mt-2 inline-flex rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold text-violet-800 ring-1 ring-violet-200 dark:bg-zinc-900 dark:text-violet-200 dark:ring-violet-800">
                {isFa ? planLabelFa : service.planLabel}
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusTone}`}>
              {statusLabel}
            </span>
            {onHide ? (
              <button
                type="button"
                disabled={hiding}
                onClick={onHide}
                className="rounded-lg px-2 py-1 text-[10px] font-semibold text-zinc-400 transition hover:bg-zinc-100 hover:text-rose-500 disabled:opacity-50 dark:hover:bg-zinc-800"
              >
                {t("حذف از لیست", "Hide")}
              </button>
            ) : null}
          </div>
        </div>

        <div className="space-y-3 px-5 py-4">
          <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            {t(
              "لینک ساب را باز کنید و فایل کانفیگ (OpenVPN / WireGuard و …) را دانلود کنید.",
              "Open the subscription link and download your OpenVPN / WireGuard config files.",
            )}
          </p>
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                {t("ترافیک", "Traffic")}
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums">
                {formatBytes(used)}
                <span className="ms-1 text-sm font-normal text-zinc-400">
                  / {total > 0 ? formatBytes(total) : t("نامحدود", "Unlimited")}
                </span>
              </div>
            </div>
            <div className="text-end text-xs text-zinc-500">
              {t("انقضا", "Expires")}: {formatExpiry(service.expiryTime)}
            </div>
          </div>
          {total > 0 ? (
            <div className="h-1.5 overflow-hidden rounded-full bg-violet-100 dark:bg-violet-950">
              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
            </div>
          ) : null}
          {qrValue ? (
            <code className="block break-all rounded-xl bg-white/90 px-3 py-2 font-mono text-[11px] text-zinc-600 ring-1 ring-violet-100 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-violet-900" dir="ltr">
              {qrValue}
            </code>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 border-t border-violet-100/80 px-5 py-4 dark:border-violet-900/40">
          <PrimaryButton onClick={onOpen} disabled={!qrValue}>
            {t("📥 باز کردن لینک ساب / دانلود", "📥 Open sub & download")}
          </PrimaryButton>
          <div className="grid grid-cols-3 gap-2">
            <SecondaryButton
              onClick={() => qrValue && setShowQr(true)}
              disabled={!qrValue}
            >
              <span className="inline-flex items-center justify-center gap-1">
                <QrCode size={14} />
                QR
              </span>
            </SecondaryButton>
            <SecondaryButton
              onClick={async () => {
                onCopy();
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1600);
              }}
              disabled={!qrValue}
            >
              {copied ? t("کپی شد", "Copied") : t("کپی لینک", "Copy")}
            </SecondaryButton>
            <SecondaryButton onClick={onRenew}>{t("تمدید", "Renew")}</SecondaryButton>
          </div>
        </div>

        {showQr && qrValue && typeof document !== "undefined"
          ? createPortal(
              <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4">
                <button
                  type="button"
                  className="absolute inset-0 cursor-pointer"
                  aria-label={t("بستن", "Close")}
                  onClick={() => setShowQr(false)}
                />
                <div className="relative z-10 w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl dark:bg-zinc-950">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-base font-bold">{t("QR لینک ساب", "Subscription QR")}</div>
                      <div className="mt-0.5 truncate text-xs text-zinc-500">
                        {service.productName || service.email}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowQr(false)}
                      className="rounded-xl border border-zinc-200 p-2 dark:border-zinc-700"
                      aria-label={t("بستن", "Close")}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="mx-auto flex w-fit rounded-2xl bg-white p-3 ring-1 ring-zinc-200">
                    <QRCode value={qrValue} size={200} />
                  </div>
                  <p className="mt-3 break-all text-center font-mono text-[11px] text-zinc-500" dir="ltr">
                    {qrValue}
                  </p>
                </div>
              </div>,
              document.body,
            )
          : null}
      </motion.div>
    );
  }

  return (
    <motion.div
      {...fadeUp}
      transition={{ duration: 0.35 }}
      className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)] dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate text-base font-semibold tracking-tight">
              {service.remark || service.email}
            </span>
          </div>
          <div className="mt-1 text-xs text-zinc-400">
            {t("انقضا", "Expires")}: {formatExpiry(service.expiryTime)}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusTone}`}>
            {statusLabel}
          </span>
          {onHide ? (
            <button
              type="button"
              disabled={hiding}
              onClick={onHide}
              className="rounded-lg px-2 py-1 text-[10px] font-semibold text-zinc-400 transition hover:bg-zinc-100 hover:text-rose-500 disabled:opacity-50 dark:hover:bg-zinc-800"
              title={t("حذف از لیست", "Remove from list")}
            >
              {t("حذف از لیست", "Hide")}
            </button>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 px-5 py-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
              {t("ترافیک", "Traffic")}
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums">
              {formatBytes(used)}
              <span className="ms-1 text-sm font-normal text-zinc-400">
                / {total > 0 ? formatBytes(total) : t("نامحدود", "Unlimited")}
              </span>
            </div>
          </div>
          <div className="text-end text-xs text-zinc-500">
            <div>
              {t("باقیمانده", "Left")}:{" "}
              <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                {remaining == null ? t("نامحدود", "Unlimited") : formatBytes(remaining)}
              </span>
            </div>
          </div>
        </div>
        {total > 0 ? (
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-zinc-100 px-5 py-4 sm:grid-cols-4 dark:border-zinc-800">
        <SecondaryButton
          onClick={() => qrValue && setShowQr(true)}
          disabled={!qrValue}
        >
          <span className="inline-flex items-center justify-center gap-1.5">
            <QrCode size={14} />
            {t("QR کد", "QR code")}
          </span>
        </SecondaryButton>
        <SecondaryButton
          onClick={async () => {
            onCopy();
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          }}
        >
          {copied ? t("کپی شد", "Copied") : t("کپی لینک", "Copy link")}
        </SecondaryButton>
        <SecondaryButton onClick={onOpen}>{t("باز کردن ساب", "Open sub")}</SecondaryButton>
        <PrimaryButton onClick={onRenew}>{t("تمدید", "Renew")}</PrimaryButton>
      </div>

      {showQr && qrValue && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4">
              <button
                type="button"
                className="absolute inset-0 cursor-pointer"
                aria-label={t("بستن", "Close")}
                onClick={() => setShowQr(false)}
              />
              <div className="relative z-10 w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl dark:bg-zinc-950">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-base font-bold">{t("QR سابسکریپشن", "Subscription QR")}</div>
                    <div className="mt-0.5 truncate text-xs text-zinc-500">
                      {service.remark || service.email}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowQr(false)}
                    className="rounded-xl border border-zinc-200 p-2 dark:border-zinc-700"
                    aria-label={t("بستن", "Close")}
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="mx-auto flex w-fit rounded-2xl bg-white p-3 ring-1 ring-zinc-200">
                  <QRCode value={qrValue} size={200} />
                </div>
                <p className="mt-3 break-all text-center font-mono text-[11px] text-zinc-500" dir="ltr">
                  {qrValue}
                </p>
              </div>
            </div>,
            document.body,
          )
        : null}
    </motion.div>
  );
}

export function OrderCard({
  order,
  onTrack,
  onCancel,
  cancelling,
}: {
  order: CustomerOrder;
  onTrack?: () => void;
  onCancel?: () => void;
  cancelling?: boolean;
}) {
  const { t, formatToman, formatUsd } = useStorefrontLocale();
  const canCancel = ["PENDING_PAYMENT", "PAYMENT_SUBMITTED", "UNDER_REVIEW"].includes(order.status);
  const tone =
    order.status === "ACTIVE" || order.status === "RENEWED"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : order.status === "PROVISION_FAILED" || order.status === "REJECTED" || order.status === "CANCELLED"
        ? "bg-red-500/10 text-red-700 dark:text-red-400"
        : order.status === "PROVISIONING" || order.status === "APPROVED"
          ? "bg-violet-500/10 text-violet-700 dark:text-violet-400"
          : "bg-amber-500/10 text-amber-700 dark:text-amber-400";

  const label = order.status.replaceAll("_", " ");
  const cur = String(order.currency || "").toUpperCase();
  const isToman = ["TOMAN", "IRT", "IRR", "TMN"].includes(cur);
  const amount = isToman ? formatToman(order.amount) : formatUsd(order.amount);

  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-zinc-200/90 bg-white p-4 transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold tracking-tight">{order.productName}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span>{formatDate(order.createdAt)}</span>
            <span>·</span>
            <span>{order.isRenewal ? t("تمدید", "Renewal") : t("جدید", "New")}</span>
            <span>·</span>
            <span className="font-medium text-zinc-700 dark:text-zinc-300">{amount}</span>
          </div>
          <div className="mt-2 break-all font-mono text-xs text-zinc-400 [overflow-wrap:anywhere]">
            {order.trackingCode}
          </div>
        </div>
        <div className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${tone}`}>
          {label}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {onTrack ? (
          <button
            type="button"
            onClick={onTrack}
            className="text-sm font-medium text-[color:var(--store-primary)] hover:underline"
          >
            {t("پیگیری سفارش", "Track order")} →
          </button>
        ) : null}
        {canCancel && onCancel ? (
          <button
            type="button"
            disabled={cancelling}
            onClick={() => {
              if (window.confirm(t("این سفارش لغو شود؟", "Cancel this order?"))) onCancel();
            }}
            className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
          >
            {cancelling ? t("در حال لغو…", "Cancelling…") : t("لغو سفارش", "Cancel order")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function NotificationCard({
  notification,
  onRead,
  onOpen,
}: {
  notification: CustomerNotification;
  onRead?: () => void;
  onOpen?: () => void;
}) {
  const payload = (notification.payload ?? {}) as Record<string, unknown>;
  const trackingCode = typeof payload.trackingCode === "string" ? payload.trackingCode : null;
  const status = typeof payload.status === "string" ? payload.status : null;
  const unread = !notification.isRead;

  const tone =
    notification.type.includes("ready") || notification.type === "subscription_updated"
      ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/20"
      : notification.type.includes("reject") || notification.type.includes("issue") || notification.type.includes("fail")
        ? "border-red-200 bg-red-50/70 dark:border-red-900 dark:bg-red-950/20"
        : unread
          ? "border-[color:var(--store-primary)]/25 bg-[color:var(--store-primary)]/5"
          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900";

  return (
    <button
      type="button"
      onClick={() => {
        onRead?.();
        onOpen?.();
      }}
      className={`w-full rounded-2xl border p-4 text-left transition hover:opacity-95 ${tone}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {unread ? <span className="h-2 w-2 rounded-full bg-[color:var(--store-primary)]" /> : null}
            <div className="font-semibold">{notification.title}</div>
          </div>
          {notification.message ? (
            <p className="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">{notification.message}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            <span>{formatDate(notification.createdAt)}</span>
            {trackingCode ? <span className="font-mono">· {trackingCode}</span> : null}
            {status ? <span className="uppercase">· {status.replaceAll("_", " ")}</span> : null}
          </div>
        </div>
        {trackingCode ? (
          <span className="shrink-0 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-[color:var(--store-primary)] dark:bg-zinc-950/60">
            Track
          </span>
        ) : null}
      </div>
    </button>
  );
}

export async function copyTextWithState(
  text: string,
  onCopied: () => void,
  onError?: () => void,
) {
  try {
    await copyToClipboard(text);
    onCopied();
  } catch {
    onError?.();
  }
}

function CopyFeedbackButton({
  copied,
  onClick,
}: {
  copied: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 transition hover:bg-zinc-50 active:scale-95 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
      aria-label="Copy"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={copied ? "check" : "copy"}
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.7, opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
