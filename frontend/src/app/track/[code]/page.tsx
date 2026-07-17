"use client";

import { useQuery } from "@tanstack/react-query";
import { publicApi, getCustomerSessionToken } from "@/lib/api";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  Clock,
  XCircle,
  Package,
  QrCode,
  KeyRound,
  Copy,
  Check,
  AlertTriangle,
} from "lucide-react";
import { useMemo, useState } from "react";
import QRCode from "react-qr-code";
import Link from "next/link";
import { buildPortalBridgeLink, buildSubscriptionLink } from "@/modules/storefront/subscription";
import { copyToClipboard } from "@/lib/clipboard";
import { StoreShell } from "@/modules/storefront/ui";
import { StorefrontLocaleProvider, useStorefrontLocale } from "@/modules/storefront/locale";
import { portalPathForSlug, shopPathForSlug } from "@/modules/storefront/store-slug";

function portalHref(storeSlug?: string | null, customerToken?: string | null) {
  const hasSession =
    typeof window !== "undefined" && !!getCustomerSessionToken();
  if (hasSession) return portalPathForSlug(storeSlug, "dashboard");
  if (customerToken) {
    return `${portalPathForSlug(storeSlug, "login")}?token=${encodeURIComponent(customerToken)}`;
  }
  return portalPathForSlug(storeSlug, "login");
}

type StatusKey =
  | "PENDING_PAYMENT"
  | "PAYMENT_SUBMITTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "PROVISIONING"
  | "PROVISION_FAILED"
  | "ACTIVE"
  | "RENEWED"
  | "REJECTED"
  | "CANCELLED"
  | "EXPIRED";

const STATUS_META: Record<
  StatusKey,
  { icon: typeof Clock; color: string; fa: [string, string]; en: [string, string] }
> = {
  PENDING_PAYMENT: {
    icon: Clock,
    color: "amber",
    fa: ["در انتظار پرداخت", "پرداخت را انجام دهید و رسید را بفرستید."],
    en: ["Awaiting payment", "Complete payment and submit your receipt."],
  },
  PAYMENT_SUBMITTED: {
    icon: Clock,
    color: "amber",
    fa: ["پرداخت ثبت شد", "جزئیات پرداخت دریافت شد."],
    en: ["Payment submitted", "We received your payment details."],
  },
  UNDER_REVIEW: {
    icon: Clock,
    color: "amber",
    fa: ["در حال بررسی", "ادمین در حال تأیید پرداخت است."],
    en: ["Under review", "Admin is verifying your payment."],
  },
  APPROVED: {
    icon: CheckCircle2,
    color: "sky",
    fa: ["پرداخت تأیید شد", "در حال ساخت سرویس…"],
    en: ["Payment approved", "Creating your service now."],
  },
  PROVISIONING: {
    icon: RefreshCw,
    color: "violet",
    fa: ["ساخت سرویس", "سرویس در حال آماده‌سازی است."],
    en: ["Creating service", "Your service is being created."],
  },
  PROVISION_FAILED: {
    icon: AlertTriangle,
    color: "red",
    fa: ["خطا در ساخت سرویس", "پرداخت تأیید شد؛ پشتیبانی دوباره تلاش می‌کند."],
    en: ["Service creation failed", "Payment was approved; support will retry."],
  },
  ACTIVE: {
    icon: CheckCircle2,
    color: "emerald",
    fa: ["سفارش تکمیل شد", "سرویس شما آماده است."],
    en: ["Order complete", "Your service is ready."],
  },
  RENEWED: {
    icon: CheckCircle2,
    color: "emerald",
    fa: ["تمدید تکمیل شد", "سرویس شما تمدید شد."],
    en: ["Renewal complete", "Your service has been extended."],
  },
  REJECTED: {
    icon: XCircle,
    color: "red",
    fa: ["رد شد", "پرداخت تأیید نشد."],
    en: ["Rejected", "Your payment was not approved."],
  },
  CANCELLED: {
    icon: XCircle,
    color: "zinc",
    fa: ["لغو شد", "این سفارش لغو شده است."],
    en: ["Cancelled", "This order was cancelled."],
  },
  EXPIRED: {
    icon: XCircle,
    color: "zinc",
    fa: ["منقضی", "این سفارش منقضی شده است."],
    en: ["Expired", "This order has expired."],
  },
};

