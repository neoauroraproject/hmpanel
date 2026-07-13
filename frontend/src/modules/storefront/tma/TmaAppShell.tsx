"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  LoaderCircle,
  Package,
  RefreshCw,
  ShoppingBag,
} from "lucide-react";
import { buildSubscriptionLink } from "../subscription";
import type { CustomerService, StorefrontProduct } from "../types";
import { TmaBottomNav, type TmaTab } from "./TmaBottomNav";
import { TmaCheckoutSheet } from "./TmaCheckoutSheet";
import { useTelegramSession } from "./useTelegramSession";
import { useTelegramWebApp } from "./useTelegramWebApp";
import { scrollTmaToTop } from "./scroll";
import { LanguageSwitcher, StorefrontLocaleProvider, useStorefrontLocale } from "../locale";

function cssVars(theme: Record<string, string | undefined>, primary?: string | null) {
  return {
    ["--tma-bg" as string]: theme.bg_color || "#0f0f10",
    ["--tma-text" as string]: theme.text_color || "#f4f4f5",
    ["--tma-hint" as string]: theme.hint_color || "#a1a1aa",
    ["--tma-link" as string]: theme.link_color || "#60a5fa",
    ["--tma-button" as string]: primary || theme.button_color || "#2563eb",
    ["--tma-button-text" as string]: theme.button_text_color || "#ffffff",
    ["--tma-secondary-bg" as string]: theme.secondary_bg_color || "#18181b",
  } as React.CSSProperties;
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
    <div
      className="flex flex-col items-center justify-center gap-2 rounded-[1.35rem] px-6 py-12 text-center"
      style={{ background: "color-mix(in srgb, var(--tma-hint) 8%, transparent)" }}
    >
      <div
        className="mb-1 flex h-12 w-12 items-center justify-center rounded-2xl"
        style={{ background: "color-mix(in srgb, var(--tma-hint) 14%, transparent)" }}
      >
        <Icon size={22} style={{ color: "var(--tma-hint)" }} />
      </div>
      <div className="font-semibold">{title}</div>
      <p className="text-[13px]" style={{ color: "var(--tma-hint)" }}>
        {hint}
      </p>
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
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full rounded-[1.25rem] p-4 text-left transition active:scale-[0.985]"
      style={{ background: "color-mix(in srgb, var(--tma-hint) 10%, transparent)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold">{product.name}</div>
          <div className="mt-1 text-[12px]" style={{ color: "var(--tma-hint)" }}>
            {product.traffic} · {product.durationDays} {daysLabel}
          </div>
        </div>
        <div className="shrink-0 text-[15px] font-bold" style={{ color: "var(--tma-link)" }}>
          {product.priceToman ? formatToman(product.priceToman) : `$${product.priceUsd}`}
        </div>
      </div>
    </button>
  );
}

function ServiceRow({
  service,
  onRenew,
  labels,
}: {
  service: CustomerService;
  onRenew?: () => void;
  labels: { active: string; expired: string; open: string; renew: string };
}) {
  const link = buildSubscriptionLink(service.subId, service.subToken);
  const tone =
    service.status === "active"
      ? { bg: "color-mix(in srgb, #22c55e 22%, transparent)", label: labels.active }
      : service.status === "expired"
        ? { bg: "color-mix(in srgb, #f43f5e 22%, transparent)", label: labels.expired }
        : { bg: "color-mix(in srgb, var(--tma-hint) 20%, transparent)", label: service.status };

  return (
    <div
      className="rounded-[1.25rem] p-4"
      style={{ background: "color-mix(in srgb, var(--tma-hint) 10%, transparent)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold">
            {service.remark || service.email}
          </div>
          <div className="mt-1 text-[12px]" style={{ color: "var(--tma-hint)" }}>
            {service.expiryTime}
          </div>
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide"
          style={{ background: tone.bg }}
        >
          {tone.label}
        </span>
      </div>
      <div className="mt-3.5 flex gap-2">
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-[13px] font-semibold active:scale-[0.98]"
            style={{
              background: "var(--tma-button)",
              color: "var(--tma-button-text)",
            }}
          >
            {labels.open} <ExternalLink size={14} />
          </a>
        ) : null}
        {onRenew && service.status !== "disabled" ? (
          <button
            type="button"
            onClick={onRenew}
            className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border text-[13px] font-semibold active:scale-[0.98]"
            style={{ borderColor: "color-mix(in srgb, var(--tma-hint) 40%, transparent)" }}
          >
            <RefreshCw size={14} /> {labels.renew}
          </button>
        ) : null}
      </div>
    </div>
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
  } = useTelegramSession(slug);

  const [tab, setTab] = useState<TmaTab>("shop");
  const [checkout, setCheckout] = useState<"buy" | "renew" | null>(null);
  const [renewService, setRenewService] = useState<CustomerService | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [flash, setFlash] = useState("");

  const primary = data?.branding?.primaryColor || null;
  const style = useMemo(() => cssVars(theme as any, primary), [theme, primary]);

  useEffect(() => {
    if (!data) return;
    if (data.activeServices?.length && !checkout) {
      setTab((prev) =>
        prev === "shop" && !sessionStorage.getItem(`tma-tab-${slug}`) ? "services" : prev,
      );
    }
  }, [data, checkout, slug]);

  useEffect(() => {
    if (tab) sessionStorage.setItem(`tma-tab-${slug}`, tab);
    scrollTmaToTop();
  }, [tab, slug]);

  useEffect(() => {
    // App-like: prevent rubber-band overscroll feel where possible
    const prev = document.body.style.overscrollBehaviorY;
    document.body.style.overscrollBehaviorY = "none";
    return () => {
      document.body.style.overscrollBehaviorY = prev;
    };
  }, []);

  if (!ready || authenticating || (isLoading && !data)) {
    return (
      <div
        className="flex min-h-[100dvh] flex-col items-center justify-center gap-3"
        style={{
          background: theme.bg_color || "#0f0f10",
          color: theme.text_color || "#fff",
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
          background: theme.bg_color || "#0f0f10",
          color: theme.text_color || "#fff",
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
          style={{ background: theme.button_color || "#2563eb", color: "#fff" }}
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
        theme={theme}
        style={style}
        primary={primary}
        tab={tab}
        setTab={changeTab}
        checkout={checkout}
        setCheckout={setCheckout}
        renewService={renewService}
        setRenewService={setRenewService}
        selectedProductId={selectedProductId}
        setSelectedProductId={setSelectedProductId}
        flash={flash}
        setFlash={setFlash}
        cancelOrder={cancelOrder}
        refetch={refetch}
        products={products}
        renewProducts={renewProducts}
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
  theme,
  style,
  primary,
  tab,
  setTab,
  checkout,
  setCheckout,
  renewService,
  setRenewService,
  selectedProductId,
  setSelectedProductId,
  flash,
  setFlash,
  cancelOrder,
  refetch,
  products,
  renewProducts,
  checkoutProducts,
}: any) {
  const { t, isFa, formatToman } = useStorefrontLocale();

  return (
    <div
      className={`min-h-[100dvh] ${isFa ? "font-[Vazirmatn,Tahoma,sans-serif]" : ""}`}
      style={{
        ...style,
        background: "var(--tma-bg)",
        color: "var(--tma-text)",
        WebkitTapHighlightColor: "transparent",
        paddingTop: "env(safe-area-inset-top)",
        minHeight: "var(--tg-viewport-stable-height, 100dvh)",
        ...(isFa ? { fontFamily: '"Vazirmatn", Tahoma, sans-serif' } : null),
      }}
    >
      <header
        className="sticky top-0 z-20 px-4 pb-3 pt-3 backdrop-blur-xl"
        style={{
          background: "color-mix(in srgb, var(--tma-bg) 86%, transparent)",
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {data.branding?.logo || data.branding?.logoDark ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={(data.branding.logo || data.branding.logoDark) as string}
                alt=""
                className="h-10 w-10 rounded-[0.9rem] object-cover"
              />
            ) : (
              <div
                className="flex h-10 w-10 items-center justify-center rounded-[0.9rem] text-sm font-bold text-white"
                style={{ background: "var(--tma-button)" }}
              >
                {(data.store?.title || "S").slice(0, 1)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[16px] font-bold leading-tight">
                {data.store?.title || "Store"}
              </div>
              <div className="truncate text-[12px]" style={{ color: "var(--tma-hint)" }}>
                {user?.first_name
                  ? t(`سلام، ${user.first_name}`, `Hi, ${user.first_name}`)
                  : data.profile?.name || t("مشتری تلگرام", "Telegram customer")}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <LanguageSwitcher className="!shadow-none" />
            <button
              type="button"
              onClick={() => {
                haptic("selection");
                refetch();
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full active:scale-95"
              style={{ background: "color-mix(in srgb, var(--tma-hint) 14%, transparent)" }}
              aria-label="Refresh"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
        {flash ? (
          <div
            className="mt-3 rounded-2xl px-3.5 py-2.5 text-[13px] font-medium"
            style={{ background: "color-mix(in srgb, #22c55e 22%, transparent)" }}
          >
            {flash}
          </div>
        ) : null}
      </header>

      <main className="mx-auto max-w-lg space-y-3 px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-2">
        {tab === "shop" ? (
          <>
            <SectionTitle
              title={t("فروشگاه", "Shop")}
              subtitle={t("یک پلن انتخاب کنید", "Pick a plan to get started")}
            />
            <div className="space-y-2.5">
              {products.map((p) => (
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
              {!products.length ? (
                <EmptyState
                  icon={ShoppingBag}
                  title={t("هنوز محصولی نیست", "No products yet")}
                  hint={t("این فروشگاه هنوز پلنی منتشر نکرده.", "This store has not published any plans.")}
                />
              ) : null}
            </div>
          </>
        ) : null}

        {tab === "services" ? (
          <>
            <SectionTitle
              title={t("سرویس‌ها", "Services")}
              subtitle={t("اشتراک‌های فعال و قبلی", "Your active and past subscriptions")}
            />
            <div className="space-y-2.5">
              {(data.services || []).map((service) => (
                <ServiceRow
                  key={service.id}
                  service={service}
                  onRenew={() => {
                    haptic("light");
                    setRenewService(service);
                    setCheckout("renew");
                  }}
                  labels={{
                    active: t("فعال", "Active"),
                    expired: t("منقضی", "Expired"),
                    open: t("باز کردن", "Open"),
                    renew: t("تمدید", "Renew"),
                  }}
                />
              ))}
              {!data.services?.length ? (
                <EmptyState
                  icon={Package}
                  title={t("هنوز سرویسی نیست", "No services yet")}
                  hint={t("از تب فروشگاه یک پلن بخرید.", "Buy a plan from the Shop tab.")}
                />
              ) : null}
            </div>
          </>
        ) : null}

        {tab === "orders" ? (
          <>
            <SectionTitle
              title={t("سفارش‌ها", "Orders")}
              subtitle={t("پیگیری و مدیریت درخواست‌ها", "Track and manage your requests")}
            />
            <div className="space-y-2.5">
              {(data.orders || []).map((order) => (
                <div
                  key={order.id}
                  className="rounded-[1.25rem] p-4"
                  style={{ background: "color-mix(in srgb, var(--tma-hint) 10%, transparent)" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-semibold">{order.productName}</div>
                      <div className="mt-1 text-[12px]" style={{ color: "var(--tma-hint)" }}>
                        {order.trackingCode} · {order.status.replace(/_/g, " ")}
                      </div>
                    </div>
                    <a
                      href={`/track/${encodeURIComponent(order.trackingCode)}`}
                      className="shrink-0 text-[13px] font-semibold"
                      style={{ color: "var(--tma-link)" }}
                    >
                      {t("پیگیری", "Track")}
                    </a>
                  </div>
                  {["PENDING_PAYMENT", "PAYMENT_SUBMITTED", "UNDER_REVIEW"].includes(order.status) ? (
                    <button
                      type="button"
                      className="mt-3 text-[12px] font-medium text-red-400"
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
          </>
        ) : null}

        {tab === "profile" ? (
          <>
            <SectionTitle
              title={t("پروفایل", "Profile")}
              subtitle={t("ورود با تلگرام", "Signed in with Telegram")}
            />
            <div
              className="overflow-hidden rounded-[1.25rem]"
              style={{ background: "color-mix(in srgb, var(--tma-hint) 10%, transparent)" }}
            >
              <div
                className="flex items-center gap-3 border-b px-4 py-4"
                style={{ borderColor: "color-mix(in srgb, var(--tma-hint) 18%, transparent)" }}
              >
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white"
                  style={{ background: "var(--tma-button)" }}
                >
                  {(user?.first_name || data.profile?.name || "U").slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="truncate font-semibold">
                    {data.profile?.name ||
                      [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
                      t("مشتری", "Customer")}
                  </div>
                  <div className="truncate text-[13px]" style={{ color: "var(--tma-hint)" }}>
                    {user?.username ? `@${user.username}` : data.profile?.telegram || "Telegram"}
                  </div>
                </div>
              </div>
              <p className="px-4 py-3.5 text-[12px] leading-relaxed" style={{ color: "var(--tma-hint)" }}>
                {t(
                  "در مینی‌اپ نیازی به توکن نیست. حساب شما به‌صورت خودکار متصل است. توکن ورود وب فقط در چت ربات ارسال می‌شود.",
                  "No token needed in the Mini App. Your account is linked automatically. Web login tokens are only sent in the bot chat.",
                )}
              </p>
            </div>
          </>
        ) : null}
      </main>

      <TmaBottomNav tab={tab} accent={primary || undefined} onChange={setTab} />

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
