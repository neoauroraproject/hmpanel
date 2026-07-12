"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  Bell,
  ChevronLeft,
  Copy,
  ExternalLink,
  LoaderCircle,
  LogOut,
  Package,
  Plus,
  RefreshCw,
  ShoppingBag,
  Upload,
  X,
} from "lucide-react";
import { copyToClipboard } from "@/lib/clipboard";
import { publicApi } from "@/lib/api";
import { useCustomerSession } from "@/modules/storefront/session";
import { buildSubscriptionLink } from "@/modules/storefront/subscription";
import { useStorefrontLocale } from "@/modules/storefront/locale";
import { compressReceiptImage } from "@/modules/storefront/receipt-image";
import type { CustomerDashboard, CustomerService, StorefrontProduct } from "@/modules/storefront/types";
import { StoreShell } from "@/modules/storefront/ui";
import { scrollToTop } from "@/modules/storefront/scroll";

type FlowMode = "idle" | "buy" | "renew";
type DashTab = "home" | "orders" | "alerts";

export default function CustomerDashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isLoading, error, logout, markNotificationRead, markAllNotificationsRead, cancelOrder } =
    useCustomerSession();

  const [tab, setTab] = useState<DashTab>("home");
  const [flow, setFlow] = useState<FlowMode>("idle");
  const [selectedProduct, setSelectedProduct] = useState<StorefrontProduct | null>(null);
  const [renewingService, setRenewingService] = useState<CustomerService | null>(null);
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
    if (!isLoading && (error || !data)) router.replace("/portal");
  }, [data, error, isLoading, router]);

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
  const renewProducts = data.renewProducts?.length ? data.renewProducts : products;

  return (
    <StoreShell
      store={{
        title: data.store?.title || "Customer Dashboard",
        slug: data.store?.slug || "",
        branding: data.branding,
      }}
    >
      <div className="px-4 pb-28 pt-4 sm:px-6">
        {/* Hero */}
        <section className="mb-5 overflow-hidden rounded-[1.6rem] bg-[color:var(--store-primary)] p-5 text-white shadow-[0_18px_40px_-24px_var(--store-primary)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
                Portal
              </p>
              <h1 className="mt-1 truncate text-[1.45rem] font-bold leading-tight">
                {data.profile?.name || "Customer"}
              </h1>
              <p className="mt-1 text-sm text-white/80">
                {(data.activeServices || []).length} active · {(data.pendingOrders || []).length} pending
              </p>
            </div>
            <button
              type="button"
              onClick={() => logout.mutateAsync().then(() => router.replace("/portal"))}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 active:scale-95"
              aria-label="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setFlow("buy");
                setSheetStep(0);
                setSelectedProduct(products[0] || null);
              }}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-white text-sm font-bold text-zinc-900 active:scale-[0.98]"
            >
              <Plus size={16} /> New order
            </button>
            <button
              type="button"
              onClick={() => setTab("home")}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-white/15 text-sm font-semibold active:scale-[0.98]"
            >
              <Package size={16} /> Services
            </button>
          </div>
        </section>

        {/* Segmented tabs */}
        <div className="mb-4 grid grid-cols-3 gap-1 rounded-2xl border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900">
          {(
            [
              { id: "home", label: "Home" },
              { id: "orders", label: "Orders" },
              { id: "alerts", label: unreadCount ? `Alerts (${unreadCount})` : "Alerts" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`rounded-xl px-2 py-2.5 text-[13px] font-semibold transition ${
                tab === item.id
                  ? "bg-[color:var(--store-primary)] text-white"
                  : "text-zinc-500"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "home" ? (
          <HomeTab
            data={data}
            showToken={showToken}
            setShowToken={setShowToken}
            copiedToken={copiedToken}
            setCopiedToken={setCopiedToken}
            onRenew={(service) => {
              setRenewingService(service);
              setSelectedProduct(renewProducts[0] || null);
              setFlow("renew");
              setSheetStep(0);
            }}
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
      </div>

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
        />
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
  onRenew,
}: {
  data: CustomerDashboard;
  showToken: boolean;
  setShowToken: (v: boolean) => void;
  copiedToken: boolean;
  setCopiedToken: (v: boolean) => void;
  onRenew: (service: CustomerService) => void;
}) {
  const { t } = useStorefrontLocale();
  const services = data.services || [];

  return (
    <div className="space-y-4">
      <div className="rounded-[1.35rem] border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              {t("شناسه وب", "Web access token")}
            </div>
            <div className="mt-1 font-mono text-sm font-semibold">
              {showToken ? data.token : "••••-••••-••••"}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold dark:border-zinc-700"
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
              className="inline-flex items-center gap-1 rounded-xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              <Copy size={13} /> {copiedToken ? t("کپی شد", "Copied") : t("کپی", "Copy")}
            </button>
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-2 px-0.5 text-lg font-bold">{t("سرویس‌ها", "Services")}</h2>
        <div className="space-y-2.5">
          {services.map((service) => {
            const link = buildSubscriptionLink(service.subId, service.subToken);
            return (
              <div
                key={service.id}
                className="rounded-[1.35rem] border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{service.remark || service.email}</div>
                    <div className="mt-1 text-xs text-zinc-500">{service.expiryTime}</div>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
                      service.status === "active"
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                        : service.status === "expired"
                          ? "bg-rose-500/15 text-rose-700 dark:text-rose-400"
                          : "bg-zinc-500/15 text-zinc-600"
                    }`}
                  >
                    {service.status}
                  </span>
                </div>
                <div className="mt-3 flex gap-2">
                  {link ? (
                    <a
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[color:var(--store-primary)] text-sm font-semibold text-white active:scale-[0.98]"
                    >
                      Open <ExternalLink size={14} />
                    </a>
                  ) : null}
                  {service.status !== "disabled" ? (
                    <button
                      type="button"
                      onClick={() => onRenew(service)}
                      className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 text-sm font-semibold dark:border-zinc-700 active:scale-[0.98]"
                    >
                      <RefreshCw size={14} /> {t("تمدید", "Renew")}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
          {!services.length ? (
            <div className="rounded-[1.35rem] border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
              {t("هنوز سرویسی ندارید.", "No services yet.")}
            </div>
          ) : null}
        </div>
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
  const { t } = useStorefrontLocale();
  const orders = data.orders || [];

  return (
    <div className="space-y-2.5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-lg font-bold">{t("سفارش‌ها", "Orders")}</h2>
        <button
          type="button"
          onClick={onBuy}
          className="inline-flex items-center gap-1 rounded-full bg-[color:var(--store-primary)] px-3 py-1.5 text-xs font-bold text-white"
        >
          <ShoppingBag size={13} /> {t("خرید", "Buy")}
        </button>
      </div>
      {orders.map((order) => (
        <div
          key={order.id}
          className="rounded-[1.35rem] border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-semibold">{order.productName}</div>
              <div className="mt-1 text-xs text-zinc-500">
                {order.trackingCode} · {order.status.replace(/_/g, " ")}
              </div>
            </div>
            <a
              href={`/track/${encodeURIComponent(order.trackingCode)}`}
              className="text-xs font-bold text-[color:var(--store-primary)]"
            >
              Track
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
        </div>
      ))}
      {!orders.length ? (
        <div className="rounded-[1.35rem] border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
          {t("سفارشی ثبت نشده.", "No orders yet.")}
        </div>
      ) : null}
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
    <div className="space-y-2.5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-lg font-bold">{t("اعلان‌ها", "Alerts")}</h2>
        {items.some((n) => !n.isRead) ? (
          <button
            type="button"
            onClick={() => markAllNotificationsRead.mutate()}
            className="text-xs font-semibold text-[color:var(--store-primary)]"
          >
            {t("خواندن همه", "Mark all read")}
          </button>
        ) : null}
      </div>
      {items.map((n) => (
        <button
          key={n.id}
          type="button"
          onClick={() => {
            if (!n.isRead) markNotificationRead.mutate(n.id);
          }}
          className={`w-full rounded-[1.35rem] border p-4 text-left dark:border-zinc-800 ${
            n.isRead
              ? "border-zinc-200 bg-white dark:bg-zinc-900"
              : "border-[color:var(--store-primary)]/30 bg-[color:var(--store-primary)]/5"
          }`}
        >
          <div className="flex items-start gap-2">
            <Bell size={16} className="mt-0.5 shrink-0 text-[color:var(--store-primary)]" />
            <div className="min-w-0">
              <div className="font-semibold">{n.title}</div>
              {n.message ? <p className="mt-1 text-sm text-zinc-500">{n.message}</p> : null}
            </div>
          </div>
        </button>
      ))}
      {!items.length ? (
        <div className="rounded-[1.35rem] border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
          {t("اعلانی نیست.", "No alerts.")}
        </div>
      ) : null}
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
}) {
  const { t, formatToman } = useStorefrontLocale();
  const maxStep = mode === "buy" ? 2 : 1;

  const goNext = () => {
    if (step === 0 && !selectedProduct) return;
    if (mode === "buy" && step === 1 && !configName.trim()) return;
    if (step >= maxStep) onSubmit();
    else setStep((s) => s + 1);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/45 sm:items-center sm:justify-center sm:p-4">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[1.75rem] bg-white dark:bg-zinc-950 sm:rounded-[1.75rem]">
        <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-900"
          >
            {step === 0 ? <X size={18} /> : <ChevronLeft size={20} />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="font-semibold">
              {mode === "renew" ? t("تمدید سرویس", "Renew service") : t("سفارش جدید", "New order")}
            </div>
            <div className="text-[11px] text-zinc-500">
              {t("مرحله", "Step")} {step + 1}/{maxStep + 1}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {mode === "renew" && renewingService ? (
            <div className="rounded-2xl bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-900">
              {t("تمدید", "Renewing")}: <b>{renewingService.remark || renewingService.email}</b>
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
                    className={`flex w-full items-center justify-between rounded-2xl border px-3.5 py-3.5 text-left ${
                      active
                        ? "border-[color:var(--store-primary)] bg-[color:var(--store-primary)]/10"
                        : "border-zinc-200 dark:border-zinc-800"
                    }`}
                  >
                    <div>
                      <div className="font-semibold">{p.name}</div>
                      <div className="text-xs text-zinc-500">
                        {p.traffic} · {p.durationDays}d
                      </div>
                    </div>
                    <div className="text-sm font-bold text-[color:var(--store-primary)]">
                      {p.priceToman ? formatToman(p.priceToman) : `$${p.priceUsd}`}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}

          {mode === "buy" && step === 1 ? (
            <label className="block space-y-2 text-sm">
              <span className="font-medium">{t("نام کانفیگ", "Config name")}</span>
              <input
                className="w-full rounded-2xl border border-zinc-200 bg-transparent px-4 py-3.5 outline-none dark:border-zinc-800"
                style={{ fontSize: 16 }}
                value={configName}
                onChange={(e) => setConfigName(e.target.value)}
                placeholder="phone-1"
              />
            </label>
          ) : null}

          {(mode === "buy" && step === 2) || (mode === "renew" && step === 1) ? (
            <>
              <label className="block space-y-2 text-sm">
                <span className="font-medium">{t("یادداشت پرداخت", "Payment note")}</span>
                <textarea
                  rows={2}
                  className="w-full rounded-2xl border border-zinc-200 bg-transparent px-4 py-3 outline-none dark:border-zinc-800"
                  style={{ fontSize: 16 }}
                  value={receiptText}
                  onChange={(e) => setReceiptText(e.target.value)}
                />
              </label>
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-zinc-300 px-4 py-7 text-sm dark:border-zinc-700">
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
            disabled={submitting || (step === 0 && !selectedProduct)}
            onClick={goNext}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-bold text-white disabled:opacity-50"
            style={{ background: primary }}
          >
            {submitting ? <LoaderCircle size={18} className="animate-spin" /> : null}
            {step >= maxStep ? t("ثبت", "Submit") : t("بعدی", "Next")}
          </button>
        </div>
      </div>
    </div>
  );
}