const colorClasses: Record<string, string> = {
  amber: "bg-amber-50 border-amber-200/80 text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-300",
  sky: "bg-sky-50 border-sky-200/80 text-sky-800 dark:bg-sky-500/10 dark:border-sky-500/20 dark:text-sky-300",
  violet: "bg-violet-50 border-violet-200/80 text-violet-800 dark:bg-violet-500/10 dark:border-violet-500/20 dark:text-violet-300",
  red: "bg-red-50 border-red-200/80 text-red-800 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-300",
  emerald:
    "bg-emerald-50 border-emerald-200/80 text-emerald-800 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-300",
  zinc: "bg-zinc-50 border-zinc-200 text-zinc-600 dark:bg-zinc-500/10 dark:border-zinc-700 dark:text-zinc-300",
};

function timelineDotClass(status: string, message?: string | null) {
  if (status === "PROVISION_FAILED" || status === "REJECTED" || status === "CANCELLED") {
    return "bg-red-500";
  }
  if (message && /fail|error|already in use|already exists/i.test(message)) {
    return "bg-red-500";
  }
  if (status === "ACTIVE" || status === "RENEWED" || status === "APPROVED") {
    return "bg-emerald-500";
  }
  if (status === "PROVISIONING") return "bg-violet-500";
  return "bg-sky-500";
}

export default function TrackOrderPage() {
  const params = useParams();
  const code = String(params.code || "").trim().toUpperCase();

  const { data, isLoading, error, refetch, isFetching, failureReason } = useQuery({
    queryKey: ["track", code],
    queryFn: async () => (await publicApi.get(`/store/track/${encodeURIComponent(code)}`)).data,
    enabled: !!code,
    refetchInterval: (query: any) => {
      const s = query?.state?.data?.status;
      return ["PENDING_PAYMENT", "PAYMENT_SUBMITTED", "UNDER_REVIEW", "APPROVED", "PROVISIONING"].includes(s)
        ? 5000
        : false;
    },
    retry: (count, err: any) => {
      const status = err?.response?.status;
      if (status === 404) return false;
      return count < 2;
    },
  });

  if (isLoading && !data) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#f6f6f7]">
        <RefreshCw className="animate-spin text-zinc-400" size={28} />
      </div>
    );
  }

  const statusCode = (error as any)?.response?.status;
  const apiMessage = (error as any)?.response?.data?.message;

  if (error && !data) {
    const isNotFound = statusCode === 404;
    const isRateLimited = statusCode === 429;
    return (
      <StorefrontLocaleProvider>
        <TrackError
          isNotFound={isNotFound}
          isRateLimited={isRateLimited}
          message={String(apiMessage || (failureReason as any)?.message || "")}
          onRetry={() => refetch()}
          storeSlug={undefined}
        />
      </StorefrontLocaleProvider>
    );
  }

  if (!data) return null;

  return (
    <StoreShell
      store={{
        title: data.storeTitle || "Order Tracking",
        slug: data.storeSlug || "",
        branding: data.branding,
      }}
      topBar={
        <span className="truncate text-sm font-semibold tracking-tight">
          {data.storeTitle || "Order Tracking"}
        </span>
      }
    >
      <TrackBody data={data} isFetching={isFetching} />
    </StoreShell>
  );
}

