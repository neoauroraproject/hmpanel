"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowUpRight,
  Copy,
  ExternalLink,
  LoaderCircle,
  MessageCircle,
  Package,
  Plus,
  QrCode,
  RefreshCw,
  ShoppingBag,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { QRCodeCanvas } from "qrcode.react";
import { copyToClipboard } from "@/lib/clipboard";
import { buildSubscriptionLink } from "../subscription";
import { resolveThemeLogo } from "@/modules/shared/brand-logo";
import type { CustomerOrder, CustomerService, StorefrontProduct } from "../types";
import { TmaBottomNav, type TmaTab } from "./TmaBottomNav";
import { TmaCheckoutSheet } from "./TmaCheckoutSheet";
import { TmaLinkSubSheet } from "./TmaLinkSubSheet";
import { TmaHomeTab } from "./TmaHomeTab";
import { TmaAlertsTab } from "./TmaAlertsTab";
import { useTelegramSession } from "./useTelegramSession";
import { isTelegramMobilePlatform, useTelegramWebApp } from "./useTelegramWebApp";
import { scrollTmaToTop } from "./scroll";
import { LanguageSwitcher, StorefrontLocaleProvider, useStorefrontLocale } from "../locale";
import { API_BASE } from "@/lib/api";
import { getConnectionRenderer } from "@/components/connection/RendererRegistry";
import type { ClientOutputModel } from "@/components/connection/types";
import { formatServiceExpiry, isExpiringSoon } from "./tma-service-utils";

/** Soft white/blue surfaces for light; Telegram-native for dark. Layout stays Karta-like. */
function cssVars(
  theme: Record<string, string | undefined>,
  primary?: string | null,
  preferDark?: boolean,
) {
  const accent = primary || theme.button_color || "#2563eb";
  if (preferDark) {
    return {
      ["--tma-bg" as string]: theme.bg_color || "#0f172a",
      ["--tma-text" as string]: theme.text_color || "#f8fafc",
      ["--tma-hint" as string]: theme.hint_color || "#94a3b8",
      ["--tma-link" as string]: theme.link_color || "#60a5fa",
      ["--tma-button" as string]: accent,
      ["--tma-button-text" as string]: theme.button_text_color || "#ffffff",
      ["--tma-secondary-bg" as string]: theme.secondary_bg_color || "#1e293b",
      ["--tma-card" as string]: "color-mix(in srgb, #ffffff 8%, transparent)",
      ["--tma-card-border" as string]: "color-mix(in srgb, #ffffff 12%, transparent)",
    } as CSSProperties;
  }
  return {
    ["--tma-bg" as string]: "#F3F6FB",
    ["--tma-text" as string]: "#0f172a",
    ["--tma-hint" as string]: "#64748b",
    ["--tma-link" as string]: accent,
    ["--tma-button" as string]: accent,
    ["--tma-button-text" as string]: "#ffffff",
    ["--tma-secondary-bg" as string]: "#ffffff",
    ["--tma-card" as string]: "#ffffff",
    ["--tma-card-border" as string]: "color-mix(in srgb, #2563eb 10%, #e2e8f0)",
  } as CSSProperties;
}

function gb(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return 0;
  return Math.round((bytes / 1e9) * 10) / 10;
}

