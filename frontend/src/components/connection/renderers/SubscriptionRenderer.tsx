"use client";

import { useMemo, useState } from "react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { Copy, Check, Download } from "lucide-react";
import { copyToClipboard } from "@/lib/clipboard";
import { useT } from "@/i18n/locale";
import type { ConnectionRendererProps } from "../RendererRegistry";
import type { SubscriptionPayload } from "../types";
import { ConnectionMethods } from "../ConnectionMethods";

export function SubscriptionRenderer({
  output,
  showPlatformQR = true,
  showNativeQR = true,
  allowQRDownload = true,
}: ConnectionRendererProps) {
  const t = useT();
  const payload = (output.payload || {}) as SubscriptionPayload;
  const systemUrl = payload.systemSubUrl || "";
  const nativeUrl = payload.nativeSubUrl || "";
  const showNative = showNativeQR !== false && !!nativeUrl;
  const showPlatform = showPlatformQR !== false && !!systemUrl;

  const [tab, setTab] = useState<"platform" | "native">(() => {
    if (showPlatform && !showNative) return "platform";
    if (!showPlatform && showNative) return "native";
    return "platform";
  });
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const activeUrl = tab === "native" && nativeUrl ? nativeUrl : systemUrl;
  const qrValue = activeUrl;
  const qrCanvasId = useMemo(() => `conn-qr-canvas-${tab}`, [tab]);

  const onCopy = async (url: string, key: string) => {
    if (!url) return;
    await copyToClipboard(url);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1500);
  };

  const showTabs = showPlatform && showNative;

  return (
    <div className="space-y-4">
      <ConnectionMethods methods={output.methods} capabilities={output.capabilities} />

      {output.warnings?.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          {output.warnings.join(" · ")}
        </div>
      ) : null}

      {showPlatform ? (
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            {t("connection.panelLink")}
          </div>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{t("connection.platformSubHint")}</p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={systemUrl}
              className="min-w-0 flex-1 truncate rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-[11px] dark:border-zinc-700 dark:bg-zinc-950"
              dir="ltr"
            />
            <button
              type="button"
              onClick={() => onCopy(systemUrl, "platform")}
              className="inline-flex h-10 shrink-0 items-center gap-1 rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white"
            >
              {copiedKey === "platform" ? <Check size={14} /> : <Copy size={14} />}
              {copiedKey === "platform" ? t("common.copied") : t("common.copy")}
            </button>
          </div>
        </div>
      ) : null}

      {showNative ? (
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            {t("connection.nativeLink")}
          </div>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{t("connection.nativeSubHint")}</p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={nativeUrl}
              className="min-w-0 flex-1 truncate rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-[11px] dark:border-zinc-700 dark:bg-zinc-950"
              dir="ltr"
            />
            <button
              type="button"
              onClick={() => onCopy(nativeUrl, "native")}
              className="inline-flex h-10 shrink-0 items-center gap-1 rounded-xl bg-zinc-800 px-3 text-sm font-semibold text-white dark:bg-zinc-700"
            >
              {copiedKey === "native" ? <Check size={14} /> : <Copy size={14} />}
              {copiedKey === "native" ? t("common.copied") : t("common.copy")}
            </button>
          </div>
        </div>
      ) : null}

      {showTabs ? (
        <div className="flex gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800">
          <button
            type="button"
            onClick={() => setTab("platform")}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold transition ${
              tab === "platform"
                ? "bg-white shadow dark:bg-zinc-900"
                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            }`}
          >
            {t("connection.panelLink")} QR
          </button>
          <button
            type="button"
            onClick={() => setTab("native")}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold transition ${
              tab === "native"
                ? "bg-white shadow dark:bg-zinc-900"
                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            }`}
          >
            {t("connection.nativeLink")} QR
          </button>
        </div>
      ) : null}

      {qrValue && output.capabilities.supportsQRCode ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <QRCodeCanvas key={qrCanvasId} id={qrCanvasId} value={qrValue} size={180} includeMargin />
          <div className="hidden">
            <QRCodeSVG id={`${qrCanvasId}-svg`} value={qrValue} size={256} includeMargin />
          </div>
          {allowQRDownload ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600"
              onClick={() => {
                const canvas = document.getElementById(qrCanvasId) as HTMLCanvasElement | null;
                if (!canvas) return;
                const a = document.createElement("a");
                a.href = canvas.toDataURL("image/png");
                a.download =
                  tab === "native" ? "native-subscription-qr.png" : "platform-subscription-qr.png";
                a.click();
              }}
            >
              <Download size={12} /> {t("connection.downloadQr")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
