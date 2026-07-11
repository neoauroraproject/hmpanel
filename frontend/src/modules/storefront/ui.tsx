"use client";

import { useEffect, useState } from "react";
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
  ensureVazirFont,
  isPersianStorefront,
  resolveThemeLogo,
} from "@/modules/shared/brand-logo";
import type {
  CustomerNotification,
  CustomerOrder,
  CustomerService,
  StorefrontProduct,
  StorefrontStore,
} from "./types";

const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

function useIsDarkSurface() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const sync = () => {
      const root = document.documentElement;
      const byClass = root.classList.contains("dark");
      const byMedia = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setDark(byClass || (!root.classList.contains("light") && byMedia));
    };
    sync();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", sync);
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      mq.removeEventListener("change", sync);
      observer.disconnect();
    };
  }, []);

  return dark;
}

export function StoreShell({
  store,
  children,
}: {
  store?: StorefrontStore;
  children: React.ReactNode;
}) {
  const primaryColor = store?.branding?.primaryColor || "#3b82f6";
  const persian = isPersianStorefront(store);

  useEffect(() => {
    if (!persian) return;
    ensureVazirFont();
    document.documentElement.lang = "fa";
    document.documentElement.dir = "rtl";
    return () => {
      document.documentElement.dir = "ltr";
      document.documentElement.lang = "en";
    };
  }, [persian]);

  return (
    <div
      className={`min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.08),_transparent_42%),linear-gradient(180deg,#fafafa_0%,#f4f4f5_100%)] text-zinc-950 dark:bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_40%),linear-gradient(180deg,#09090b_0%,#0a0a0c_100%)] dark:text-zinc-100 ${
        persian ? "font-[Vazirmatn,Tahoma,sans-serif]" : ""
      }`}
      style={{
        ["--store-primary" as string]: primaryColor,
        ...(persian ? { fontFamily: '"Vazirmatn", Tahoma, sans-serif' } : null),
      }}
    >
      {children}
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
  const persian = isPersianStorefront(store);
  const logo = resolveThemeLogo({
    logoLight: store?.logoUrl || store?.branding?.logo,
    logoDark: store?.logoDarkUrl || store?.branding?.logoDark,
    theme: store?.branding?.theme,
    preferDark,
  });

  return (
    <motion.section
      {...fadeUp}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="mx-auto flex max-w-3xl flex-col items-center px-4 py-16 text-center sm:py-24"
    >
      {logo ? (
        <img
          src={logo}
          alt={store?.title || store?.branding?.name || "Store logo"}
          className="mb-6 h-24 w-auto max-w-[12rem] object-contain"
        />
      ) : (
        <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-[1.75rem] bg-[color:var(--store-primary)]/10 text-[color:var(--store-primary)]">
          <ShieldCheck size={40} />
        </div>
      )}
      <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
        {store?.title || store?.branding?.name || "VPN Store"}
      </h1>
      {store?.description ? (
        <p className="mt-4 max-w-xl text-sm text-zinc-600 dark:text-zinc-400 sm:text-base">
          {store.description}
        </p>
      ) : null}
      <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
        <PrimaryButton onClick={onBuy}>{persian ? "سفارش جدید" : "New Order"}</PrimaryButton>
        <SecondaryButton onClick={onLogin}>{persian ? "ورود" : "Login"}</SecondaryButton>
      </div>
      {onTrack ? (
        <button
          type="button"
          onClick={onTrack}
          className="mt-4 text-sm font-semibold text-[color:var(--store-primary)] hover:underline"
        >
          {persian ? "پیگیری سفارش ←" : "Track an order →"}
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
  const hasUsd = Number(product.priceUsd) > 0;
  const hasToman = Number(product.priceToman) > 0;

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: "spring", stiffness: 320, damping: 24 }}
      className={`relative rounded-3xl border bg-white p-5 text-left shadow-sm transition dark:bg-zinc-900 ${
        selected
          ? "border-[color:var(--store-primary)] ring-2 ring-[color:var(--store-primary)]/20"
          : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800"
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {product.featured ? (
          <span className="inline-flex rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            Featured
          </span>
        ) : null}
        {product.badge ? (
          <span className="inline-flex rounded-full bg-[color:var(--store-primary)]/10 px-2.5 py-1 text-xs font-semibold text-[color:var(--store-primary)]">
            {product.badge}
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
            {Number(product.priceToman).toLocaleString()}{" "}
            <span className="text-base font-bold">تومان</span>
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
          <div className="text-lg font-bold text-zinc-400">Contact for price</div>
        ) : null}
      </div>
      <div className="mt-4 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
        <div className="flex justify-between">
          <span>Traffic</span>
          <span>{formatBytes(product.traffic)}</span>
        </div>
        <div className="flex justify-between">
          <span>Duration</span>
          <span>{product.durationDays} days</span>
        </div>
      </div>
    </motion.button>
  );
}

export function Stepper({ step }: { step: number }) {
  const labels = ["Plan", "Profile", "Payment", "Pending"];
  return (
    <div className="mb-6 flex flex-wrap items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wide">
      {labels.map((label, index) => (
        <div key={label} className="flex items-center gap-2">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
              index <= step
                ? "border-[color:var(--store-primary)] bg-[color:var(--store-primary)] text-white"
                : "border-zinc-200 bg-white text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900"
            }`}
          >
            {index + 1}
          </div>
          <span className={index <= step ? "text-zinc-800 dark:text-zinc-200" : "text-zinc-400"}>
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
      <h2 className="text-2xl font-black">Order Submitted</h2>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        Waiting for approval. Your order will usually be reviewed within a few minutes.
      </p>

      <div className="mt-6 rounded-2xl border border-amber-500/15 bg-amber-500/5 p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
            <LoaderCircle size={18} className="animate-spin" />
          </div>
          <div>
            <div className="font-semibold text-amber-700 dark:text-amber-400">Review in progress</div>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Hang tight — an admin will check your payment shortly. This page and your dashboard update automatically once approved.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-950">
        <div className="text-xs uppercase tracking-wide text-zinc-500">Tracking Code</div>
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
          <KeyRound size={16} /> Customer Token
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
              {copied === "token" ? "Copied" : "Copy"}
            </span>
          </PrimaryButton>
        </div>
        <p className="mt-3 text-xs text-zinc-500">Save this token. It is required for future access.</p>
      </div>

      <SecondaryButton className="mt-5" onClick={onTrack}>
        Track Order
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
  const used = Number(service.up) + Number(service.down);
  const total = Number(service.total);
  const [copied, setCopied] = useState(false);

  return (
    <motion.div
      {...fadeUp}
      transition={{ duration: 0.35 }}
      className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-lg font-bold">{service.remark || service.email}</div>
          <div className="mt-1 text-sm text-zinc-500">{service.status.toUpperCase()}</div>
        </div>
        <div className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {formatExpiry(service.expiryTime)}
        </div>
      </div>
      <div className="mt-4 grid gap-2 text-sm text-zinc-600 dark:text-zinc-400">
        <div className="flex justify-between">
          <span>Used</span>
          <span>{formatBytes(used)}</span>
        </div>
        <div className="flex justify-between">
          <span>Remaining</span>
          <span>{total > 0 ? formatBytes(Math.max(total - used, 0)) : "Unlimited"}</span>
        </div>
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        <SecondaryButton
          onClick={async () => {
            onCopy();
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </SecondaryButton>
        <SecondaryButton onClick={onOpen}>Subscription</SecondaryButton>
        <PrimaryButton onClick={onRenew}>Renew</PrimaryButton>
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
  const canCancel = ["PENDING_PAYMENT", "PAYMENT_SUBMITTED", "UNDER_REVIEW"].includes(order.status);
  const tone =
    order.status === "ACTIVE" || order.status === "RENEWED"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : order.status === "PROVISION_FAILED" || order.status === "REJECTED" || order.status === "CANCELLED"
        ? "bg-red-500/10 text-red-700 dark:text-red-400"
        : order.status === "PROVISIONING" || order.status === "APPROVED"
          ? "bg-purple-500/10 text-purple-700 dark:text-purple-400"
          : "bg-amber-500/10 text-amber-700 dark:text-amber-400";

  const label = order.status.replaceAll("_", " ");
  const amount =
    order.currency === "USD" ? `$${order.amount}` : `${order.amount} ${order.currency}`;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold">{order.productName}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span>{formatDate(order.createdAt)}</span>
            <span>·</span>
            <span>{order.isRenewal ? "Renewal" : "New"}</span>
            <span>·</span>
            <span className="font-medium text-zinc-700 dark:text-zinc-300">{amount}</span>
          </div>
          <div className="mt-2 font-mono text-xs text-zinc-500">{order.trackingCode}</div>
        </div>
        <div className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase ${tone}`}>
          {label}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {onTrack ? (
          <button
            type="button"
            onClick={onTrack}
            className="text-sm font-semibold text-[color:var(--store-primary)] hover:underline"
          >
            Track order →
          </button>
        ) : null}
        {canCancel && onCancel ? (
          <button
            type="button"
            disabled={cancelling}
            onClick={() => {
              if (window.confirm("Cancel this order?")) onCancel();
            }}
            className="text-sm font-semibold text-red-600 hover:underline disabled:opacity-50"
          >
            {cancelling ? "Cancelling..." : "Cancel order"}
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
      className={`w-full rounded-2xl bg-[color:var(--store-primary)] px-5 py-3.5 font-semibold text-white shadow-[0_10px_24px_-16px_var(--store-primary)] transition hover:opacity-95 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
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
      className={`w-full rounded-2xl border border-zinc-200 bg-white px-5 py-3.5 font-semibold text-zinc-900 transition hover:border-zinc-300 active:scale-[0.985] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 ${className}`}
    >
      {children}
    </button>
  );
}