function trafficLeft(service: CustomerService) {
  const total = Number(service.total);
  if (!(total > 0)) return null;
  const used = Number(service.up) + Number(service.down);
  return Math.max(total - used, 0);
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3 px-0.5">
      <h2 className="text-[22px] font-bold tracking-tight">{title}</h2>
      {subtitle ? (
        <p className="mt-0.5 text-[13px]" style={{ color: "var(--tma-hint)" }}>
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

function SoftSurface({
  children,
  className = "",
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`rounded-[1.35rem] border text-left transition active:scale-[0.985] ${className}`}
        style={{
          background: "var(--tma-card)",
          borderColor: "var(--tma-card-border)",
          boxShadow: "0 1px 0 color-mix(in srgb, #2563eb 6%, transparent)",
          color: "inherit",
        }}
      >
        {children}
      </button>
    );
  }
  return (
    <div
      className={`rounded-[1.35rem] border text-left ${className}`}
      style={{
        background: "var(--tma-card)",
        borderColor: "var(--tma-card-border)",
        boxShadow: "0 1px 0 color-mix(in srgb, #2563eb 6%, transparent)",
        color: "inherit",
      }}
    >
      {children}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  hint,
}: {
  icon: typeof Package;
  title: string;
  hint: string;
}) {
  return (
    <SoftSurface className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div
        className="mb-1 flex h-12 w-12 items-center justify-center rounded-2xl"
        style={{ background: "color-mix(in srgb, var(--tma-button) 12%, transparent)" }}
      >
        <Icon size={22} style={{ color: "var(--tma-button)" }} />
      </div>
      <div className="font-semibold">{title}</div>
      <p className="text-[13px]" style={{ color: "var(--tma-hint)" }}>
        {hint}
      </p>
    </SoftSurface>
  );
}

function TwinCta({
  left,
  right,
}: {
  left: { label: string; onClick: () => void; icon: typeof Plus };
  right: { label: string; onClick: () => void; icon: typeof ArrowUpRight };
}) {
  const LIcon = left.icon;
  const RIcon = right.icon;
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <button
        type="button"
        onClick={left.onClick}
        className="flex h-[3.35rem] items-center justify-center gap-2 rounded-[1.15rem] text-[15px] font-semibold tracking-tight active:scale-[0.98]"
        style={{
          background: "var(--tma-button)",
          color: "var(--tma-button-text)",
          boxShadow: "0 8px 20px color-mix(in srgb, var(--tma-button) 28%, transparent)",
        }}
      >
        <LIcon size={18} strokeWidth={2.5} />
        {left.label}
      </button>
      <button
        type="button"
        onClick={right.onClick}
        className="flex h-[3.35rem] items-center justify-center gap-2 rounded-[1.15rem] border text-[15px] font-semibold tracking-tight active:scale-[0.98]"
        style={{
          background: "var(--tma-secondary-bg)",
          borderColor: "var(--tma-card-border)",
          color: "var(--tma-text)",
        }}
      >
        <RIcon size={18} strokeWidth={2.5} />
        {right.label}
      </button>
    </div>
  );
}

