"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  Copy,
  KeyRound,
  LoaderCircle,
  MessageCircle,
  Phone,
  ShieldCheck,
  Globe,
  Mail,
} from "lucide-react";
import { formatBytes, formatDate, formatExpiry } from "@/lib/format";
import { copyToClipboard } from "@/lib/clipboard";
import {
  resolveThemeLogo,
} from "@/modules/shared/brand-logo";
import { LanguageSwitcher, StorefrontLocaleProvider, useStorefrontLocale } from "./locale";
import { StorefrontThemeToggle, useStorefrontTheme, fadeUp, fadeUpTransition } from "./design";
import type {
  CustomerNotification,
  CustomerOrder,
  CustomerService,
  StorefrontProduct,
  StorefrontStore,
} from "./types";

function useIsDarkSurface() {
  const { isDark } = useStorefrontTheme();
  return isDark;
}

export function StoreShell({
  store,
  children,
  topBar,
}: {
  store?: StorefrontStore;
  children: React.ReactNode;
  topBar?: React.ReactNode;
}) {
  const primaryColor = store?.branding?.primaryColor || "#3b82f6";

  return (
    <StorefrontLocaleProvider store={store}>
      <StoreShellInner store={store} primaryColor={primaryColor} topBar={topBar}>
        {children}
      </StoreShellInner>
    </StorefrontLocaleProvider>
  );
}

function StoreShellInner({
  store,
  primaryColor,
  topBar,
  children,
}: {
  store?: StorefrontStore;
  primaryColor: string;
  topBar?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { isFa } = useStorefrontLocale();
  useStorefrontTheme();
  const isDark = useIsDarkSurface();
  const logo =
    resolveThemeLogo({
      logoLight: store?.logoUrl || store?.branding?.logo,
      logoDark: store?.logoDarkUrl || store?.branding?.logoDark,
      preferDark: isDark,
    }) || null;
  const title = store?.branding?.name || store?.title || "Store";

  return (
    <div
      className={`min-h-[100dvh] bg-[#F5F5F7] text-[#1D1D1F] dark:bg-[#0B0B0F] dark:text-zinc-50 ${
        isFa ? "font-[Vazirmatn,Tahoma,sans-serif]" : "font-[ui-sans-serif,system-ui,sans-serif]"
      }`}
      style={{
        ["--store-primary" as string]: primaryColor,
        ...(isFa ? { fontFamily: '"Vazirmatn", Tahoma, sans-serif' } : null),
      }}
    >
      {/* Soft brand wash */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-72 opacity-90"
        style={{
          background: `radial-gradient(ellipse 90% 70% at 50% -20%, color-mix(in srgb, ${primaryColor} 28%, transparent), transparent 70%)`,
        }}
      />

      <header className="sticky top-0 z-40 px-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))] sm:px-4">
        <div className="mx-auto flex max-w-5xl items-center gap-3 rounded-[1.5rem] border border-black/[0.05] bg-white/80 px-3 py-2.5 shadow-[0_8px_30px_-18px_rgba(15,23,42,0.35)] backdrop-blur-2xl dark:border-white/[0.08] dark:bg-zinc-950/75 lg:px-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="h-11 w-11 shrink-0 rounded-[1.05rem] object-cover shadow-sm" />
            ) : (
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[1.05rem] text-base font-black text-white shadow-sm"
                style={{ background: primaryColor }}
              >
                {title.slice(0, 1)}
              </div>
            )}
            <div className="min-w-0">
              <div className="truncate text-[16px] font-bold leading-tight tracking-tight">{title}</div>
              {topBar ? <div className="mt-0.5 truncate text-[12px] text-zinc-500">{topBar}</div> : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <StorefrontThemeToggle />
            <LanguageSwitcher className="!shadow-none !h-11 !rounded-2xl" />
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-5xl px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 lg:px-8 lg:pb-16 lg:pt-6">
        {children}
      </main>
    </div>
  );
}

export function WelcomeHero({
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
  const preferDark = useIsDarkSurface();
  const { t, isFa } = useStorefrontLocale();
  const logo = resolveThemeLogo({
    logoLight: store?.logoUrl || store?.branding?.logo,
    logoDark: store?.logoDarkUrl || store?.branding?.logoDark,
    preferDark,
  });

  return (
    <motion.section
      {...fadeUp}
      transition={fadeUpTransition}
      className="mx-auto flex max-w-2xl flex-col items-center py-6 text-center sm:py-10"
    >
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt={store?.title || store?.branding?.name || "Store logo"}
          className="mb-5 h-[4.5rem] w-auto max-w-[9rem] object-contain drop-shadow-sm sm:h-24 sm:max-w-[11rem]"
        />
      ) : (
        <div className="mb-5 flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-[1.5rem] bg-[color:var(--store-primary)] text-white shadow-[0_16px_40px_-18px_var(--store-primary)] sm:h-24 sm:w-24">
          <ShieldCheck size={36} />
        </div>
      )}
      <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
        {t("فروشگاه", "Store")}
      </p>
      <h1 className="mt-2 text-[2rem] font-black tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-[2.75rem]">
        {store?.title || store?.branding?.name || "VPN Store"}
      </h1>
      {store?.description ? (
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-zinc-500 sm:text-base">
          {store.description}
        </p>
      ) : null}
      <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
        <PrimaryButton onClick={onBuy}>{t("سفارش جدید", "New Order")}</PrimaryButton>
        <SecondaryButton onClick={onLogin}>{t("ورود", "Login")}</SecondaryButton>
      </div>
      {onTrack ? (
        <button
          type="button"
          onClick={onTrack}
          className="mt-5 cursor-pointer text-[14px] font-semibold text-[color:var(--store-primary)]"
        >
          {isFa ? "پیگیری سفارش" : "Track an order"}
        </button>
      ) : null}
      <SupportFooter supportLinks={store?.branding?.supportLinks} />
    </motion.section>
  );
}

