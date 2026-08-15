"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  ChevronLeft,
  Copy,
  Link2,
  LoaderCircle,
  LogOut,
  Package,
  Plus,
  ShoppingBag,
  Upload,
  X,
} from "lucide-react";
import { copyToClipboard } from "@/lib/clipboard";
import { publicApi } from "@/lib/api";
import { formatQuotaLabel } from "@/lib/format";
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
  FieldBlock,
  MotionPage,
  SectionHeading,
  Surface,
  BottomTabBar,
  StatTile,
  EmptyState,
  springSoft,
  staggerContainer,
  staggerItem,
} from "@/modules/storefront/design";
import { BankCardVisual, resolvePaymentCards } from "@/modules/storefront/BankCardVisual";
import { usePortalTelegramGate } from "@/modules/storefront/tma/usePortalTelegramGate";
import { StorefrontLocaleProvider, useStorefrontLocale } from "@/modules/storefront/locale";
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
                  setSelectedProduct(products[0] || null);
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
                  setSelectedProduct(products[0] || null);
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
          products={flow === "renew" ? renewProducts : products}
          selectedProduct={selectedProduct}
          setSelectedProduct={setSelectedProduct}
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

function CheckoutSheet({
  mode,
  step,
  setStep,
  products,
  selectedProduct,
  setSelectedProduct,
  renewingService,
  configName,
  setConfigName,
  receiptText,
  setReceiptText,
  receiptPreview,
  onReceiptFile,
  onClose,
  submitting,
  error,
  onSubmit,
  primary,
  payment,
}: {
  mode: FlowMode;
  step: number;
  setStep: Dispatch<SetStateAction<number>>;
  products: StorefrontProduct[];
  selectedProduct: StorefrontProduct | null;
  setSelectedProduct: (p: StorefrontProduct | null) => void;
  renewingService: CustomerService | null;
  configName: string;
  setConfigName: (v: string) => void;
  receiptText: string;
  setReceiptText: (v: string) => void;
  receiptPreview: string;
  onReceiptFile: (file?: File | null) => void;
  onClose: () => void;
  submitting: boolean;
  error: any;
  onSubmit: () => void;
  primary: string;
  payment: StorefrontStore["payment"] | null;
}) {
  const { t, formatToman, isFa } = useStorefrontLocale();
  const maxStep = mode === "buy" ? 2 : 1;

  const paymentCards = resolvePaymentCards(payment);

  const goNext = () => {
    if (step === 0 && !selectedProduct) return;
    if (mode === "buy" && step === 1 && !configName.trim()) return;
    if (
      ((mode === "buy" && step === 2) || (mode === "renew" && step === 1)) &&
      !receiptText.trim() &&
      !receiptPreview
    ) {
      return;
    }
    if (step >= maxStep) onSubmit();
    else setStep((s) => s + 1);
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-6">
      <button type="button" className="absolute inset-0 cursor-pointer" aria-label="Close" onClick={onClose} />
      <motion.div
        initial={{ y: 48, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={springSoft}
        className={`relative z-10 flex max-h-[min(92dvh,calc(100dvh-1.5rem))] w-full max-w-lg flex-col overflow-hidden rounded-t-[1.85rem] bg-white shadow-2xl dark:bg-zinc-950 sm:max-h-[min(90dvh,calc(100dvh-3rem))] sm:rounded-[1.85rem] ${
          isFa ? "font-[Vazirmatn,Tahoma,sans-serif]" : ""
        }`}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-700 sm:hidden" />
        <div className="flex items-center gap-2 border-b border-black/[0.05] px-3 py-3 dark:border-white/10">
          <button
            type="button"
            onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-2xl bg-[#F5F5F7] dark:bg-zinc-900"
          >
            {step === 0 ? <X size={18} /> : <ChevronLeft size={20} className={isFa ? "rotate-180" : ""} />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="font-bold">
              {mode === "renew" ? t("تمدید سرویس", "Renew service") : t("سفارش جدید", "New order")}
            </div>
            <div className="text-[11px] text-zinc-500">
              {t("مرحله", "Step")} {step + 1}/{maxStep + 1}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          {mode === "renew" && renewingService ? (
            <div className="space-y-2">
              <div className="rounded-2xl bg-zinc-100 px-3.5 py-2.5 text-sm dark:bg-zinc-900">
                {t("تمدید", "Renewing")}: <b>{renewingService.remark || renewingService.email}</b>
              </div>
              <p className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-2.5 text-[13px] leading-relaxed text-emerald-800 dark:text-emerald-300">
                {t(
                  "حجم و زمان پلن انتخابی به سرویس فعلی اضافه می‌شود؛ مصرف قبلی و تنظیمات پاک نمی‌شوند.",
                  "Selected plan volume and days are added to this service. Used traffic and settings are kept.",
                )}
              </p>
            </div>
          ) : null}

          {step === 0 ? (
            <div className="space-y-2">
              {products.map((p) => {
                const active = selectedProduct?.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedProduct(p)}
                    className={`w-full rounded-2xl border px-3.5 py-3.5 text-start transition ${
                      active
                        ? "border-[color:var(--store-primary)] bg-[color:var(--store-primary)]/10"
                        : "border-zinc-200 dark:border-zinc-800"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold">{p.name}</div>
                        <div className="text-xs text-zinc-500">
                          {formatQuotaLabel(p.traffic, p.durationDays, { locale: isFa ? "fa" : "en" })}
                        </div>
                      </div>
                      <div className="shrink-0 text-sm font-bold text-[color:var(--store-primary)]">
                        {p.priceToman ? formatToman(p.priceToman) : `$${p.priceUsd}`}
                      </div>
                    </div>
                    {active && p.description ? (
                      <p className="mt-2.5 whitespace-pre-line text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                        {p.description}
                      </p>
                    ) : null}
                  </button>
                );
              })}
              {!products.length ? (
                <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
                  {mode === "renew"
                    ? t(
                        "پلنی برای تمدید در این دسته‌بندی موجود نیست.",
                        "No renewal plans available in this category.",
                      )
                    : t("محصولی موجود نیست.", "No products available.")}
                </div>
              ) : null}
            </div>
          ) : null}

          {mode === "buy" && step === 1 ? (
            <FieldBlock
              title={t("نام کانفیگ", "Config name")}
              hint={t("این نام روی سرویس شما نمایش داده می‌شود.", "Shown on your service list.")}
              accent
            >
              <input
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3.5 outline-none dark:border-zinc-700 dark:bg-zinc-950"
                style={{ fontSize: 16 }}
                value={configName}
                onChange={(e) => setConfigName(e.target.value)}
                placeholder={t("مثلاً phone-1", "e.g. phone-1")}
              />
            </FieldBlock>
          ) : null}

          {(mode === "buy" && step === 2) || (mode === "renew" && step === 1) ? (
            <>
              <div className="space-y-1">
                <div className="text-sm font-bold">{t("پرداخت کارت به کارت", "Card-to-card payment")}</div>
                <p className="text-xs text-zinc-500">
                  {t(
                    "مبلغ را به کارت زیر واریز کنید، سپس رسید یا کد پیگیری را بفرستید.",
                    "Transfer to the card below, then submit receipt or tracking code.",
                  )}
                </p>
              </div>
              {paymentCards.length ? (
                <div className="space-y-3">
                  {paymentCards.map((card) => (
                    <BankCardVisual
                      key={card.id}
                      bankName={card.bankName}
                      cardNumber={card.cardNumber}
                      cardHolder={card.cardHolder}
                      iban={card.iban}
                      instructions={card.instructions}
                      transferLabel={t("کارت به کارت", "Card to Card")}
                      copyLabel={t("کپی شماره کارت", "Copy card number")}
                      copiedLabel={t("کپی شد", "Copied")}
                    />
                  ))}
                </div>
              ) : (
                <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-sm text-amber-800 dark:text-amber-200">
                  {t(
                    "اطلاعات کارت پرداخت هنوز تنظیم نشده. با پشتیبانی تماس بگیرید.",
                    "Payment card is not configured yet. Please contact support.",
                  )}
                </p>
              )}
              <FieldBlock
                title={t("یادداشت پرداخت", "Payment note")}
                hint={t("رسید یا یادداشت الزامی است", "Receipt or note is required")}
                accent
              >
                <textarea
                  rows={2}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 outline-none dark:border-zinc-700 dark:bg-zinc-950"
                  style={{ fontSize: 16 }}
                  value={receiptText}
                  onChange={(e) => setReceiptText(e.target.value)}
                />
              </FieldBlock>
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-[1.35rem] border border-dashed border-zinc-300 px-4 py-8 text-sm dark:border-zinc-700">
                <Upload size={18} />
                {receiptPreview ? t("رسید پیوست شد", "Receipt attached") : t("آپلود رسید", "Upload receipt")}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onReceiptFile(e.target.files?.[0])}
                />
                {receiptPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={receiptPreview} alt="" className="max-h-32 rounded-xl object-contain" />
                ) : null}
              </label>
            </>
          ) : null}

          {error ? (
            <p className="text-sm text-rose-500">
              {error?.response?.data?.message || error?.message || "Failed"}
            </p>
          ) : null}
        </div>

        <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
          <button
            type="button"
            disabled={
              submitting ||
              (step === 0 && !selectedProduct) ||
              (((mode === "buy" && step === 2) || (mode === "renew" && step === 1)) &&
                !receiptText.trim() &&
                !receiptPreview)
            }
            onClick={goNext}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-bold text-white disabled:opacity-50"
            style={{ background: primary }}
          >
            {submitting ? <LoaderCircle size={18} className="animate-spin" /> : null}
            {step >= maxStep ? t("ثبت", "Submit") : t("بعدی", "Next")}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