function ProductTile({
  product,
  onSelect,
  daysLabel,
  formatToman,
}: {
  product: StorefrontProduct;
  onSelect: () => void;
  daysLabel: string;
  formatToman: (value: number | string | null | undefined) => string;
}) {
  const traffic =
    product.traffic && String(product.traffic).length <= 24 ? String(product.traffic) : null;
  return (
    <SoftSurface className="flex h-full w-full flex-col p-3.5" onClick={onSelect}>
      <div
        className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl"
        style={{ background: "color-mix(in srgb, var(--tma-button) 14%, transparent)" }}
      >
        <Package size={16} style={{ color: "var(--tma-button)" }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-[14px] font-semibold leading-snug">{product.name}</div>
        <div className="mt-1 text-[11px]" style={{ color: "var(--tma-hint)" }}>
          {[traffic, `${product.durationDays} ${daysLabel}`].filter(Boolean).join(" · ")}
        </div>
      </div>
      <div className="mt-3 text-[15px] font-bold" style={{ color: "var(--tma-button)" }}>
        {product.priceToman ? formatToman(product.priceToman) : `$${product.priceUsd}`}
      </div>
    </SoftSurface>
  );
}

function ServiceDetail({
  service,
  onRenew,
  labels,
  t,
}: {
  service: CustomerService;
  onRenew?: () => void;
  labels: {
    active: string;
    ready: string;
    expired: string;
    open: string;
    renew: string;
    copy: string;
    copied: string;
    traffic: string;
    left: string;
    unlimited: string;
    qr: string;
    expiry: string;
  };
  t: (fa: string, en: string) => string;
}) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const key = service.subToken || service.subId || service.id;
  const { data: output } = useQuery({
    queryKey: ["tma-service-output", key],
    queryFn: async () => {
      if (!key) return null;
      const res = await fetch(`${API_BASE}/subscriptions/${encodeURIComponent(key)}/output`);
      if (!res.ok) return null;
      return (await res.json()) as ClientOutputModel;
    },
    enabled: !!key && expanded,
    retry: false,
  });

  const link = buildSubscriptionLink(service.subId, service.subToken);
  const qrValue =
    (output?.payload?.qrText as string) ||
    (output?.payload?.systemSubUrl as string) ||
    link;
  const used = Number(service.up) + Number(service.down);
  const total = Number(service.total);
  const remaining = trafficLeft(service);
  const statusLabel =
    service.status === "expired"
      ? labels.expired
      : service.unused || service.status === "pending"
        ? labels.ready
        : labels.active;
  const tone =
    service.status === "expired"
      ? "color-mix(in srgb, #f43f5e 16%, transparent)"
      : isExpiringSoon(service)
        ? "color-mix(in srgb, #f59e0b 18%, transparent)"
        : "color-mix(in srgb, var(--tma-button) 14%, transparent)";

  const Renderer = output ? getConnectionRenderer(output.outputType) : null;
  const useOutputPanel =
    expanded && output && output.outputType !== "subscription" && Renderer;

  return (
    <SoftSurface className="p-4">
      <button
        type="button"
        className="w-full text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold">
              {service.remark || service.email}
            </div>
            <div className="mt-1 text-[12px]" style={{ color: "var(--tma-hint)" }}>
              {labels.traffic}:{" "}
              {total > 0
                ? `${gb(used)}/${gb(total)} GB`
                : labels.unlimited}
              {" · "}
              {labels.expiry}: {formatServiceExpiry(service, t)}
            </div>
          </div>
          <span
            className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide"
            style={{ background: tone, color: "var(--tma-button)" }}
          >
            {statusLabel}
          </span>
        </div>
      </button>

      {expanded ? (
        <div className="mt-3 animate-[fadeIn_0.22s_ease] space-y-3">
          {useOutputPanel ? (
            <Renderer output={output!} />
          ) : (
            <>
              {link ? (
                <div
                  className="break-all rounded-xl px-3 py-2 font-mono text-[11px]"
                  dir="ltr"
                  style={{ background: "color-mix(in srgb, var(--tma-bg) 80%, transparent)" }}
                >
                  {link}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {link ? (
                  <button
                    type="button"
                    onClick={async () => {
                      await copyToClipboard(link);
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1500);
                    }}
                    className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-[13px] font-semibold active:scale-[0.98]"
                    style={{
                      background: "var(--tma-button)",
                      color: "var(--tma-button-text)",
                    }}
                  >
                    <Copy size={14} /> {copied ? labels.copied : labels.copy}
                  </button>
                ) : null}
                {link ? (
                  <button
                    type="button"
                    onClick={() => setShowQr(true)}
                    className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border px-4 text-[13px] font-semibold active:scale-[0.98]"
                    style={{ borderColor: "var(--tma-card-border)" }}
                  >
                    <QrCode size={14} /> {labels.qr}
                  </button>
                ) : null}
                {link ? (
                  <a
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border text-[13px] font-semibold active:scale-[0.98]"
                    style={{ borderColor: "var(--tma-card-border)" }}
                  >
                    {labels.open} <ExternalLink size={14} />
                  </a>
                ) : null}
              </div>
            </>
          )}
          {onRenew && service.status !== "disabled" ? (
            <button
              type="button"
              onClick={onRenew}
              className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border text-[13px] font-semibold active:scale-[0.98]"
              style={{ borderColor: "var(--tma-card-border)" }}
            >
              <RefreshCw size={14} /> {labels.renew}
            </button>
          ) : null}
        </div>
      ) : null}

      {showQr && qrValue ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4"
          onClick={() => setShowQr(false)}
        >
          <div
            className="rounded-3xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 text-center text-sm font-semibold text-zinc-800">
              {labels.qr}
            </div>
            <QRCodeCanvas value={qrValue} size={200} includeMargin />
          </div>
        </div>
      ) : null}
    </SoftSurface>
  );
}

