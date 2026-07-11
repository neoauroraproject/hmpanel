"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { LoaderCircle, LogOut, Bell, Plus, RefreshCw, Upload } from "lucide-react";
import QRCode from "react-qr-code";
import { copyToClipboard } from "@/lib/clipboard";
import { publicApi } from "@/lib/api";
import { useCustomerSession } from "@/modules/storefront/session";
import { buildSubscriptionLink } from "@/modules/storefront/subscription";
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
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || "");
      setReceiptImage(value);
      setReceiptPreview(value);
    };
    reader.readAsDataURL(file);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <LoaderCircle className="animate-spin text-zinc-500" />
      </div>
    );
  }

  if (error || !data) {
    return null;
  }

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

  return (
    <StoreShell
      store={{
        title: data.store?.title || "Customer Dashboard",
        slug: data.store?.slug || "",
        branding: data.branding,
      }}
    >
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm text-zinc-500">Customer Profile</div>
              <h1 className="text-3xl font-black">
                {data.profile.name || "Customer"}
              </h1>
              <div className="mt-2 font-mono text-sm text-zinc-500">{data.token}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <PrimaryButton
                className="w-auto px-4"
                onClick={() => {
                  setResult(null);
                  setFlow("buy");
                  setSelectedProduct(null);
                  setConfigName("");
                  setReceiptText("");
                  setReceiptImage("");
                  setReceiptPreview("");
                }}
              >
                <span className="inline-flex items-center gap-2">
                  <Plus size={16} /> New Order
                </span>
              </PrimaryButton>
              <SecondaryButton className="w-auto px-4" onClick={() => copyToClipboard(data.token)}>
                Copy Token
              </SecondaryButton>
              <SecondaryButton className="w-auto px-4" onClick={() => logout.mutate()}>
                <span className="inline-flex items-center gap-2">
                  <LogOut size={16} /> Logout
                </span>
              </SecondaryButton>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3 text-sm text-zinc-500">
            {data.profile.telegram ? (
              <a
                href={
                  /^https?:\/\//i.test(data.profile.telegram)
                    ? data.profile.telegram
                    : `https://t.me/${data.profile.telegram.replace(/^@/, "")}`
                }
                target="_blank"
                rel="noreferrer"
                className="hover:text-blue-600 hover:underline"
              >
                Telegram: {data.profile.telegram}
              </a>
            ) : null}
            {data.profile.whatsapp ? (
              <a
                href={
                  /^https?:\/\//i.test(data.profile.whatsapp)
                    ? data.profile.whatsapp
                    : `https://wa.me/${data.profile.whatsapp.replace(/[^\d]/g, "")}`
                }
                target="_blank"
                rel="noreferrer"
                className="hover:text-emerald-600 hover:underline"
              >
                WhatsApp: {data.profile.whatsapp}
              </a>
            ) : null}
            {data.profile.email ? (
              <a href={`mailto:${data.profile.email}`} className="hover:text-amber-600 hover:underline">
                Email: {data.profile.email}
              </a>
            ) : null}
            {unreadCount > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-red-600">
                <Bell size={14} /> {unreadCount} new
              </span>
            ) : null}
          </div>
        </div>

        {result ? (
          <section className="mt-6 rounded-[2rem] border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950/30">
            <div className="font-semibold text-emerald-700 dark:text-emerald-300">Order submitted</div>
            <p className="mt-1 text-sm text-emerald-700/80 dark:text-emerald-200/80">
              Tracking code: <span className="font-mono">{result.trackingCode}</span>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <PrimaryButton
                className="w-auto px-4"
                onClick={() => router.push(`/track/${result.trackingCode}`)}
              >
                Track order
              </PrimaryButton>
              <SecondaryButton className="w-auto px-4" onClick={() => setResult(null)}>
                Dismiss
              </SecondaryButton>
            </div>
          </section>
        ) : null}

        {flow !== "idle" ? (
          <section className="mt-8 rounded-[2rem] border border-[color:var(--store-primary)]/20 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">
                  {flow === "buy" ? "New Order" : "Renew Service"}
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  {flow === "buy"
                    ? "Pick a plan, choose a config name, and submit payment proof."
                    : "Choose a compatible renewal plan and submit payment proof."}
                </p>
              </div>
              <SecondaryButton className="w-auto px-4" onClick={resetFlow}>
                Cancel
              </SecondaryButton>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {(flow === "buy" ? products : renewProducts).map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  selected={selectedProduct?.id === product.id}
                  onSelect={() => setSelectedProduct(product)}
                />
              ))}
            </div>

            {!((flow === "buy" ? products : renewProducts).length) ? (
              <p className="mt-4 text-sm text-zinc-500">
                {flow === "buy" ? "No products available right now." : "No compatible renewal plans."}
              </p>
            ) : null}

            {selectedProduct ? (
              <div className="mt-6 grid gap-4">
                {flow === "buy" ? (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium">Config name</label>
                    <input
                      value={configName}
                      onChange={(event) => setConfigName(event.target.value)}
                      placeholder="e.g. ali"
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 outline-none dark:border-zinc-800 dark:bg-zinc-950"
                    />
                    <p className="mt-1 text-xs text-zinc-500">
                      A random 4-digit suffix will be added automatically (example: ali-4831).
                    </p>
                  </div>
                ) : null}

                {payment ? (
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950">
                    <div className="font-semibold">Payment details</div>
                    {payment.bankName ? <div className="mt-2">Bank: {payment.bankName}</div> : null}
                    {payment.cardNumber ? <div>Card: {payment.cardNumber}</div> : null}
                    {payment.cardHolder ? <div>Holder: {payment.cardHolder}</div> : null}
                    {payment.iban ? <div>IBAN: {payment.iban}</div> : null}
                    {payment.instructions ? <p className="mt-2 text-zinc-500">{payment.instructions}</p> : null}
                  </div>
                ) : null}

                <textarea
                  rows={3}
                  value={receiptText}
                  onChange={(event) => setReceiptText(event.target.value)}
                  placeholder="Transaction ID or payment note"
                  className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 outline-none dark:border-zinc-800 dark:bg-zinc-950"
                />

                <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-zinc-300 px-4 py-4 text-sm dark:border-zinc-700">
                  <Upload size={16} />
                  <span>Upload receipt image</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => onReceiptFile(event.target.files?.[0])}
                  />
                </label>
                {receiptPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={receiptPreview} alt="Receipt preview" className="max-h-48 rounded-2xl object-contain" />
                ) : null}

                {submitError ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900 dark:bg-red-950/40">
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
                  {submitting ? "Submitting..." : flow === "buy" ? "Submit Order" : "Submit Renewal"}
                </PrimaryButton>
              </div>
            ) : null}
          </section>
        ) : null}

        {pendingOrders.length > 0 ? (
          <section className="mt-8">
            <h2 className="mb-4 text-xl font-bold">Pending</h2>
            <div className="grid gap-3">
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

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Services</h2>
            <SecondaryButton
              className="w-auto px-4"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["customer-session"] })}
            >
              <span className="inline-flex items-center gap-2">
                <RefreshCw size={14} /> Refresh
              </span>
            </SecondaryButton>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {services.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                onCopy={() => copyToClipboard(buildSubscriptionLink(service.subId, service.email))}
                onOpen={() => window.open(buildSubscriptionLink(service.subId, service.email), "_blank")}
                onRenew={() => {
                  setResult(null);
                  setFlow("renew");
                  setRenewingService(service.id);
                  setSelectedProduct(null);
                  setReceiptText("");
                  setReceiptImage("");
                  setReceiptPreview("");
                }}
              />
            ))}
            {!services.length ? (
              <p className="text-sm text-zinc-500">No services yet. Start with a new order.</p>
            ) : null}
          </div>
        </section>

        <section className="mt-8 grid gap-8 lg:grid-cols-[1.3fr_0.7fr]">
          <div>
            <h2 className="mb-4 text-xl font-bold">Purchase History</h2>
            <div className="grid gap-3">
              {orders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onTrack={() => router.push(`/track/${encodeURIComponent(order.trackingCode)}`)}
                  onCancel={() => cancelOrder.mutate(order.id)}
                  cancelling={cancelOrder.isPending && cancelOrder.variables === order.id}
                />
              ))}
              {!orders.length ? <p className="text-sm text-zinc-500">No orders yet.</p> : null}
            </div>
          </div>
          <div>
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xl font-bold">
                <Bell size={18} /> Updates
                {unreadCount > 0 ? (
                  <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                    {unreadCount}
                  </span>
                ) : null}
              </div>
              {unreadCount > 0 ? (
                <button
                  type="button"
                  onClick={() => markAllNotificationsRead.mutate()}
                  className="text-xs font-semibold text-[color:var(--store-primary)] hover:underline"
                >
                  Mark all read
                </button>
              ) : null}
            </div>
            <div className="grid gap-3">
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
                <p className="text-sm text-zinc-500">No updates yet.</p>
              ) : null}
            </div>
          </div>
        </section>

        {services[0]?.subId || services[0]?.email ? (
          <section className="mt-8 rounded-[2rem] border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-xl font-bold">Quick QR</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Scan or open your latest subscription link.
            </p>
            <div className="mt-4 flex justify-center rounded-3xl bg-white p-4">
              <QRCode value={buildSubscriptionLink(services[0]?.subId, services[0]?.email)} size={180} />
            </div>
          </section>
        ) : null}
      </div>
    </StoreShell>
  );
}
