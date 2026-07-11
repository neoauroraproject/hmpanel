"use client";

import { Check, Copy, QrCode } from "lucide-react";
import {
  usePortalModel,
  QrModal,
  BrandMark,
  ConfigList,
  StatusPill,
  TrafficBar,
  useExpiryLabel,
  useThemeFont,
  type SubData,
} from "./portal-kit";

export default function PulseTheme({ id, data }: { id: string; data: SubData }) {
  useThemeFont("Pulse");
  const model = usePortalModel(id, data, "Pulse");
  const expiry = useExpiryLabel(model.remainingDays, data.expiryTime);
  const {
    brandName,
    logoSrc,
    clientName,
    isActive,
    isExpired,
    used,
    total,
    pct,
    formatBytes,
    systemUrl,
    copy,
    copied,
    setQrValue,
    qrValue,
    nodes,
    contacts,
    ps,
  } = model;

  const remPct = total > 0 ? Math.max(0, 100 - pct) : 100;

  return (
    <div
      className="min-h-[100dvh] bg-slate-50 text-slate-900"
      style={{ fontFamily: "'Sora', system-ui, sans-serif" }}
    >
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-6 sm:px-6">
        <header className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark
              logoSrc={logoSrc}
              brandName={brandName}
              className="h-11 w-auto max-w-[8rem] object-contain"
              fallbackClassName="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white"
            />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold tracking-tight text-slate-900">{brandName}</h1>
              <p className="truncate text-xs text-slate-500">{clientName}</p>
            </div>
          </div>
          <StatusPill isActive={isActive} isExpired={isExpired} />
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-5">
            <div
              className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-full"
              style={{
                background: `conic-gradient(#2563eb ${remPct * 3.6}deg, #e2e8f0 0deg)`,
              }}
            >
              <div className="flex h-[5.5rem] w-[5.5rem] flex-col items-center justify-center rounded-full bg-white">
                <div className="text-2xl font-bold tabular-nums text-slate-900">
                  {total > 0 ? `${Math.round(remPct)}%` : "∞"}
                </div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">left</div>
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-slate-400">Used</div>
                <div className="text-lg font-semibold tabular-nums">
                  {formatBytes(used)}
                  <span className="text-sm font-normal text-slate-400">
                    {" "}
                    / {total > 0 ? formatBytes(total) : "Unlimited"}
                  </span>
                </div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-slate-400">Expiry</div>
                <div className="text-sm font-medium text-slate-700">{expiry}</div>
              </div>
              <TrafficBar
                pct={pct}
                barClassName="bg-[#2563eb]"
                trackClassName="h-1.5 overflow-hidden rounded-full bg-slate-100"
              />
            </div>
          </div>
        </section>

        <section className="flex gap-2">
          <button
            type="button"
            onClick={() => copy(systemUrl, "system")}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#2563eb] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
          >
            {copied === "system" ? <Check size={16} /> : <Copy size={16} />}
            Copy subscription link
          </button>
          {ps.showPlatformQR !== false ? (
            <button
              type="button"
              onClick={() => setQrValue(systemUrl)}
              className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm"
              aria-label="QR"
            >
              <QrCode size={18} />
            </button>
          ) : null}
        </section>

        <ConfigList
          nodes={nodes}
          copied={copied}
          onCopy={copy}
          onQr={setQrValue}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm [&_ul]:space-y-2"
          itemClassName="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5"
        />

        {contacts.length ? (
          <div className="flex justify-center gap-2">
            {contacts.map((c) => (
              <a
                key={c.label}
                href={c.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm"
                title={c.label}
              >
                <c.icon size={16} />
              </a>
            ))}
          </div>
        ) : null}

        {ps.footerText ? (
          <p className="text-center text-xs text-slate-400">{ps.footerText}</p>
        ) : null}
      </div>

      <QrModal value={qrValue} onClose={() => setQrValue(null)} />
    </div>
  );
}
