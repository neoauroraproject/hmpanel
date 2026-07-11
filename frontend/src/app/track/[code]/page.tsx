"use client";

import { useQuery } from "@tanstack/react-query";
import { publicApi } from "@/lib/api";
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
import { useState } from "react";
import QRCode from "react-qr-code";
import Link from "next/link";
import { buildPortalBridgeLink, buildSubscriptionLink } from "@/modules/storefront/subscription";
import { copyToClipboard } from "@/lib/clipboard";

const STATUS_CONFIG: Record<
  string,
  { icon: typeof Clock; color: string; title: string; desc: string }
> = {
  PENDING_PAYMENT: {
    icon: Clock,
    color: "amber",
    title: "Awaiting Payment",
    desc: "Please complete payment and submit your receipt.",
  },
  PAYMENT_SUBMITTED: {
    icon: Clock,
    color: "amber",
    title: "Payment Submitted",
    desc: "We received your payment details.",
  },
  UNDER_REVIEW: {
    icon: Clock,
    color: "amber",
    title: "Under Review",
    desc: "Admin is verifying your payment. This page updates automatically.",
  },
  APPROVED: {
    icon: CheckCircle2,
    color: "blue",
    title: "Payment Approved",
    desc: "Payment approved. Creating your service now.",
  },
  PROVISIONING: {
    icon: RefreshCw,
    color: "purple",
    title: "Creating Service",
    desc: "Your service is being created.",
  },
  PROVISION_FAILED: {
    icon: AlertTriangle,
    color: "red",
    title: "Service Creation Failed",
    desc: "Payment was approved, but creating the service failed. Support will retry it.",
  },
  ACTIVE: {
    icon: CheckCircle2,
    color: "emerald",
    title: "Order Complete",
    desc: "Your service is ready.",
  },
  RENEWED: {
    icon: CheckCircle2,
    color: "emerald",
    title: "Renewal Complete",
    desc: "Your service has been extended.",
  },
  REJECTED: {
    icon: XCircle,
    color: "red",
    title: "Order Rejected",
    desc: "Your payment was not approved.",
  },
  CANCELLED: {
    icon: XCircle,
    color: "zinc",
    title: "Cancelled",
    desc: "This order was cancelled.",
  },
  EXPIRED: {
    icon: XCircle,
    color: "zinc",
    title: "Expired",
    desc: "This order has expired.",
  },
};

const colorClasses: Record<string, string> = {
  amber: "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400",
  blue: "bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-400",
  purple: "bg-purple-500/10 border-purple-500/20 text-purple-700 dark:text-purple-400",
  red: "bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-400",
  emerald: "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400",
  zinc: "bg-zinc-500/10 border-zinc-500/20 text-zinc-600 dark:text-zinc-400",
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
  if (status === "PROVISIONING") return "bg-purple-500";
  return "bg-blue-500";
}

