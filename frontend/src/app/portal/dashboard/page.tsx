"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  Bell,
  Copy,
  LoaderCircle,
  LogOut,
  Plus,
  QrCode,
  RefreshCw,
  Upload,
} from "lucide-react";
import QRCode from "react-qr-code";
import { copyToClipboard } from "@/lib/clipboard";
import { publicApi } from "@/lib/api";
import { useCustomerSession } from "@/modules/storefront/session";
import { buildSubscriptionLink } from "@/modules/storefront/subscription";
import { useStorefrontLocale } from "@/modules/storefront/locale";
import { compressReceiptImage } from "@/modules/storefront/receipt-image";
import type { StorefrontProduct } from "@/modules/storefront/types";
import {
  NotificationCard,
  OrderCard,
  PrimaryButton,
  ProductCard,
  SecondaryButton,
  ServiceCard,
  StoreShell,
} from "@/modules/storefront/ui";

type FlowMode = "idle" | "buy" | "renew";

export default function CustomerDashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isLoading, error, logout, markNotificationRead, markAllNotificationsRead, cancelOrder } =
    useCustomerSession();
  const [flow, setFlow] = useState<FlowMode>("idle");
  const [selectedProduct, setSelectedProduct] = useState<StorefrontProduct | null>(null);
  const [renewingService, setRenewingService] = useState<string | null>(null);
  const [configName, setConfigName] = useState("");
  const [receiptText, setReceiptText] = useState("");
  const [receiptImage, setReceiptImage] = useState("");
  const [receiptPreview, setReceiptPreview] = useState("");
  const [result, setResult] = useState<{ trackingCode: string; status?: string } | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  const unreadCount = useMemo(
    () => (data?.notifications ?? []).filter((item) => !item.isRead).length,
    [data?.notifications],
  );

  const renewMutation = useMutation({
    mutationFn: async () => {
      if (!renewingService || !selectedProduct) return null;
      return (
        await publicApi.post("/store/customer/renew", {
          clientId: renewingService,
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
      setResult({ trackingCode: response.trackingCode, status: response.status });
      setFlow("idle");
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
      setResult({ trackingCode: response.trackingCode, status: response.status });
      setFlow("idle");
      await queryClient.invalidateQueries({ queryKey: ["customer-session"] });
    },
  });

  useEffect(() => {
    if (!isLoading && (error || !data)) {
      router.replace("/portal");
    }
  }, [data, error, isLoading, router]);

  const resetFlow = () => {
    setFlow("idle");
    setSelectedProduct(null);
    setRenewingService(null);
    setConfigName("");
    setReceiptText("");
    setReceiptImage("");
    setReceiptPreview("");
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
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#f6f6f7]">
        <LoaderCircle className="animate-spin text-zinc-400" />
      </div>
    );
  }

  if (error || !data) return null;

  return (
    <StoreShell
      store={{
        title: data.store?.title || "Customer Dashboard",
        slug: data.store?.slug || "",
        branding: data.branding,
      }}
    >
      <PortalBody
        data={data}
        unreadCount={unreadCount}
        flow={flow}
        setFlow={setFlow}
        selectedProduct={selectedProduct}
        setSelectedProduct={setSelectedProduct}
        renewingService={renewingService}
        setRenewingService={setRenewingService}
        configName={configName}
        setConfigName={setConfigName}
        receiptText={receiptText}
        setReceiptText={setReceiptText}
        receiptImage={receiptImage}
        receiptPreview={receiptPreview}
        result={result}
        setResult={setResult}
        showQr={showQr}
        setShowQr={setShowQr}
        copiedToken={copiedToken}
        setCopiedToken={setCopiedToken}
        resetFlow={resetFlow}
        onReceiptFile={onReceiptFile}
        orderMutation={orderMutation}
        renewMutation={renewMutation}
        logout={logout}
        cancelOrder={cancelOrder}
        markNotificationRead={markNotificationRead}
        markAllNotificationsRead={markAllNotificationsRead}
        queryClient={queryClient}
        router={router}
      />
    </StoreShell>
  );
}

function PortalBody(props: {
  data: NonNullable<ReturnType<typeof useCustomerSession>["data"]>;
  unreadCount: number;
  flow: FlowMode;
  setFlow: (f: FlowMode) => void;
  selectedProduct: StorefrontProduct | null;
  setSelectedProduct: (p: StorefrontProduct | null) => void;
  renewingService: string | null;
  setRenewingService: (id: string | null) => void;
  configName: string;
  setConfigName: (v: string) => void;
  receiptText: string;
  setReceiptText: (v: string) => void;
  receiptImage: string;
  receiptPreview: string;
  result: { trackingCode: string; status?: string } | null;
  setResult: (v: { trackingCode: string; status?: string } | null) => void;
  showQr: boolean;
  setShowQr: (v: boolean) => void;
  copiedToken: boolean;
  setCopiedToken: (v: boolean) => void;
  resetFlow: () => void;
  onReceiptFile: (file?: File | null) => void;
  orderMutation: ReturnType<typeof useMutation>;
  renewMutation: ReturnType<typeof useMutation>;
  logout: ReturnType<typeof useCustomerSession>["logout"];
  cancelOrder: ReturnType<typeof useCustomerSession>["cancelOrder"];
  markNotificationRead: ReturnType<typeof useCustomerSession>["markNotificationRead"];
  markAllNotificationsRead: ReturnType<typeof useCustomerSession>["markAllNotificationsRead"];
  queryClient: ReturnType<typeof useQueryClient>;
  router: ReturnType<typeof useRouter>;
}) {
  const { t } = useStorefrontLocale();
  const {
    data,
    unreadCount,
    flow,
    setFlow,
    selectedProduct,
    setSelectedProduct,
    setRenewingService,
    configName,
    setConfigName,
    receiptText,
    setReceiptText,
    receiptImage,
    receiptPreview,
    result,
    setResult,
    showQr,
    setShowQr,
    copiedToken,
    setCopiedToken,
    resetFlow,
    onReceiptFile,
    orderMutation,
    renewMutation,
    logout,
    cancelOrder,
    markNotificationRead,
    markAllNotificationsRead,
    queryClient,
    router,
  } = props;

  const products = data.products ?? [];
  const renewProducts = data.renewProducts ?? [];
  const notifications = data.notifications ?? [];
  const orders = data.orders ?? [];
  const pendingOrders = data.pendingOrders ?? [];
  const services = data.services ?? [];
  const payment = data.store?.payment;
  const submitting = orderMutation.isPending || renewMutation.isPending;
  const submitError =
    (orderMutation.error as any)?.response?.data?.message ||
    (renewMutation.error as any)?.response?.data?.message ||
    null;

  const latestSub =
    services[0]?.subId || services[0]?.email
      ? buildSubscriptionLink(services[0]?.subId, services[0]?.email)
      : "";

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-6 sm:py-10">
      {/* Profile */}
      <header className="space-y-5">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">
              {t("پروفایل مشتری", "Customer profile")}
            </p>
            <h1 className="truncate text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white sm:text-4xl">
              {data.profile.name || t("مشتری", "Customer")}
            </h1>
            <button
              type="button"
              onClick={async () => {
                await copyToClipboard(data.token);
                setCopiedToken(true);
                window.setTimeout(() => setCopiedToken(false), 1600);
              }}
              className="mt-2 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 font-mono text-xs text-zinc-600 transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
            >
              <Copy size={12} />
              {copiedToken ? t("کپی شد", "Copied") : data.token}
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <PrimaryButton
              className="w-auto min-w-[8.5rem] px-4"
              onClick={() => {
                const slug = data.store?.slug;
                if (slug) {
                  router.push(`/shop/${encodeURIComponent(slug)}?flow=buy`);
                  return;
                }
                setResult(null);
                setFlow("buy");
                setSelectedProduct(null);
                setConfigName("");
                setReceiptText("");
              }}
            >
              <span className="inline-flex items-center gap-2">
                <Plus size={15} /> {t("سفارش جدید", "New order")}
              </span>
            </PrimaryButton>
            <SecondaryButton className="w-auto px-4" onClick={() => logout.mutate()}>
              <span className="inline-flex items-center gap-2">
                <LogOut size={15} /> {t("خروج", "Logout")}
              </span>
            </SecondaryButton>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-500">
          {data.profile.telegram ? (
            <a
              href={
                /^https?:\/\//i.test(data.profile.telegram)
                  ? data.profile.telegram
                  : `https://t.me/${data.profile.telegram.replace(/^@/, "")}`
              }
              target="_blank"
              rel="noreferrer"
              className="hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              {data.profile.telegram}
            </a>
          ) : null}
          {data.profile.whatsapp ? <span>{data.profile.whatsapp}</span> : null}
          {data.profile.email ? (
            <a href={`mailto:${data.profile.email}`} className="hover:text-zinc-800">
              {data.profile.email}
            </a>
          ) : null}
          {unreadCount > 0 ? (
            <span className="inline-flex items-center gap-1 text-rose-600">
              <Bell size={13} /> {unreadCount} {t("اعلان جدید", "new")}
            </span>
          ) : null}
        </div>
      </header>

      {result ? (
        <section className="rounded-2xl border border-emerald-200/80 bg-emerald-50/80 px-5 py-4 dark:border-emerald-900 dark:bg-emerald-950/30">
          <div className="font-semibold text-emerald-800 dark:text-emerald-300">
            {t("سفارش ثبت شد", "Order submitted")}
          </div>
          <p className="mt-1 text-sm text-emerald-700/80 dark:text-emerald-200/80">
            {t("کد پیگیری", "Tracking")}: <span className="font-mono font-bold">{result.trackingCode}</span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <PrimaryButton
              className="w-auto px-4"
              onClick={() => router.push(`/track/${result.trackingCode}`)}
            >
              {t("پیگیری سفارش", "Track order")}
            </PrimaryButton>
            <SecondaryButton className="w-auto px-4" onClick={() => setResult(null)}>
              {t("بستن", "Dismiss")}
            </SecondaryButton>
          </div>
        </section>
      ) : null}

      {flow !== "idle" ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">
                {flow === "buy" ? t("سفارش جدید", "New order") : t("تمدید سرویس", "Renew service")}
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                {flow === "buy"
                  ? t("پلن را انتخاب و رسید پرداخت را بفرستید.", "Pick a plan and submit payment proof.")
                  : t("پلن تمدید را انتخاب و رسید را بفرستید.", "Choose a renewal plan and submit proof.")}
              </p>
            </div>
            <SecondaryButton className="w-auto px-3" onClick={resetFlow}>
              {t("انصراف", "Cancel")}
            </SecondaryButton>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {(flow === "buy" ? products : renewProducts).map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                selected={selectedProduct?.id === product.id}
                onSelect={() => setSelectedProduct(product)}
              />
            ))}
          </div>

          {selectedProduct ? (
            <div className="mt-6 space-y-4">
              {flow === "buy" ? (
                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    {t("نام کانفیگ", "Config name")}
                  </label>
                  <input
                    value={configName}
                    onChange={(e) => setConfigName(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950"
                  />
                </div>
              ) : null}

              {payment ? (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950">
                  <div className="font-medium">{t("اطلاعات پرداخت", "Payment details")}</div>
                  {payment.bankName ? <div className="mt-2">{payment.bankName}</div> : null}
                  {payment.cardNumber ? <div className="font-mono">{payment.cardNumber}</div> : null}
                  {payment.cardHolder ? <div>{payment.cardHolder}</div> : null}
                  {payment.instructions ? (
                    <p className="mt-2 text-zinc-500">{payment.instructions}</p>
                  ) : null}
                </div>
              ) : null}

              <textarea
                rows={3}
                value={receiptText}
                onChange={(e) => setReceiptText(e.target.value)}
                placeholder={t("شناسه تراکنش یا یادداشت", "Transaction ID or note")}
                className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 outline-none dark:border-zinc-800 dark:bg-zinc-950"
              />

              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-zinc-300 px-4 py-4 text-sm dark:border-zinc-700">
                <Upload size={16} />
                <span>{t("آپلود تصویر رسید", "Upload receipt image")}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onReceiptFile(e.target.files?.[0])}
                />
              </label>
              {receiptPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={receiptPreview} alt="" className="max-h-44 rounded-xl object-contain" />
              ) : null}

              {submitError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {submitError}
                </div>
              ) : null}

              <PrimaryButton
                disabled={
                  submitting ||
                  !selectedProduct ||
                  (!receiptText.trim() && !receiptImage) ||
                  (flow === "buy" && !configName.trim())
                }
                onClick={() => {
                  if (flow === "buy") orderMutation.mutate();
                  else renewMutation.mutate();
                }}
              >
                {submitting
                  ? t("در حال ثبت…", "Submitting…")
                  : flow === "buy"
                    ? t("ثبت سفارش", "Submit order")
                    : t("ثبت تمدید", "Submit renewal")}
              </PrimaryButton>
            </div>
          ) : null}
        </section>
      ) : null}

      {pendingOrders.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-[0.12em] text-zinc-400">
            {t("در انتظار", "Pending")}
          </h2>
          <div className="space-y-3">
            {pendingOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onTrack={() => router.push(`/track/${encodeURIComponent(order.trackingCode)}`)}
                onCancel={() => cancelOrder.mutate(order.id)}
                cancelling={cancelOrder.isPending && cancelOrder.variables === order.id}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* Services */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium uppercase tracking-[0.12em] text-zinc-400">
            {t("سرویس‌ها", "Services")}
          </h2>
          <button
            type="button"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["customer-session"] })}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-800"
          >
            <RefreshCw size={13} /> {t("بروزرسانی", "Refresh")}
          </button>
        </div>
        <div className="space-y-3">
          {services.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              onCopy={() => copyToClipboard(buildSubscriptionLink(service.subId, service.email))}
              onOpen={() => window.open(buildSubscriptionLink(service.subId, service.email), "_blank")}
              onRenew={() => {
                const slug = data.store?.slug;
                const name = service.remark || service.email || service.id;
                if (slug) {
                  router.push(
                    `/shop/${encodeURIComponent(slug)}?flow=renew&clientId=${encodeURIComponent(service.id)}&serviceName=${encodeURIComponent(name)}`,
                  );
                  return;
                }
                setResult(null);
                setFlow("renew");
                setRenewingService(service.id);
                setSelectedProduct(null);
                setReceiptText("");
              }}
            />
          ))}
          {!services.length ? (
            <p className="rounded-2xl border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800">
              {t("هنوز سرویسی ندارید. سفارش جدید بزنید.", "No services yet. Place a new order.")}
            </p>
          ) : null}
        </div>
      </section>

      {/* History + Updates */}
      <section className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-[0.12em] text-zinc-400">
            {t("تاریخچه خرید", "Purchase history")}
          </h2>
          <div className="space-y-3">
            {orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onTrack={() => router.push(`/track/${encodeURIComponent(order.trackingCode)}`)}
                onCancel={() => cancelOrder.mutate(order.id)}
                cancelling={cancelOrder.isPending && cancelOrder.variables === order.id}
              />
            ))}
            {!orders.length ? (
              <p className="text-sm text-zinc-500">{t("سفارشی نیست.", "No orders yet.")}</p>
            ) : null}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.12em] text-zinc-400">
              <Bell size={14} /> {t("اعلان‌ها", "Updates")}
              {unreadCount > 0 ? (
                <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold normal-case tracking-normal text-white">
                  {unreadCount}
                </span>
              ) : null}
            </h2>
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={() => markAllNotificationsRead.mutate()}
                className="text-xs font-medium text-[color:var(--store-primary)] hover:underline"
              >
                {t("همه خوانده شد", "Mark all read")}
              </button>
            ) : null}
          </div>
          <div className="space-y-3">
            {notifications.slice(0, 8).map((notification) => {
              const trackingCode =
                typeof notification.payload?.trackingCode === "string"
                  ? notification.payload.trackingCode
                  : null;
              return (
                <NotificationCard
                  key={notification.id}
                  notification={notification}
                  onRead={
                    notification.isRead
                      ? undefined
                      : () => markNotificationRead.mutate(notification.id)
                  }
                  onOpen={
                    trackingCode
                      ? () => router.push(`/track/${encodeURIComponent(trackingCode)}`)
                      : undefined
                  }
                />
              );
            })}
            {!notifications.length ? (
              <p className="text-sm text-zinc-500">{t("اعلانی نیست.", "No updates yet.")}</p>
            ) : null}
          </div>
        </div>
      </section>

      {latestSub ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">{t("دسترسی سریع", "Quick access")}</h2>
              <p className="mt-1 text-sm text-zinc-500">
                {t("لینک آخرین سابسکریپشن را کپی یا اسکن کنید.", "Copy or scan your latest subscription link.")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowQr((v) => !v)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 text-zinc-600 dark:border-zinc-800"
              aria-label="QR"
            >
              <QrCode size={18} />
            </button>
          </div>
          {showQr ? (
            <div className="mt-5 flex justify-center rounded-2xl bg-white p-4">
              <QRCode value={latestSub} size={168} />
            </div>
          ) : null}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <PrimaryButton
              className="sm:flex-1"
              onClick={() => copyToClipboard(latestSub)}
            >
              {t("کپی لینک", "Copy link")}
            </PrimaryButton>
            <SecondaryButton className="sm:flex-1" onClick={() => window.open(latestSub, "_blank")}>
              {t("باز کردن", "Open")}
            </SecondaryButton>
          </div>
        </section>
      ) : null}
    </div>
  );
}
