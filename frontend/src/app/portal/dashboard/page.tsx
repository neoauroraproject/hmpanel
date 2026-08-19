"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  Copy,
  Link2,
  LoaderCircle,
  LogOut,
  Package,
  Plus,
  ShoppingBag,
} from "lucide-react";
import { copyToClipboard } from "@/lib/clipboard";
import { publicApi } from "@/lib/api";
import { useCustomerSession } from "@/modules/storefront/session";
import { buildSubscriptionLink, parseSubscriptionToken } from "@/modules/storefront/subscription";
import { compressReceiptImage } from "@/modules/storefront/receipt-image";
import type {
  CustomerDashboard,
  CustomerService,
  StorefrontCategory,
  StorefrontProduct,
  StorefrontStore,
} from "@/modules/storefront/types";
import { StoreShell, ServiceCard } from "@/modules/storefront/ui";
import { scrollToTop } from "@/modules/storefront/scroll";
import {
  MotionPage,
  SectionHeading,
  Surface,
  BottomTabBar,
  StatTile,
  EmptyState,
  staggerContainer,
  staggerItem,
} from "@/modules/storefront/design";
import { usePortalTelegramGate } from "@/modules/storefront/tma/usePortalTelegramGate";
import { StorefrontLocaleProvider, useStorefrontLocale } from "@/modules/storefront/locale";
import { CheckoutSheet } from "@/modules/storefront/PortalCheckoutSheet";
import { rememberStoreSlug, portalPathForSlug, shopPathForSlug } from "@/modules/storefront/store-slug";

type FlowMode = "idle" | "buy" | "renew";
type DashTab = "home" | "orders" | "alerts";

function PortalTopBarLabel() {
  const { t } = useStorefrontLocale();
  return <>{t("پورتال مشتری", "Customer portal")}</>;
}

export default function CustomerDashboardPage() {
  return (
    <StorefrontLocaleProvider>
      <CustomerDashboardInner />
    </StorefrontLocaleProvider>
  );
}