function OrderTxnRow({
  order,
  trackLabel,
}: {
  order: CustomerOrder;
  trackLabel: string;
}) {
  const initial = (order.productName || "?").slice(0, 1).toUpperCase();
  const time = order.createdAt
    ? new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";
  return (
    <SoftSurface className="flex items-center gap-3 px-3.5 py-3">
      <div className="relative shrink-0">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-full text-[14px] font-bold text-white"
          style={{ background: "var(--tma-button)" }}
        >
          {initial}
        </div>
        <span
          className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2"
          style={{
            background:
              order.status === "COMPLETED" || order.status === "PROVISIONED"
                ? "#22c55e"
                : "#94a3b8",
            borderColor: "var(--tma-card)",
          }}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold">{order.productName}</div>
        <div className="mt-0.5 text-[11px]" style={{ color: "var(--tma-hint)" }}>
          {time}
          {time ? " · " : ""}
          {order.status.replace(/_/g, " ")}
        </div>
      </div>
      <a
        href={`/track/${encodeURIComponent(order.trackingCode)}`}
        className="shrink-0 text-right"
      >
        <div className="text-[13px] font-bold" style={{ color: "var(--tma-button)" }}>
          {order.amount
            ? `${order.amount} ${order.currency || ""}`.trim()
            : trackLabel}
        </div>
        <div className="text-[10px]" style={{ color: "var(--tma-hint)" }}>
          {trackLabel}
        </div>
      </a>
    </SoftSurface>
  );
}

