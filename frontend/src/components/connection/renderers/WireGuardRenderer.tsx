"use client";

import { useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Copy, Check, Download } from "lucide-react";
import { copyToClipboard } from "@/lib/clipboard";
import { API_BASE } from "@/lib/api";
import type { ConnectionRendererProps } from "../RendererRegistry";
import type { WireGuardPayload } from "../types";
import { ConnectionMethods } from "../ConnectionMethods";

function resolveDownloadHref(
  admin: boolean | undefined,
  payload: WireGuardPayload,
  clientId: string,
) {
  const path = admin
    ? payload.adminDownloadPath || `/clients/${clientId}/config`
    : payload.downloadPath || `/subscriptions/${clientId}/config`;
  if (path.startsWith("http")) return path;
  const base = API_BASE.replace(/\/$/, "");
  const rel = path.startsWith("/") ? path : `/${path}`;
  return `${base}${rel}`;
}

export function WireGuardRenderer({ output, admin }: ConnectionRendererProps) {
  const payload = (output.payload || {}) as WireGuardPayload;
  const [copied, setCopied] = useState(false);
  const configText = payload.configText || "";
  const qrText = payload.qrText || "";
  const downloadHref = resolveDownloadHref(admin, payload, output.clientId);

  const onCopy = async () => {
    if (!configText) return;
    await copyToClipboard(configText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-4">
      <ConnectionMethods methods={output.methods} capabilities={output.capabilities} />

      {output.warnings?.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {output.warnings.join(" · ")}
        </div>
      ) : null}

      {configText ? (
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Configuration Preview
          </div>
          <pre className="max-h-56 overflow-auto rounded-xl bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-100">
            {configText}
          </pre>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {configText ? (
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500"
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? "Copied" : "Copy Configuration"}
          </button>
        ) : null}
        {output.capabilities.supportsDownload && configText ? (
          <a
            href={downloadHref}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <Download size={15} />
            Download .conf
          </a>
        ) : null}
      </div>

      {qrText && output.capabilities.supportsQRCode ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <QRCodeCanvas value={qrText} size={180} includeMargin />
          <p className="text-center text-[12px] text-zinc-500">
            Scan with WireGuard app (Android / iOS / Desktop)
          </p>
        </div>
      ) : null}

      {payload.details ? (
        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-zinc-200 p-3 text-[12px] dark:border-zinc-700">
          {Object.entries(payload.details).map(([k, v]) =>
            v == null || v === "" ? null : (
              <div key={k} className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                  {k}
                </div>
                <div className="truncate font-medium text-zinc-800 dark:text-zinc-100">
                  {String(v)}
                </div>
              </div>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