function CustomerDashboardInner() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const gate = usePortalTelegramGate();
  const {
    data,
    isLoading,
    error,
    logout,
    markNotificationRead,
    markAllNotificationsRead,
    cancelOrder,
    claimService,
    assignServiceCategory,
    hideService,
  } = useCustomerSession();
  const { t, isFa } = useStorefrontLocale();

  const [tab, setTab] = useState<DashTab>("home");
  const [flow, setFlow] = useState<FlowMode>("idle");
  const [selectedProduct, setSelectedProduct] = useState<StorefrontProduct | null>(null);
  const [renewingService, setRenewingService] = useState<CustomerService | null>(null);
  const [categoryPickService, setCategoryPickService] = useState<CustomerService | null>(null);
  const [categoryPickId, setCategoryPickId] = useState("");
  const [categoryPickError, setCategoryPickError] = useState("");
  const [categoryPickContinueRenew, setCategoryPickContinueRenew] = useState(false);
  const [configName, setConfigName] = useState("");
  const [receiptText, setReceiptText] = useState("");
  const [receiptImage, setReceiptImage] = useState("");
  const [receiptPreview, setReceiptPreview] = useState("");
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const [couponCode, setCouponCode] = useState("");
  const [sheetStep, setSheetStep] = useState(0);
  const [copiedToken, setCopiedToken] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const unreadCount = useMemo(
    () => (data?.notifications ?? []).filter((item) => !item.isRead).length,
    [data?.notifications],
  );

  const renewMutation = useMutation({
    mutationFn: async () => {
      if (!renewingService || !selectedProduct) return null;
      return (
        await publicApi.post("/store/customer/renew", {
          clientId: renewingService.id,
          productId: selectedProduct.id,
          receiptText: receiptText || undefined,
          receiptImage: receiptImage || undefined,
          selectedAddonIds,
          couponCode: couponCode || undefined,
        })
      ).data;
    },
    onSuccess: async (response) => {
      if (response?.trackingCode) {
        router.push(`/track/${encodeURIComponent(response.trackingCode)}`);
      }
      resetFlow();
      setTab("orders");
      await queryClient.invalidateQueries({ queryKey: ["customer-session"] });
    },
  });

  const orderMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProduct || !configName.trim()) return null;
      return (
        await publicApi.post("/store/customer/order", {
          productId: selectedProduct.id,
          configName: configName.trim(),
          receiptText: receiptText || undefined,
          receiptImage: receiptImage || undefined,
          selectedAddonIds,
          couponCode: couponCode || undefined,
        })
      ).data;
    },
    onSuccess: async (response) => {
      if (response?.trackingCode) {
        router.push(`/track/${encodeURIComponent(response.trackingCode)}`);
      }
      resetFlow();
      setTab("orders");
      await queryClient.invalidateQueries({ queryKey: ["customer-session"] });
    },
  });

  useEffect(() => {
    if (gate.isBusy) return;
    if (gate.phase === "error") return;
    if (!isLoading && (error || !data) && gate.phase === "skip") {
      router.replace(portalPathForSlug(gate.slug, "login"));
    }
  }, [data, error, isLoading, router, gate.isBusy, gate.phase]);

  useEffect(() => {
    scrollToTop();
  }, [tab, sheetStep, flow]);

  const resetFlow = () => {
    setFlow("idle");
    setSelectedProduct(null);
    setRenewingService(null);
    setConfigName("");
    setReceiptText("");
    setReceiptImage("");
    setReceiptPreview("");
    setSelectedAddonIds([]);
    setCouponCode("");
    setSheetStep(0);
  };

  const onReceiptFile = async (file?: File | null) => {
    if (!file) return;
    try {
      const value = await compressReceiptImage(file);
      setReceiptImage(value);
      setReceiptPreview(value);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (data?.store?.slug) rememberStoreSlug(data.store.slug);
  }, [data?.store?.slug]);

  const goShop = () => {
    router.replace(shopPathForSlug(data?.store?.slug || gate.slug));
  };

  if (gate.isBusy) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-zinc-50 dark:bg-zinc-950">
        <LoaderCircle className="animate-spin text-zinc-400" />
        <p className="text-sm text-zinc-500">ورود با تلگرام…</p>
      </div>
    );
  }

  if (gate.phase === "error") {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-zinc-600">{gate.error}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <LoaderCircle className="animate-spin text-zinc-400" />
      </div>
    );
  }
  if (error || !data) return null;

  const primary = data.branding?.primaryColor || "#2563eb";
  const products = data.products || [];
  const categories = data.categories || [];
  const renewProductsForService = (service: CustomerService | null) => {
    if (!service?.categoryId) return [] as StorefrontProduct[];
    const serviceIsEylan =
      service.providerId === "eylan" ||
      service.deliveryHint === "eylan_download" ||
      String(service.id || "").startsWith("eylan:");
    return products.filter((p) => {
      if (p.categoryId !== service.categoryId || p.renewable === false) return false;
      const productIsEylan = p.providerId === "eylan";
      return serviceIsEylan ? productIsEylan : !productIsEylan;
    });
  };
  const renewProducts = renewProductsForService(renewingService);
  const activeCount = (data.activeServices || []).length || (data.services || []).filter((s) => s.status === "active" || s.status === "pending").length;
  const pendingCount = (data.pendingOrders || []).length;

  const startRenew = (service: CustomerService) => {
    if (!service.categoryId) {
      setCategoryPickService(service);
      setCategoryPickId(categories[0]?.id || "");
      setCategoryPickError("");
      setCategoryPickContinueRenew(true);
      return;
    }
    setRenewingService(service);
    const catalog = renewProductsForService(service);
    setSelectedProduct(catalog[0] || null);
    setFlow("renew");
    setSheetStep(0);
  };

  const submitCategoryPick = async () => {
    if (!categoryPickService || !categoryPickId) {
      setCategoryPickError(t("دسته‌بندی را انتخاب کنید", "Please select a category"));
      return;
    }
    setCategoryPickError("");
    try {
      const dashboard = await assignServiceCategory.mutateAsync({
        clientId: categoryPickService.id,
        categoryId: categoryPickId,
      });
      const updated =
        dashboard?.services?.find((s) => s.id === categoryPickService.id) || {
          ...categoryPickService,
          categoryId: categoryPickId,
        };
      setCategoryPickService(null);
      if (categoryPickContinueRenew) {
        setRenewingService(updated);
        const serviceIsEylan =
          updated.providerId === "eylan" ||
          updated.deliveryHint === "eylan_download" ||
          String(updated.id || "").startsWith("eylan:");
        const catalog = (dashboard?.products || products).filter((p) => {
          if (p.categoryId !== categoryPickId || p.renewable === false) return false;
          const productIsEylan = p.providerId === "eylan";
          return serviceIsEylan ? productIsEylan : !productIsEylan;
        });
        setSelectedProduct(catalog[0] || null);
        setFlow("renew");
        setSheetStep(0);
      }
    } catch (err: any) {
      setCategoryPickError(
        err?.response?.data?.message ||
          err?.message ||
          t("ذخیره دسته‌بندی ناموفق بود", "Could not save category"),
      );
    }
  };

  const bottomTabs = [
    { id: "home", label: t("خانه", "Home"), icon: Package },
    { id: "orders", label: t("سفارش", "Orders"), icon: ShoppingBag },
    {
      id: "alerts",
      label: t("اعلان", "Alerts"),
      icon: Bell,
      badge: unreadCount || undefined,
    },
  ];

  return (
    <StoreShell
      store={{
        title: data.store?.title || "Customer Dashboard",
        slug: data.store?.slug || "",
        branding: data.branding,
      }}
      topBar={
        tab === "home" ? (
          <PortalTopBarLabel />
        ) : (
          <div className="flex w-full items-center justify-between gap-3">
            <PortalTopBarLabel />
            <button
              type="button"
              onClick={() => logout.mutateAsync().then(goShop)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
              aria-label="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        )
      }
    >
      <MotionPage className={isFa ? "font-[Vazirmatn,Tahoma,sans-serif]" : ""}>
        {tab === "home" ? (
          <section className="mb-5 sm:mb-7">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-zinc-500">
                  {t("سلام", "Hello")}
                </p>
                <h1 className="mt-0.5 truncate text-[1.75rem] font-black tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-[2rem]">
                  {data.profile?.name || t("مشتری عزیز", "Customer")}
                </h1>
              </div>
              <button
                type="button"
                onClick={() => logout.mutateAsync().then(goShop)}
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-2xl border border-black/[0.06] bg-white text-zinc-600 shadow-sm transition active:scale-95 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300"
                aria-label="Logout"
              >
                <LogOut size={18} />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
              <StatTile label={t("سرویس فعال", "Active services")} value={activeCount} tone="success" />
              <StatTile label={t("سفارش در صف", "Orders in queue")} value={pendingCount} tone="warn" />
              <button
                type="button"
                onClick={() => {
                  setFlow("buy");
                  setSheetStep(0);
                  setSelectedProduct(null);
                  setSelectedAddonIds([]);
                  setCouponCode("");
                }}
                className="col-span-2 flex min-h-[72px] cursor-pointer items-center justify-center gap-2 rounded-[1.35rem] bg-[color:var(--store-primary)] px-4 text-[15px] font-bold text-white shadow-[0_14px_32px_-16px_var(--store-primary)] transition active:scale-[0.98] sm:col-span-2"
              >
                <Plus size={18} /> {t("سفارش جدید", "New order")}
              </button>
            </div>
          </section>
        ) : null}

        {/* Desktop tabs */}
        <div className="mb-5 hidden gap-1 rounded-[1.35rem] border border-black/[0.05] bg-white p-1.5 shadow-sm dark:border-white/[0.06] dark:bg-zinc-900 lg:mb-7 lg:flex lg:max-w-md">
          {bottomTabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as DashTab)}
              className={`flex-1 cursor-pointer rounded-[1.1rem] px-3 py-2.5 text-[13px] font-semibold transition ${
                tab === item.id
                  ? "bg-[color:var(--store-primary)] text-white"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              {item.label}
              {item.badge ? ` (${item.badge})` : ""}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            {tab === "home" ? (
              <HomeTab
                data={data}
                showToken={showToken}
                setShowToken={setShowToken}
                copiedToken={copiedToken}
                setCopiedToken={setCopiedToken}
                claimService={claimService}
                hideService={hideService}
                categories={categories}
                onRenew={startRenew}
              />
            ) : null}
            {tab === "orders" ? (
              <OrdersTab
                data={data}
                cancelOrder={cancelOrder}
                onBuy={() => {
                  setFlow("buy");
                  setSheetStep(0);
                  setSelectedProduct(null);
                  setSelectedAddonIds([]);
                  setCouponCode("");
                }}
              />
            ) : null}
            {tab === "alerts" ? (
              <AlertsTab
                data={data}
                markNotificationRead={markNotificationRead}
                markAllNotificationsRead={markAllNotificationsRead}
              />
            ) : null}
          </motion.div>
        </AnimatePresence>
      </MotionPage>

      <BottomTabBar
        tabs={bottomTabs}
        value={tab}
        onChange={(id) => setTab(id as DashTab)}
      />

      {flow !== "idle" ? (
        <CheckoutSheet
          mode={flow}
          step={sheetStep}
          setStep={setSheetStep}
          categories={categories}
          products={flow === "renew" ? renewProducts : products}
          selectedProduct={selectedProduct}
          setSelectedProduct={setSelectedProduct}
          selectedAddonIds={selectedAddonIds}
          setSelectedAddonIds={setSelectedAddonIds}
          couponCode={couponCode}
          setCouponCode={setCouponCode}
          renewingService={renewingService}
          configName={configName}
          setConfigName={setConfigName}
          receiptText={receiptText}
          setReceiptText={setReceiptText}
          receiptPreview={receiptPreview}
          onReceiptFile={onReceiptFile}
          onClose={resetFlow}
          submitting={orderMutation.isPending || renewMutation.isPending}
          error={(orderMutation.error || renewMutation.error) as any}
          onSubmit={() => {
            if (flow === "buy") orderMutation.mutate();
            else renewMutation.mutate();
          }}
          primary={primary}
          payment={data?.store?.payment || null}
          storeSlug={data?.store?.slug}
        />
      ) : null}

      {categoryPickService ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 sm:items-center">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close"
            onClick={() => setCategoryPickService(null)}
          />
          <div className="relative z-10 w-full max-w-md rounded-t-[1.5rem] bg-white p-5 shadow-2xl dark:bg-zinc-900 sm:rounded-2xl">
            <div className="text-sm font-bold">
              {t("دسته‌بندی سرویس را مشخص کنید", "Choose the service category")}
            </div>
            <p className="mt-1.5 text-xs text-zinc-500">
              {t(
                "برای تمدید باید بدانیم این سرویس از کدام دسته بوده است.",
                "Renewal needs to know which category this service belongs to.",
              )}
            </p>
            <select
              value={categoryPickId}
              onChange={(e) => {
                setCategoryPickId(e.target.value);
                setCategoryPickError("");
              }}
              className="mt-4 h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm outline-none dark:border-zinc-700 dark:bg-zinc-950"
            >
              {!categories.length ? (
                <option value="">{t("دسته‌بندی‌ای موجود نیست", "No categories available")}</option>
              ) : (
                categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))
              )}
            </select>
            {categoryPickError ? (
              <p className="mt-2 text-xs text-red-500">{categoryPickError}</p>
            ) : null}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setCategoryPickService(null)}
                className="flex-1 rounded-xl border border-zinc-200 px-3 py-2.5 text-xs font-semibold dark:border-zinc-700"
              >
                {t("انصراف", "Cancel")}
              </button>
              <button
                type="button"
                disabled={assignServiceCategory.isPending || !categoryPickId}
                onClick={() => void submitCategoryPick()}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[color:var(--store-primary)] px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                {assignServiceCategory.isPending ? (
                  <LoaderCircle size={14} className="animate-spin" />
                ) : null}
                {t("ذخیره و ادامه", "Save & continue")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </StoreShell>
  );
}

function HomeTab({
  data,
  showToken,
  setShowToken,
  copiedToken,
  setCopiedToken,
  claimService,
  hideService,
  categories,
  onRenew,
}: {
  data: CustomerDashboard;
  showToken: boolean;
  setShowToken: (v: boolean) => void;
  copiedToken: boolean;
  setCopiedToken: (v: boolean) => void;
  claimService: ReturnType<typeof useCustomerSession>["claimService"];
  hideService: ReturnType<typeof useCustomerSession>["hideService"];
  categories: StorefrontCategory[];
  onRenew: (service: CustomerService) => void;
}) {
  const { t, isFa } = useStorefrontLocale();
  const services = data.services || [];
  const [linkInput, setLinkInput] = useState("");
  const [linkCategoryId, setLinkCategoryId] = useState(categories[0]?.id || "");
  const [linkError, setLinkError] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);

  useEffect(() => {
    if (!linkCategoryId && categories[0]?.id) setLinkCategoryId(categories[0].id);
  }, [categories, linkCategoryId]);

  const submitLink = async (mode: "claim" | "renew") => {
    setLinkError("");
    const token = parseSubscriptionToken(linkInput);
    if (!token) {
      setLinkError(t("لینک ساب معتبر نیست", "Invalid subscription link"));
      return;
    }
    if (!linkCategoryId) {
      setLinkError(t("دسته‌بندی را انتخاب کنید", "Please select a category"));
      return;
    }
    try {
      const result = await claimService.mutateAsync({
        subscriptionLink: linkInput.trim() || token,
        categoryId: linkCategoryId,
      });
      setLinkInput("");
      setLinkOpen(false);
      if (mode === "renew" && result.service) onRenew(result.service);
    } catch (err: any) {
      setLinkError(
        err?.response?.data?.message ||
          err?.message ||
          t("سرویس یافت نشد", "Service not found"),
      );
    }
  };

  return (
    <div className="space-y-6 lg:space-y-8">
      <Surface>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
              {t("شناسه ورود وب", "Web access token")}
            </div>
            <div className="mt-1.5 font-mono text-sm font-semibold tracking-wide" dir="ltr">
              {showToken ? data.token : "••••-••••-••••"}
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              {t("فقط برای ورود از مرورگر — در مینی‌اپ لازم نیست.", "Only for browser login — not needed in Mini App.")}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="rounded-xl border border-zinc-200 px-3.5 py-2.5 text-xs font-semibold dark:border-zinc-700"
            >
              {showToken ? t("مخفی", "Hide") : t("نمایش", "Show")}
            </button>
            <button
              type="button"
              onClick={async () => {
                await copyToClipboard(data.token);
                setCopiedToken(true);
                setTimeout(() => setCopiedToken(false), 1500);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3.5 py-2.5 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              <Copy size={13} /> {copiedToken ? t("کپی شد", "Copied") : t("کپی", "Copy")}
            </button>
          </div>
        </div>
      </Surface>

      <div>
        <SectionHeading
          title={t("سرویس‌ها", "Services")}
          subtitle={t("اشتراک‌های فعال و قبلی شما", "Your active and past subscriptions")}
          action={
            <button
              type="button"
              onClick={() => {
                setLinkOpen((v) => !v);
                setLinkError("");
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-bold dark:border-zinc-700"
            >
              <Link2 size={13} />
              {linkOpen
                ? t("بستن", "Close")
                : t("افزودن با لینک ساب", "Add by sub link")}
            </button>
          }
        />

        {linkOpen ? (
          <Surface className="mb-3">
            <div className="flex items-start gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ background: "color-mix(in srgb, var(--store-primary) 12%, transparent)" }}
              >
                <Link2 size={18} style={{ color: "var(--store-primary)" }} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold">{t("افزودن یا تمدید با لینک ساب", "Add or renew with sub link")}</div>
                <p className="mt-1 text-xs text-zinc-500">
                  {t(
                    "لینک سابسکریپشن قبلی را بچسبانید و دسته‌بندی آن را انتخاب کنید.",
                    "Paste your previous subscription link and choose its category.",
                  )}
                </p>
                <textarea
                  value={linkInput}
                  onChange={(e) => {
                    setLinkInput(e.target.value);
                    setLinkError("");
                  }}
                  placeholder={t("https://…/s/abc123", "https://…/s/abc123")}
                  dir="ltr"
                  rows={2}
                  className="mt-3 w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 font-mono text-[12px] outline-none focus:border-[color:var(--store-primary)] dark:border-zinc-700 dark:bg-zinc-900"
                />
                <label className="mt-3 block text-[11px] font-semibold text-zinc-500">
                  {t("دسته‌بندی سرویس", "Service category")}
                </label>
                <select
                  value={linkCategoryId}
                  onChange={(e) => {
                    setLinkCategoryId(e.target.value);
                    setLinkError("");
                  }}
                  className="mt-1.5 h-10 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm outline-none dark:border-zinc-700 dark:bg-zinc-900"
                >
                  {!categories.length ? (
                    <option value="">{t("دسته‌بندی‌ای موجود نیست", "No categories available")}</option>
                  ) : (
                    categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))
                  )}
                </select>
                {linkError ? <p className="mt-2 text-xs text-red-500">{linkError}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={claimService.isPending || !linkInput.trim() || !linkCategoryId}
                    onClick={() => void submitLink("claim")}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[color:var(--store-primary)] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {claimService.isPending ? <LoaderCircle size={14} className="animate-spin" /> : null}
                    {t("افزودن سرویس", "Add service")}
                  </button>
                  <button
                    type="button"
                    disabled={claimService.isPending || !linkInput.trim() || !linkCategoryId}
                    onClick={() => void submitLink("renew")}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-4 py-2.5 text-xs font-semibold dark:border-zinc-700"
                  >
                    {t("تمدید", "Renew")}
                  </button>
                </div>
              </div>
            </div>
          </Surface>
        ) : null}

        <motion.div className="grid gap-3 lg:grid-cols-2 lg:gap-4" variants={staggerContainer} initial="initial" animate="animate">
          {services.map((service) => {
            const native = String(service.subUrl || "").trim();
            const isEylan =
              service.providerId === "eylan" ||
              service.deliveryHint === "eylan_download" ||
              String(service.id || "").startsWith("eylan:");
            const link = isEylan
              ? native && /^https?:\/\//i.test(native) && /\/sub\/[^/]+\/[^/]+/i.test(native)
                ? native
                : ""
              : native && /^https?:\/\//i.test(native)
                ? native
                : buildSubscriptionLink(service.subId, service.subToken, service.subUrl);
            return (
              <motion.div key={service.id} variants={staggerItem}>
                <ServiceCard
                  service={service}
                  subLink={link}
                  onCopy={() => {
                    if (link) void copyToClipboard(link);
                  }}
                  onOpen={() => {
                    if (link) window.open(link, "_blank", "noopener,noreferrer");
                  }}
                  onRenew={() => onRenew(service)}
                  onHide={() => {
                    if (
                      window.confirm(
                        t(
                          "فقط از لیست شما حذف می‌شود؛ خود سرویس حذف نمی‌شود.",
                          "Removed from your list only — the service itself is not deleted.",
                        ),
                      )
                    ) {
                      hideService.mutate(service.id);
                    }
                  }}
                  hiding={hideService.isPending}
                />
              </motion.div>
            );
          })}
          {!services.length ? (
            <EmptyState
              title={t("هنوز سرویسی ندارید.", "No services yet.")}
              hint={t("با سفارش جدید اولین اشتراک خود را فعال کنید.", "Place a new order to activate your first service.")}
            />
          ) : null}
        </motion.div>
      </div>
    </div>
  );
}

function OrdersTab({
  data,
  cancelOrder,
  onBuy,
}: {
  data: CustomerDashboard;
  cancelOrder: ReturnType<typeof useCustomerSession>["cancelOrder"];
  onBuy: () => void;
}) {
  const { t, isFa } = useStorefrontLocale();
  const orders = data.orders || [];

  return (
    <div className="space-y-4 lg:space-y-6">
      <SectionHeading
        title={t("سفارش‌ها", "Orders")}
        subtitle={t("پیگیری و مدیریت درخواست‌ها", "Track and manage your requests")}
        action={
          <button
            type="button"
            onClick={onBuy}
            className="inline-flex items-center gap-1 rounded-full bg-[color:var(--store-primary)] px-3.5 py-2 text-xs font-bold text-white"
          >
            <ShoppingBag size={13} /> {t("خرید", "Buy")}
          </button>
        }
      />
      <div className="grid gap-3 lg:grid-cols-2 lg:gap-4">
        {orders.map((order) => (
          <Surface key={order.id}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold">{order.productName}</div>
                {order.configName ? (
                  <div className="mt-0.5 truncate font-mono text-xs text-zinc-600 dark:text-zinc-400" dir="ltr">
                    {order.isRenewal
                      ? t(`تمدید: ${order.configName}`, `Renew: ${order.configName}`)
                      : order.configName}
                  </div>
                ) : order.isRenewal ? (
                  <div className="mt-0.5 text-xs text-amber-600">{t("تمدید سرویس", "Service renewal")}</div>
                ) : null}
                <div className="mt-1 text-xs text-zinc-500">
                  {order.trackingCode} ·{" "}
                  {order.status === "PENDING_PAYMENT"
                    ? t("در انتظار پرداخت", "Pending payment")
                    : order.status === "PAYMENT_SUBMITTED"
                      ? t("پرداخت ارسال شد", "Payment submitted")
                      : order.status === "UNDER_REVIEW"
                        ? t("در حال بررسی", "Under review")
                        : order.status === "COMPLETED" || order.status === "FULFILLED" || order.status === "ACTIVE" || order.status === "RENEWED"
                          ? t("تکمیل شده", "Completed")
                          : order.status === "CANCELLED"
                            ? t("لغو شده", "Cancelled")
                            : order.status.replace(/_/g, " ")}
                </div>
              </div>
              <a
                href={`/track/${encodeURIComponent(order.trackingCode)}`}
                className="shrink-0 text-xs font-bold text-[color:var(--store-primary)]"
              >
                {t("پیگیری", "Track")}
              </a>
            </div>
            {["PENDING_PAYMENT", "PAYMENT_SUBMITTED", "UNDER_REVIEW"].includes(order.status) ? (
              <button
                type="button"
                className="mt-3 text-xs font-semibold text-rose-500"
                onClick={() => cancelOrder.mutate(order.id)}
              >
                {t("لغو سفارش", "Cancel order")}
              </button>
            ) : null}
          </Surface>
        ))}
        {!orders.length ? (
          <div className="rounded-[1.5rem] border border-dashed border-zinc-300 px-4 py-12 text-center text-sm text-zinc-500 dark:border-zinc-700 lg:col-span-2">
            {t("سفارشی ثبت نشده.", "No orders yet.")}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AlertsTab({
  data,
  markNotificationRead,
  markAllNotificationsRead,
}: {
  data: CustomerDashboard;
  markNotificationRead: ReturnType<typeof useCustomerSession>["markNotificationRead"];
  markAllNotificationsRead: ReturnType<typeof useCustomerSession>["markAllNotificationsRead"];
}) {
  const { t } = useStorefrontLocale();
  const items = data.notifications || [];

  return (
    <div className="space-y-4 lg:space-y-6">
      <SectionHeading
        title={t("اعلان‌ها", "Alerts")}
        action={
          items.some((n) => !n.isRead) ? (
            <button
              type="button"
              onClick={() => markAllNotificationsRead.mutate()}
              className="text-xs font-semibold text-[color:var(--store-primary)]"
            >
              {t("خواندن همه", "Mark all read")}
            </button>
          ) : null
        }
      />
      <div className="space-y-2.5 lg:space-y-3">
        {items.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => {
              if (!n.isRead) markNotificationRead.mutate(n.id);
            }}
            className={`w-full rounded-[1.35rem] border p-4 text-start transition lg:p-5 ${
              n.isRead
                ? "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                : "border-[color:var(--store-primary)]/30 bg-[color:var(--store-primary)]/5"
            }`}
          >
            <div className="flex items-start gap-3">
              <Bell size={16} className="mt-0.5 shrink-0 text-[color:var(--store-primary)]" />
              <div className="min-w-0">
                <div className="font-semibold">{n.title}</div>
                {n.message ? <p className="mt-1 text-sm leading-relaxed text-zinc-500">{n.message}</p> : null}
              </div>
            </div>
          </button>
        ))}
        {!items.length ? (
          <div className="rounded-[1.5rem] border border-dashed border-zinc-300 px-4 py-12 text-center text-sm text-zinc-500 dark:border-zinc-700">
            {t("اعلانی نیست.", "No alerts.")}
          </div>
        ) : null}
      </div>
    </div>
  );
}