export default function TmaAppShell({ slug }: { slug: string }) {
  const { theme, user, haptic, ready } = useTelegramWebApp();
  const {
    data,
    isLoading,
    authenticating,
    authError,
    silentLogin,
    cancelOrder,
    refetch,
    markNotificationRead,
    markAllNotificationsRead,
  } = useTelegramSession(slug);

  const [tab, setTab] = useState<TmaTab>("home");
  const [checkout, setCheckout] = useState<"buy" | "renew" | null>(null);
  const [renewService, setRenewService] = useState<CustomerService | null>(null);
  const [linkSubOpen, setLinkSubOpen] = useState(false);
  const [linkSubMode, setLinkSubMode] = useState<"claim" | "renew">("claim");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [flash, setFlash] = useState("");

  const primary = data?.branding?.primaryColor || null;
  const preferDark =
    (typeof window !== "undefined" ? window.Telegram?.WebApp?.colorScheme : null) === "dark";
  const style = useMemo(
    () => cssVars(theme as any, primary, preferDark),
    [theme, primary, preferDark],
  );

  useEffect(() => {
    if (!data) return;
    if (data.activeServices?.length && !checkout) {
      setTab((prev) =>
        prev === "shop" && !sessionStorage.getItem(`tma-tab-${slug}`) ? "home" : prev,
      );
    }
  }, [data, checkout, slug]);

  useEffect(() => {
    if (tab) sessionStorage.setItem(`tma-tab-${slug}`, tab);
    scrollTmaToTop();
  }, [tab, slug]);

  useEffect(() => {
    const prev = document.body.style.overscrollBehaviorY;
    document.body.style.overscrollBehaviorY = "none";
    return () => {
      document.body.style.overscrollBehaviorY = prev;
    };
  }, []);

  useEffect(() => {
    if (!data?.services?.length) return;
    if (!selectedServiceId) {
      setSelectedServiceId(data.activeServices?.[0]?.id || data.services[0].id);
    }
  }, [data, selectedServiceId]);

  if (!ready || authenticating || (isLoading && !data)) {
    return (
      <div
        className="flex min-h-[100dvh] flex-col items-center justify-center gap-3"
        style={{
          background: preferDark ? theme.bg_color || "#0f172a" : "#F3F6FB",
          color: preferDark ? theme.text_color || "#fff" : "#0f172a",
          minHeight: "var(--tg-viewport-stable-height, 100dvh)",
        }}
      >
        <LoaderCircle className="animate-spin opacity-70" />
        <p className="text-sm opacity-70">ورود با تلگرام…</p>
      </div>
    );
  }

  if (authError && !data) {
    const message =
      (authError as any)?.response?.data?.message ||
      (authError as Error)?.message ||
      "Could not sign in";
    return (
      <div
        className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 px-6 text-center"
        style={{
          background: preferDark ? theme.bg_color || "#0f172a" : "#F3F6FB",
          color: preferDark ? theme.text_color || "#fff" : "#0f172a",
          minHeight: "var(--tg-viewport-stable-height, 100dvh)",
        }}
      >
        <p className="text-sm opacity-80">{message}</p>
        <p className="text-xs opacity-50">
          مینی‌اپ را از دکمه Open داخل ربات فروشگاه باز کنید.
        </p>
        <button
          type="button"
          className="mt-2 h-11 rounded-2xl px-5 text-sm font-semibold active:scale-95"
          style={{ background: primary || theme.button_color || "#2563eb", color: "#fff" }}
          onClick={() => {
            const initData = window.Telegram?.WebApp?.initData;
            if (initData) silentLogin.mutate({ slug, initData });
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const products = data.products || [];
  const renewProducts = data.renewProducts?.length ? data.renewProducts : products;
  const checkoutProducts =
    checkout === "renew"
      ? renewProducts
      : selectedProductId
        ? [
            ...products.filter((p) => p.id === selectedProductId),
            ...products.filter((p) => p.id !== selectedProductId),
          ]
        : products;

  const changeTab = (next: TmaTab) => {
    haptic("selection");
    setTab(next);
  };

  return (
    <StorefrontLocaleProvider
      store={{
        title: data.store?.title || "Store",
        slug: data.store?.slug || slug,
        branding: data.branding,
      }}
    >
      <TmaAppShellInner
        slug={slug}
        data={data}
        user={user}
        haptic={haptic}
        style={style}
        primary={primary}
        preferDark={preferDark}
        tab={tab}
        setTab={changeTab}
        checkout={checkout}
        setCheckout={setCheckout}
        renewService={renewService}
        setRenewService={setRenewService}
        selectedProductId={selectedProductId}
        setSelectedProductId={setSelectedProductId}
        selectedServiceId={selectedServiceId}
        setSelectedServiceId={setSelectedServiceId}
        flash={flash}
        setFlash={setFlash}
        cancelOrder={cancelOrder}
        refetch={refetch}
        markNotificationRead={markNotificationRead}
        markAllNotificationsRead={markAllNotificationsRead}
        linkSubOpen={linkSubOpen}
        setLinkSubOpen={setLinkSubOpen}
        linkSubMode={linkSubMode}
        setLinkSubMode={setLinkSubMode}
        products={products}
        checkoutProducts={checkoutProducts}
      />
    </StorefrontLocaleProvider>
  );
}

function TmaAppShellInner({
  slug,
  data,
  user,
  haptic,
  style,
  primary,
  preferDark,
  tab,
  setTab,
  checkout,
  setCheckout,
  renewService,
  setRenewService,
  selectedProductId: _selectedProductId,
  setSelectedProductId,
  selectedServiceId,
  setSelectedServiceId,
  flash,
  setFlash,
  cancelOrder,
  refetch,
  markNotificationRead,
  markAllNotificationsRead,
  linkSubOpen,
  setLinkSubOpen,
  linkSubMode,
  setLinkSubMode,
  products,
  checkoutProducts,
}: any) {
  const { t, isFa, formatToman } = useStorefrontLocale();
  const isMobileTg = isTelegramMobilePlatform(
    typeof window !== "undefined" ? window.Telegram?.WebApp || null : null,
  );
  const headerLogo = resolveThemeLogo({
    logoLight: data.branding?.logo,
    logoDark: data.branding?.logoDark,
    preferDark,
  });

  const services: CustomerService[] = data.services || [];
  const activeServices: CustomerService[] = data.activeServices?.length
    ? data.activeServices
    : services.filter((s) => s.status === "active" || s.status === "pending");
  const selectedService =
    services.find((s) => s.id === selectedServiceId) || activeServices[0] || services[0] || null;

  const remainingBytes = activeServices.reduce((sum, s) => {
    const left = trafficLeft(s);
    return sum + (left == null ? 0 : left);
  }, 0);
  const hasMetered = activeServices.some((s) => Number(s.total) > 0);
  const displayName =
    user?.first_name ||
    data.profile?.name ||
    t("مشتری", "Customer");
  const avatarLetter = displayName.slice(0, 1).toUpperCase();

  const serviceLabels = {
    active: t("فعال", "Active"),
    ready: t("آماده", "Ready"),
    expired: t("منقضی", "Expired"),
    open: t("باز کردن", "Open"),
    renew: t("تمدید", "Renew"),
    copy: t("کپی لینک", "Copy link"),
    copied: t("کپی شد", "Copied"),
    traffic: t("ترافیک", "Traffic"),
    left: t("باقیمانده", "Left"),
    unlimited: t("نامحدود", "Unlimited"),
    qr: t("کیوآر", "QR"),
    expiry: t("انقضا", "Expiry"),
  };

  const unreadAlerts = (data.notifications || []).filter((n: any) => !n.isRead).length;

  const openLinkSub = (mode: "claim" | "renew") => {
    haptic("selection");
    setLinkSubMode(mode);
    setLinkSubOpen(true);
  };

  const handleServiceClaimed = (service: CustomerService) => {
    haptic("success");
    refetch();
    if (linkSubMode === "renew") {
      setRenewService(service);
      setSelectedServiceId(service.id);
      setCheckout("renew");
    } else {
      setTab("services");
      setFlash(t("سرویس به حساب شما اضافه شد", "Service added to your account"));
    }
  };

  const openBuy = () => {
    haptic("selection");
    setRenewService(null);
    setSelectedProductId(null);
    setCheckout("buy");
  };

  const openRenew = () => {
    haptic("light");
    const target =
      selectedService && selectedService.status !== "disabled"
        ? selectedService
        : activeServices[0] || services[0] || null;
    if (!target) {
      openLinkSub("renew");
      return;
    }
    setRenewService(target);
    setCheckout("renew");
  };

  const supportUrl =
    data.supportLinks?.telegram ||
    data.supportLinks?.support ||
    null;

  return (
    <div
      className={`mx-auto w-full ${isMobileTg ? "max-w-none" : "max-w-[430px]"} ${isFa ? "font-[Vazirmatn,Tahoma,sans-serif]" : ""}`}
      style={{
        ...style,
        background: "var(--tma-bg)",
        color: "var(--tma-text)",
        WebkitTapHighlightColor: "transparent",
        paddingTop:
          "max(env(safe-area-inset-top, 0px), var(--tg-safe-top, 0px), 10px)",
        minHeight: "var(--tg-viewport-stable-height, 100dvh)",
        ...(isFa ? { fontFamily: '"Vazirmatn", Tahoma, sans-serif' } : null),
      }}
    >
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes slideUp { from { opacity: 0.6; transform: translateY(28px); } to { opacity: 1; transform: none; } }
      `}</style>
      <header className="sticky top-0 z-20 px-4 pb-2 pt-1 backdrop-blur-xl" style={{ background: "color-mix(in srgb, var(--tma-bg) 88%, transparent)" }}>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              haptic("selection");
              setTab("home");
            }}
            className="relative shrink-0 active:scale-95"
            aria-label="Profile"
          >
            {headerLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={headerLogo} alt="" className="h-11 w-11 rounded-full object-cover" />
            ) : (
              <div
                className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ background: "var(--tma-button)" }}
              >
                {avatarLetter}
              </div>
            )}
          </button>

          <div className="min-w-0 flex-1">
            <div className="truncate text-[16px] font-bold leading-tight">
              {data.store?.title || "Store"}
            </div>
            <div className="truncate text-[12px]" style={{ color: "var(--tma-hint)" }}>
              {t(`سلام، ${displayName}`, `Hi, ${displayName}`)}
              {tab === "services" && activeServices.length && hasMetered
                ? ` · ${gb(remainingBytes)} GB`
                : tab === "home"
                  ? ` · ${activeServices.length} ${t("سرویس", "services")}`
                  : ""}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <LanguageSwitcher className="!shadow-none !text-[11px]" />
            {supportUrl ? (
              <a
                href={supportUrl}
                target="_blank"
                rel="noreferrer"
                className="flex h-9 w-9 items-center justify-center rounded-full active:scale-95"
                style={{ background: "var(--tma-card)", border: "1px solid var(--tma-card-border)" }}
                aria-label="Support"
              >
                <MessageCircle size={16} style={{ color: "var(--tma-button)" }} />
              </a>
            ) : null}
            <button
              type="button"
              onClick={() => {
                haptic("selection");
                refetch();
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full active:scale-95"
              style={{ background: "var(--tma-card)", border: "1px solid var(--tma-card-border)" }}
              aria-label="Refresh"
            >
              <RefreshCw size={15} style={{ color: "var(--tma-button)" }} />
            </button>
          </div>
        </div>

        {flash ? (
          <div
            className="mt-2 animate-[fadeIn_0.25s_ease] rounded-2xl px-3.5 py-2.5 text-[13px] font-medium"
            style={{ background: "color-mix(in srgb, var(--tma-button) 16%, transparent)" }}
          >
            {flash}
          </div>
        ) : null}
      </header>

      <main className="mx-auto max-w-lg space-y-3 px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-2">
        {tab === "home" ? (
          <TmaHomeTab
            services={services}
            activeServices={activeServices}
            orders={data.orders || []}
            unreadAlerts={unreadAlerts}
            t={t}
            onOpenServices={() => setTab("services")}
            onOpenAlerts={() => setTab("alerts")}
            onOpenShop={() => setTab("shop")}
            onLinkSub={() => openLinkSub("claim")}
            onRenewService={(s) => {
              setRenewService(s);
              setSelectedServiceId(s.id);
              setCheckout("renew");
            }}
          />
        ) : null}

        {tab === "shop" ? (
          <div className="animate-[fadeIn_0.28s_ease] space-y-3">
            <SectionTitle title={t("پلن‌ها", "Plans")} />
            <div className="grid grid-cols-2 gap-2.5">
              {products.map((p: StorefrontProduct) => (
                <ProductTile
                  key={p.id}
                  product={p}
                  onSelect={() => {
                    haptic("selection");
                    setSelectedProductId(p.id);
                    setRenewService(null);
                    setCheckout("buy");
                  }}
                  daysLabel={t("روز", "days")}
                  formatToman={formatToman}
                />
              ))}
            </div>
            {!products.length ? (
              <EmptyState
                icon={ShoppingBag}
                title={t("هنوز محصولی نیست", "No products yet")}
                hint={t("این فروشگاه هنوز پلنی منتشر نکرده.", "This store has not published any plans.")}
              />
            ) : null}
          </div>
        ) : null}

        {tab === "services" ? (
          <div className="animate-[fadeIn_0.28s_ease] space-y-3">
            <TwinCta
              left={{ label: t("خرید", "Buy"), icon: Plus, onClick: openBuy }}
              right={{ label: t("تمدید", "Renew"), icon: ArrowUpRight, onClick: openRenew }}
            />
            <button
              type="button"
              onClick={() => openLinkSub("claim")}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-[1.15rem] border text-[13px] font-semibold active:scale-[0.98]"
              style={{
                borderColor: "var(--tma-card-border)",
                background: "var(--tma-secondary-bg)",
              }}
            >
              {t("افزودن با لینک ساب قبلی", "Add with previous sub link")}
            </button>
            {!services.length ? (
              <EmptyState
                icon={Package}
                title={t("هنوز سرویسی نیست", "No services yet")}
                hint={t("از فروشگاه بخرید یا لینک ساب قبلی را اضافه کنید.", "Buy a plan or add a previous sub link.")}
              />
            ) : (
              <div className="space-y-2.5">
                {services.map((service: CustomerService) => (
                  <ServiceDetail
                    key={service.id}
                    service={service}
                    t={t}
                    onRenew={() => {
                      haptic("light");
                      setSelectedServiceId(service.id);
                      setRenewService(service);
                      setCheckout("renew");
                    }}
                    labels={serviceLabels}
                  />
                ))}
              </div>
            )}
          </div>
        ) : null}

        {tab === "orders" ? (
          <div className="animate-[fadeIn_0.28s_ease] space-y-3">
            <SectionTitle title={t("سفارش‌ها", "Orders")} />
            <div className="space-y-2.5">
              {(data.orders || []).map((order: CustomerOrder) => (
                <div key={order.id} className="space-y-1">
                  <OrderTxnRow order={order} trackLabel={t("پیگیری", "Track")} />
                  {["PENDING_PAYMENT", "PAYMENT_SUBMITTED", "UNDER_REVIEW"].includes(
                    order.status,
                  ) ? (
                    <button
                      type="button"
                      className="px-2 text-[12px] font-medium text-red-500"
                      onClick={() => cancelOrder.mutate(order.id)}
                    >
                      {t("لغو سفارش", "Cancel order")}
                    </button>
                  ) : null}
                </div>
              ))}
              {!data.orders?.length ? (
                <EmptyState
                  icon={Package}
                  title={t("هنوز سفارشی نیست", "No orders yet")}
                  hint={t("خریدهای شما اینجا نمایش داده می‌شود.", "Your purchases will show up here.")}
                />
              ) : null}
            </div>
          </div>
        ) : null}

        {tab === "alerts" ? (
          <TmaAlertsTab
            items={data.notifications || []}
            t={t}
            onMarkRead={(id) => markNotificationRead.mutate(id)}
            onMarkAllRead={() => markAllNotificationsRead.mutate()}
            markingAll={markAllNotificationsRead.isPending}
          />
        ) : null}
      </main>

      <TmaBottomNav
        tab={tab}
        accent={primary || undefined}
        unreadAlerts={unreadAlerts}
        onChange={setTab}
      />

      <TmaLinkSubSheet
        open={linkSubOpen}
        mode={linkSubMode}
        onClose={() => setLinkSubOpen(false)}
        onClaimed={handleServiceClaimed}
      />

      <TmaCheckoutSheet
        open={!!checkout}
        mode={checkout || "buy"}
        products={checkoutProducts}
        renewService={renewService}
        primaryColor={primary || undefined}
        onClose={() => {
          setCheckout(null);
          setRenewService(null);
          setSelectedProductId(null);
        }}
        onSuccess={(trackingCode) => {
          haptic("success");
          setCheckout(null);
          setRenewService(null);
          setSelectedProductId(null);
          setTab("orders");
          setFlash(t(`سفارش ثبت شد — ${trackingCode}`, `Order submitted — ${trackingCode}`));
          scrollTmaToTop();
          setTimeout(() => setFlash(""), 5000);
        }}
      />
    </div>
  );
}