export default function TrackOrderPage() {
  const params = useParams();
  const code = String(params.code || "").trim().toUpperCase();
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);

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

  const handleCopy = (text: string) => {
    copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <RefreshCw className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  const statusCode = (error as any)?.response?.status;
  const apiMessage = (error as any)?.response?.data?.message;

  if (error && !data) {
    const isNotFound = statusCode === 404;
    const isRateLimited = statusCode === 429;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4 text-center">
        <AlertCircle size={48} className={`mb-4 ${isNotFound ? "text-red-500" : "text-amber-500"}`} />
        <h1 className="text-2xl font-bold">
          {isNotFound ? "Order Not Found" : isRateLimited ? "Too Many Requests" : "Could Not Load Order"}
        </h1>
        <p className="mt-2 max-w-md text-sm text-zinc-500">
          {isNotFound
            ? "This tracking code was not found. Check the code and try again."
            : isRateLimited
              ? "Please wait a moment and retry."
              : String(apiMessage || (failureReason as any)?.message || "Temporary network issue.")}
        </p>
        <div className="mt-5 flex gap-3">
          <button
            onClick={() => refetch()}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Retry
          </button>
          <Link href="/portal" className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold dark:border-zinc-700">
            Customer Portal
          </Link>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const cfg = STATUS_CONFIG[data.status] || STATUS_CONFIG.UNDER_REVIEW;
  const StatusIcon = cfg.icon;
  const isComplete = data.status === "ACTIVE" || data.status === "RENEWED";
  const isFailed = data.status === "PROVISION_FAILED";
  const isRejected = data.status === "REJECTED";
  const statusMessage =
    data.rejectReason ||
    (isFailed ? data.provisionError || data.lastTimelineMessage : null) ||
    cfg.desc;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-12 px-4 font-sans text-zinc-900 dark:text-zinc-100">
      <div className="max-w-xl mx-auto space-y-6">
        <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 shadow-sm border border-zinc-200 dark:border-zinc-800">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold mb-2">Order Tracking</h1>
            <div className="mt-4 font-mono text-xl font-black tracking-widest bg-zinc-100 dark:bg-zinc-950 py-3 px-6 rounded-xl inline-block border border-zinc-200 dark:border-zinc-800">
              {data.trackingCode}
            </div>
            {isFetching ? <div className="mt-2 text-xs text-zinc-400">Updating…</div> : null}
          </div>

          <div className={`p-6 rounded-2xl border mb-8 flex flex-col items-center text-center ${colorClasses[cfg.color]}`}>
            <StatusIcon size={48} className={`mb-4 ${data.status === "PROVISIONING" ? "animate-spin" : ""}`} />
            <h2 className="text-xl font-bold mb-1">{cfg.title}</h2>
            <p className="text-sm opacity-80">{statusMessage}</p>
            {isFailed ? (
              <p className="mt-3 text-xs opacity-70">
                Payment itself was approved. The service will be created after support retries provisioning.
              </p>
            ) : null}
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-500">Product</span>
              <span className="font-semibold flex items-center gap-1">
                <Package size={14} /> {data.productName}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-500">Type</span>
              <span>{data.isRenewal ? "Renewal" : "New Service"}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-500">Amount</span>
              <span>{data.currency === "USD" ? `$${data.amount}` : `${data.amount} ${data.currency}`}</span>
            </div>
          </div>

          {data.customerToken ? (
            <div className="mt-6 rounded-2xl border border-blue-500/20 bg-blue-50 p-4 dark:bg-blue-500/10">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400">
                <KeyRound size={16} /> Customer Token
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <code className="w-full break-all rounded-xl bg-white px-3 py-3 font-mono text-sm font-bold tracking-wide dark:bg-zinc-900 sm:flex-1">
                  {data.customerToken}
                </code>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleCopy(data.customerToken)}
                    className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />} Copy
                  </button>
                  <Link
                    href={buildPortalBridgeLink(data.customerToken)}
                    className="inline-flex items-center rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    Portal
                  </Link>
                </div>
              </div>
            </div>
          ) : null}

          {isComplete && (data.delivery?.subId || data.delivery?.email) ? (
            <div className="mt-8 space-y-4">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() =>
                    handleCopy(buildSubscriptionLink(data.delivery.subId, data.delivery.email))
                  }
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
                >
                  {copied ? "Copied" : "Copy Subscription"}
                </button>
                <button
                  onClick={() => setShowQR((v) => !v)}
                  className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold dark:border-zinc-700"
                >
                  <QrCode size={16} /> QR
                </button>
                <a
                  href={buildSubscriptionLink(data.delivery.subId, data.delivery.email)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold dark:border-zinc-700"
                >
                  Open Link
                </a>
              </div>
              {showQR ? (
                <div className="flex justify-center rounded-2xl bg-white p-4">
                  <QRCode
                    value={buildSubscriptionLink(data.delivery.subId, data.delivery.email)}
                    size={180}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {isComplete && data.isRenewal ? (
            <div className="mt-8 p-4 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl text-sm text-emerald-700 dark:text-emerald-300">
              Your existing subscription has been extended. No config changes needed.
            </div>
          ) : null}

          {(isFailed || isRejected) && (
            <div className="mt-6 text-center">
              <Link href="/portal" className="text-sm font-semibold text-blue-600 hover:underline">
                Back to Customer Portal
              </Link>
            </div>
          )}
        </div>

        {data.timeline?.length > 0 ? (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800">
            <h3 className="font-bold mb-4">Timeline</h3>
            <div className="space-y-4">
              {data.timeline.map((ev: any, i: number) => (
                <div key={ev.id || i} className="flex gap-3">
                  <div className={`h-2 w-2 rounded-full mt-2 shrink-0 ${timelineDotClass(ev.status, ev.message)}`} />
                  <div>
                    <div className="text-sm font-medium">{String(ev.status).replace(/_/g, " ")}</div>
                    {ev.message ? <div className="text-xs text-zinc-500">{ev.message}</div> : null}
                    <div className="text-[10px] text-zinc-400">{new Date(ev.createdAt).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