export function ProductCard({
  product,
  onSelect,
  selected = false,
}: {
  product: StorefrontProduct;
  onSelect: () => void;
  selected?: boolean;
}) {
  const { formatToman, t } = useStorefrontLocale();
  const hasUsd = Number(product.priceUsd) > 0;
  const hasToman = Number(product.priceToman) > 0;

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: "spring", stiffness: 320, damping: 24 }}
      className={`relative w-full cursor-pointer rounded-[1.75rem] border bg-white p-5 text-start shadow-[0_8px_30px_-18px_rgba(15,23,42,0.28)] transition dark:bg-zinc-900 sm:p-5 ${
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
        {selected ? (
          <span className="ms-auto inline-flex rounded-full bg-[color:var(--store-primary)] px-2.5 py-1 text-[11px] font-bold text-white">
            {t("انتخاب شد", "Selected")}
          </span>
        ) : null}
      </div>
      <div className="text-lg font-bold">{product.name}</div>
      {product.description ? (
        <p className="mt-2 min-h-10 text-sm text-zinc-500 dark:text-zinc-400">
          {product.description}
        </p>
      ) : null}
      <div className="mt-5 space-y-1">
        {hasToman ? (
          <div className="text-2xl font-black text-[color:var(--store-primary)]">
            {formatToman(product.priceToman)}
          </div>
        ) : null}
        {hasUsd ? (
          <div
            className={
              hasToman
                ? "text-sm font-semibold text-zinc-500"
                : "text-2xl font-black text-[color:var(--store-primary)]"
            }
          >
            ${Number(product.priceUsd).toLocaleString()}
          </div>
        ) : null}
        {!hasUsd && !hasToman ? (
          <div className="text-lg font-bold text-zinc-400">{t("تماس برای قیمت", "Contact for price")}</div>
        ) : null}
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

export function Stepper({ step }: { step: number }) {
  const { t } = useStorefrontLocale();
  const labels = [
    t("پلن", "Plan"),
    t("کانفیگ", "Config"),
    t("پروفایل", "Profile"),
    t("پرداخت", "Payment"),
    t("تأیید", "Confirm"),
  ];
  return (
    <div className="mb-6 flex items-center justify-between gap-1 overflow-x-auto pb-1 text-[10px] font-semibold uppercase tracking-wide sm:mb-8 sm:justify-center sm:gap-2 sm:text-xs">
      {labels.map((label, index) => (
        <div key={label} className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors sm:h-8 sm:w-8 ${
              index + 1 <= step
                ? "border-[color:var(--store-primary)] bg-[color:var(--store-primary)] text-white"
                : "border-zinc-200 bg-white text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900"
            }`}
          >
            {index + 1}
          </div>
          <span className={index + 1 <= step ? "text-zinc-800 dark:text-zinc-200" : "text-zinc-400"}>
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
}: {
  trackingCode: string;
  customerToken: string;
  orderStatus: string;
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
        {t(
          "در انتظار تأیید. معمولاً ظرف چند دقیقه بررسی می‌شود.",
          "Waiting for approval. Your order will usually be reviewed within a few minutes.",
        )}
      </p>

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
  onCopy,
  onOpen,
  onRenew,
}: {
  service: CustomerService;
  onCopy: () => void;
  onOpen: () => void;
  onRenew: () => void;
}) {
  const { t } = useStorefrontLocale();
  const used = Number(service.up) + Number(service.down);
  const total = Number(service.total);
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const remaining = total > 0 ? Math.max(total - used, 0) : null;
  const [copied, setCopied] = useState(false);

  const statusTone =
    service.status === "active" || service.status === "pending"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
      : service.status === "expired"
        ? "bg-rose-500/15 text-rose-700 dark:text-rose-400"
        : "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400";

  const statusLabel =
    service.status === "expired"
      ? t("منقضی", "Expired")
      : service.status === "disabled"
        ? t("غیرفعال", "Disabled")
        : service.unused || service.status === "pending"
          ? t("آمادۀ اتصال", "Ready")
          : t("فعال", "Active");

  const barColor =
    pct >= 90 ? "bg-rose-500" : pct >= 75 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <motion.div
      {...fadeUp}
      transition={{ duration: 0.35 }}
      className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)] dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold tracking-tight">
            {service.remark || service.email}
          </div>
          <div className="mt-1 text-xs text-zinc-400">
            {t("انقضا", "Expires")}: {formatExpiry(service.expiryTime)}
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusTone}`}>
          {statusLabel}
        </span>
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

      <div className="grid gap-2 border-t border-zinc-100 px-5 py-4 sm:grid-cols-3 dark:border-zinc-800">
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
  const { t, formatToman } = useStorefrontLocale();
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
  const amount = isToman
    ? formatToman(order.amount)
    : cur === "USD"
      ? `$${order.amount}`
      : `${order.amount} ${order.currency}`;

  return (
    <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700">
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
          <div className="mt-2 font-mono text-xs text-zinc-400">{order.trackingCode}</div>
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

type SupportLinks = {
  showTelegram?: boolean | string;
  telegramLink?: string;
  showWhatsApp?: boolean | string;
  whatsappLink?: string;
  showWebsite?: boolean | string;
  websiteUrl?: string;
  showEmail?: boolean | string;
  emailAddress?: string;
} | null | undefined;

function SupportFooter({ supportLinks }: { supportLinks?: SupportLinks }) {
  const links = normalizeSupportLinks(supportLinks);
  if (!links.length) return null;

  return (
    <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
        >
          <link.icon size={15} />
          {link.label}
        </a>
      ))}
    </div>
  );
}

function normalizeSupportLinks(supportLinks: SupportLinks) {
  const data = supportLinks || {};
  const isOn = (value: unknown) => value === true || value === "true" || value === 1;

  const items: Array<{
    label: string;
    href: string;
    icon: typeof MessageCircle;
  }> = [];

  if (isOn(data.showTelegram) && data.telegramLink) {
    items.push({ label: "Telegram", href: data.telegramLink, icon: MessageCircle });
  }
  if (isOn(data.showWhatsApp) && data.whatsappLink) {
    items.push({ label: "WhatsApp", href: data.whatsappLink, icon: Phone });
  }
  if (isOn(data.showWebsite) && data.websiteUrl) {
    items.push({ label: "Website", href: data.websiteUrl, icon: Globe });
  }
  if (isOn(data.showEmail) && data.emailAddress) {
    items.push({
      label: "Email",
      href: data.emailAddress.startsWith("mailto:")
        ? data.emailAddress
        : `mailto:${data.emailAddress}`,
      icon: Mail,
    });
  }

  return items;
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

export function PrimaryButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex h-12 min-h-[48px] w-full cursor-pointer items-center justify-center rounded-2xl bg-[color:var(--store-primary)] px-5 text-[15px] font-semibold text-white shadow-[0_12px_28px_-14px_var(--store-primary)] transition duration-200 hover:opacity-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex h-12 min-h-[48px] w-full cursor-pointer items-center justify-center rounded-2xl border border-black/[0.06] bg-white px-5 text-[15px] font-semibold text-zinc-900 transition duration-200 active:scale-[0.98] dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100 ${className}`}
    >
      {children}
    </button>
  );
}
