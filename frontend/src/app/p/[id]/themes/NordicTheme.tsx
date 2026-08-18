"use client";

import type { CSSProperties } from "react";
import { QrCode } from "lucide-react";
import {
  usePortalModel,
  DualSubCopyButtons,
  QrModal,
  BrandMark,
  ConfigList,
  StatusPill,
  TrafficBar,
  useExpiryLabel,
  useThemeFont,
  type SubData,
} from "./portal-kit";

export default function NordicTheme({ id, data }: { id: string; data: SubData }) {
  useThemeFont("Nordic");
  const model = usePortalModel(id, data, "Nordic");
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
    nativeUrl,
    copy,
    copied,
    setQrValue,
    qrValue,
    nodes,
    contacts,
    ps,
    t,
  } = model;

  return (
    <div
      className="min-h-[100dvh] text-[#2a2e2a]"
      style={
        {
          ["--nordic-paper" as string]: "#f7f4ef",
          ["--nordic-sage" as string]: "#5f7a5d",
          background: "var(--nordic-paper)",
          fontFamily: "'Source Sans 3', system-ui, sans-serif",
        } as CSSProperties
      }
    >
      <div className="mx-auto flex w-full max-w-lg flex-col gap-8 px-5 py-12 sm:px-8">
        <header className="space-y-6">
          <BrandMark
            logoSrc={logoSrc}
            brandName={brandName}
            className="h-12 w-auto max-w-[10rem] object-contain"
            fallbackClassName="flex h-12 w-12 items-center justify-center rounded-full bg-[#5f7a5d]/12 text-[#5f7a5d]"
          />
          <div>
            <h1
              className="text-5xl font-medium leading-[1.05] tracking-tight text-[#1f241f]"
              style={{ fontFamily: "'Fraunces', Georgia, serif" }}
            >
              {brandName}
            </h1>
            <p className="mt-3 max-w-sm text-base leading-relaxed text-[#5c635c]">{clientName}</p>
          </div>
          <StatusPill
            isActive={isActive}
            isExpired={isExpired}
            className="rounded-full bg-[#5f7a5d]/12 text-[#5f7a5d]"
          />
        </header>

        <section className="space-y-4">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-[#7a817a]">Traffic</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">
                {formatBytes(used)}
                <span className="text-sm font-normal text-[#7a817a]">
                  {" "}
                  / {total > 0 ? formatBytes(total) : "∞"}
                </span>
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-[#7a817a]">Expires</div>
              <div className="mt-1 text-xl font-semibold" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
                {expiry}
              </div>
            </div>
          </div>
          <TrafficBar
            pct={pct}
            barClassName="bg-[#5f7a5d]"
            trackClassName="h-1.5 overflow-hidden rounded-full bg-[#d9d3c8]"
          />
        </section>

        <section className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          <DualSubCopyButtons
            systemUrl={systemUrl}
            nativeUrl={nativeUrl}
            copied={copied}
            onCopy={copy}
            onQr={setQrValue}
            t={t}
            showNative={ps.showNativeQR !== false}
            className="flex-1"
            buttonClassName="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#5f7a5d] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[#4f684e]"
            nativeButtonClassName="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#cfc8bb] bg-white px-5 py-3.5 text-sm font-semibold text-[#5f7a5d] transition hover:bg-[#f0ebe3]"
          />
          {ps.showPlatformQR !== false ? (
            <button
              type="button"
              onClick={() => setQrValue(systemUrl)}
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center self-center rounded-full border border-[#cfc8bb] bg-white text-[#5f7a5d]"
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
          className="space-y-1"
          itemClassName="rounded-2xl bg-white/70 px-3 py-3 shadow-[0_1px_0_rgba(0,0,0,0.04)]"
        />

        {contacts.length ? (
          <div className="flex flex-wrap gap-3 pt-2">
            {contacts.map((c) => (
              <a
                key={c.label}
                href={c.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-[#d8d1c4] bg-white/80 px-4 py-2 text-sm text-[#445044]"
                title={c.label}
              >
                <c.icon size={16} />
                {c.label}
              </a>
            ))}
          </div>
        ) : null}

        {ps.footerText ? (
          <p className="pt-4 text-center text-xs text-[#8a9188]">{ps.footerText}</p>
        ) : null}
      </div>

      <QrModal value={qrValue} onClose={() => setQrValue(null)} />
    </div>
  );
}