function TrackError({
  isNotFound,
  isRateLimited,
  message,
  onRetry,
  storeSlug,
}: {
  isNotFound: boolean;
  isRateLimited: boolean;
  message: string;
  onRetry: () => void;
  storeSlug?: string;
}) {
  const { t } = useStorefrontLocale();
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#f6f6f7] p-6 text-center">
      <AlertCircle size={40} className={`mb-4 ${isNotFound ? "text-red-500" : "text-amber-500"}`} />
      <h1 className="text-xl font-semibold tracking-tight">
        {isNotFound
          ? t("سفارش پیدا نشد", "Order not found")
          : isRateLimited
            ? t("درخواست زیاد", "Too many requests")
            : t("بارگذاری ناموفق", "Could not load order")}
      </h1>
      <p className="mt-2 max-w-sm text-sm text-zinc-500">
        {isNotFound
          ? t("کد پیگیری را بررسی کنید.", "Check the tracking code and try again.")
          : isRateLimited
            ? t("کمی صبر کنید و دوباره تلاش کنید.", "Please wait a moment and retry.")
            : message || t("مشکل موقت شبکه.", "Temporary network issue.")}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button
          onClick={onRetry}
          className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
        >
          {t("تلاش مجدد", "Retry")}
        </button>
        <Link
          href={portalHref(storeSlug)}
          className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold"
        >
          {t("پورتال مشتری", "Customer portal")}
        </Link>
        {storeSlug ? (
          <Link
            href={shopPathForSlug(storeSlug)}
            className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold"
          >
            {t("فروشگاه", "Store")}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function TrackBody({ data, isFetching }: { data: any; isFetching: boolean }) {
  const { t, formatToman, isFa } = useStorefrontLocale();
  const [copied, setCopied] = useState<"sub" | "token" | null>(null);
  const [showQR, setShowQR] = useState(false);

  const statusKey = (data.status in STATUS_META ? data.status : "UNDER_REVIEW") as StatusKey;
  const cfg = STATUS_META[statusKey];
  const StatusIcon = cfg.icon;
  const title = isFa ? cfg.fa[0] : cfg.en[0];
  const desc = isFa ? cfg.fa[1] : cfg.en[1];

  const isComplete = data.status === "ACTIVE" || data.status === "RENEWED";
  const isFailed = data.status === "PROVISION_FAILED";
  const isRejected = data.status === "REJECTED";
  const statusMessage =
    data.rejectReason ||
    (isFailed ? data.provisionError || data.lastTimelineMessage : null) ||
    desc;

  const cur = String(data.currency || "").toUpperCase();
  const isToman = ["TOMAN", "IRT", "IRR", "TMN"].includes(cur);
  const amountLabel = isToman
    ? formatToman(data.amount)
    : cur === "USD"
      ? `$${data.amount}`
      : `${data.amount} ${data.currency}`;

  const subLink = useMemo(() => {
    if (!(data.delivery?.subId || data.delivery?.email)) return "";
    return buildSubscriptionLink(data.delivery.subId, data.delivery.email);
  }, [data.delivery?.subId, data.delivery?.email]);

  const handleCopy = async (text: string, kind: "sub" | "token") => {
    await copyToClipboard(text);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1800);
  };

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-6 sm:py-10">
      <div className="flex flex-wrap gap-2">
        <Link
          href={shopPathForSlug(data.storeSlug)}
          className="inline-flex h-11 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold dark:border-zinc-700 dark:bg-zinc-900"
        >
          {t("بازگشت به فروشگاه", "Back to store")}
        </Link>
        <Link
          href={portalHref(data.storeSlug, data.customerToken)}
          className="inline-flex h-11 items-center justify-center rounded-2xl bg-[color:var(--store-primary,#2563eb)] px-4 text-sm font-semibold text-white"
        >
          {t("پورتال مشتری", "Customer portal")}
        </Link>
      </div>
      <header className="text-center">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">
          {t("پیگیری سفارش", "Order tracking")}
        </p>
        <div className="mt-3 inline-flex items-center rounded-full border border-zinc-200 bg-white px-4 py-2 font-mono text-sm font-semibold tracking-widest text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
          {data.trackingCode}
        </div>
        {isFetching ? (
          <div className="mt-2 text-[11px] text-zinc-400">{t("در حال بروزرسانی…", "Updating…")}</div>
        ) : null}
      </header>

      <section className={`rounded-2xl border px-5 py-6 text-center ${colorClasses[cfg.color]}`}>
        <StatusIcon
          size={36}
          className={`mx-auto mb-3 ${data.status === "PROVISIONING" ? "animate-spin" : ""}`}
        />
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm opacity-80">{statusMessage}</p>
      </section>

      {/* Order summary */}
      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400">
            {t("جزئیات سفارش", "Order details")}
          </div>
        </div>
        <div className="divide-y divide-zinc-100 px-5 dark:divide-zinc-800">
          <Row
            label={t("محصول", "Product")}
            value={
              <span className="inline-flex items-center gap-1.5 font-medium">
                <Package size={14} className="text-zinc-400" /> {data.productName}
              </span>
            }
          />
          <Row
            label={t("نوع", "Type")}
            value={data.isRenewal ? t("تمدید", "Renewal") : t("سرویس جدید", "New service")}
          />
          <Row label={t("مبلغ", "Amount")} value={<span className="font-semibold tabular-nums">{amountLabel}</span>} />
        </div>
      </section>

      {data.customerToken ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-200">
            <KeyRound size={15} /> {t("توکن مشتری", "Customer token")}
          </div>
          <code className="block break-all rounded-xl bg-zinc-50 px-3 py-3 font-mono text-sm font-semibold dark:bg-zinc-950">
            {data.customerToken}
          </code>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => handleCopy(data.customerToken, "token")}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-zinc-900 px-3 py-2.5 text-sm font-semibold text-white dark:bg-white dark:text-zinc-900"
            >
              {copied === "token" ? <Check size={14} /> : <Copy size={14} />}
              {copied === "token" ? t("کپی شد", "Copied") : t("کپی", "Copy")}
            </button>
            <Link
              href={buildPortalBridgeLink(data.customerToken, data.storeSlug)}
              className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-semibold dark:border-zinc-700 dark:bg-zinc-950"
            >
              {t("پورتال", "Portal")}
            </Link>
          </div>
        </section>
      ) : null}

      {isComplete ? (
        <section className="overflow-hidden rounded-2xl border border-emerald-300/70 bg-white shadow-sm dark:border-emerald-800 dark:bg-zinc-900">
          <div className="border-b border-emerald-100 bg-emerald-50/80 px-5 py-4 dark:border-emerald-900/50 dark:bg-emerald-950/40">
            <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-emerald-700/80 dark:text-emerald-300/80">
              {t("سرویس شما", "Your service")}
            </div>
            <div className="mt-1 text-lg font-semibold tracking-tight text-emerald-950 dark:text-emerald-50">
              {data.productName || t("سرویس VPN", "VPN service")}
            </div>
            <p className="mt-1 text-sm text-emerald-800/75 dark:text-emerald-200/75">
              {data.isRenewal
                ? t("تمدید انجام شد — از همان لینک استفاده کنید.", "Renewal done — use the same subscription link.")
                : t("سفارش آماده است. از دکمه‌های زیر استفاده کنید.", "Order is ready. Use the actions below.")}
            </p>
          </div>

          <div className="space-y-3 px-5 py-4 text-sm">
            {data.delivery?.email ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-zinc-500">{t("کانفیگ", "Config")}</span>
                <span className="font-mono font-semibold">{data.delivery.email}</span>
              </div>
            ) : null}
            {subLink ? (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                  {t("لینک سابسکریپشن", "Subscription link")}
                </div>
                <code className="block break-all text-xs text-zinc-700 dark:text-zinc-300">{subLink}</code>
              </div>
            ) : null}
          </div>

          {subLink ? (
            <div className="grid gap-2 border-t border-emerald-100 bg-emerald-50/40 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20 sm:grid-cols-3">
              <button
                onClick={() => handleCopy(subLink, "sub")}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                {copied === "sub" ? <Check size={15} /> : <Copy size={15} />}
                {copied === "sub" ? t("کپی شد", "Copied") : t("کپی لینک", "Copy link")}
              </button>
              <button
                onClick={() => setShowQR((v) => !v)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold dark:border-zinc-700 dark:bg-zinc-950"
              >
                <QrCode size={15} /> {t("کیوآر", "QR")}
              </button>
              <a
                href={subLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold dark:border-zinc-700 dark:bg-zinc-950"
              >
                {t("باز کردن", "Open")}
              </a>
            </div>
          ) : (
            <div className="border-t border-emerald-100 px-5 py-4 text-sm text-emerald-800 dark:border-emerald-900 dark:text-emerald-200">
              {t("سرویس فعال است. از پورتال مدیریت کنید.", "Service is active. Manage it from the portal.")}
            </div>
          )}

          {showQR && subLink ? (
            <div className="flex justify-center border-t border-emerald-100 bg-white p-5 dark:border-emerald-900 dark:bg-zinc-950">
              <QRCode value={subLink} size={176} />
            </div>
          ) : null}
        </section>
      ) : null}

      {(isFailed || isRejected) && (
        <div className="flex flex-wrap justify-center gap-3 text-center">
          <Link
            href={portalHref(data.storeSlug, data.customerToken)}
            className="text-sm font-medium text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-200"
          >
            {t("بازگشت به پورتال", "Back to customer portal")}
          </Link>
          <Link
            href={shopPathForSlug(data.storeSlug)}
            className="text-sm font-medium text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-200"
          >
            {t("بازگشت به فروشگاه", "Back to store")}
          </Link>
        </div>
      )}

      {data.timeline?.length > 0 ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400">
            {t("زمان‌بندی", "Timeline")}
          </h3>
          <div className="mt-4 space-y-4">
            {data.timeline.map((ev: any, i: number) => (
              <div key={ev.id || i} className="flex gap-3">
                <div
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${timelineDotClass(ev.status, ev.message)}`}
                />
                <div>
                  <div className="text-sm font-medium">{String(ev.status).replace(/_/g, " ")}</div>
                  {ev.message ? <div className="text-xs text-zinc-500">{ev.message}</div> : null}
                  <div className="text-[10px] text-zinc-400">
                    {new Date(ev.createdAt).toLocaleString(isFa ? "fa-IR" : undefined)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className="text-end text-zinc-900 dark:text-zinc-100">{value}</span>
    </div>
  );
}
