"use client";

import { useState } from "react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { Copy, Check, Download } from "lucide-react";
import { copyToClipboard } from "@/lib/clipboard";
import type { ConnectionRendererProps } from "../RendererRegistry";
import type { SubscriptionPayload } from "../types";
import { ConnectionMethods } from "../ConnectionMethods";

export function SubscriptionRenderer({
  output,
  showPlatformQR = true,
  showNativeQR = true,
  allowQRDownload = true,
}: ConnectionRendererProps) {
  const payload = (output.payload || {}) as SubscriptionPayload;
  const [tab, setTab] = useState<"platform" | "native">(
    showNativeQR ? "native" : "platform",
  );
  const [copied, setCopied] = useState(false);

  const systemUrl = payload.systemSubUrl || "";
  const nativeUrl = payload.nativeSubUrl || "";
  const activeUrl = tab === "native" && nativeUrl ? nativeUrl : systemUrl;
  const qrValue = (payload.qrText as string) || activeUrl;

  const onCopy = async () => {
    if (!activeUrl) return;
    await copyToClipboard(activeUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-4">
      <ConnectionMethods methods={output.methods} capabilities={output.capabilities} />

      {output.warnings?.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {output.warnings.join(" · ")}
        </div>
      ) : null}

      {showPlatformQR && showNativeQR && nativeUrl ? (
        <div className="flex gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800">
          <button
            type="button"
            onClick={() => setTab("platform")}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold ${
              tab === "platform" ? "bg-white shadow dark:bg-zinc-900" : ""
            }`}
          >
            Platform QR
          </button>
          <button
            type="button"
            onClick={() => setTab("native")}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold ${
              tab === "native" ? "bg-white shadow dark:bg-zinc-900" : ""
            }`}
          >
            Native 3x-ui QR
          </button>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <input
          readOnly
          value={activeUrl}
          className="min-w-0 flex-1 truncate rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-[11px] dark:border-zinc-700 dark:bg-zinc-950"
          dir="ltr"
        />
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex h-10 shrink-0 items-center gap-1 rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {qrValue && output.capabilities.supportsQRCode ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <QRCodeCanvas id="conn-qr-canvas" value={qrValue} size={180} includeMargin />
          <div className="hidden">
            <QRCodeSVG id="conn-qr-svg" value={qrValue} size={256} includeMargin />
          </div>
          {allowQRDownload ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600"
              onClick={() => {
                const canvas = document.getElementById(
                  "conn-qr-canvas",
                ) as HTMLCanvasElement | null;
                if (!canvas) return;
                const a = document.createElement("a");
                a.href = canvas.toDataURL("image/png");
                a.download = "subscription-qr.png";
                a.click();
              }}
            >
              <Download size={12} /> Download QR
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
