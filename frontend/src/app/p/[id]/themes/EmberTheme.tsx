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

export default function EmberTheme({ id, data }: { id: string; data: SubData }) {
  useThemeFont("Ember");
  const model = usePortalModel(id, data, "Ember");
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
      className="relative min-h-[100dvh] overflow-hidden text-orange-50"
      style={
        {
          ["--ember-bg" as string]: "#141210",
          ["--ember-orange" as string]: "#ff6a1a",
          background: "var(--ember-bg)",
          fontFamily: "'Manrope', system-ui, sans-serif",
        } as CSSProperties
      }
    >
      <div className="pointer-events-none absolute -right-20 top-0 h-72 w-72 rounded-full bg-[#ff6a1a]/20 blur-[100px]" />
      <div className="pointer-events-none absolute -left-16 bottom-24 h-56 w-56 rounded-full bg-[#ff6a1a]/10 blur-[80px]" />

      <div className="relative z-10 mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-8 sm:px-6">
        <header className="space-y-4">
          <div className="flex items-center gap-4">
            <BrandMark
              logoSrc={logoSrc}
              brandName={brandName}
              className="h-14 w-auto max-w-[10rem] object-contain"
              fallbackClassName="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#ff6a1a] text-white"
            />
            <StatusPill
              isActive={isActive}
              isExpired={isExpired}
              className="rounded-lg bg-[#ff6a1a]/15 text-[#ff6a1a]"
            />
          </div>
          <h1 className="text-5xl font-extrabold leading-none tracking-tight text-white">{brandName}</h1>
          <p className="text-sm text-stone-400">{clientName}</p>
        </header>

        <section className="rounded-3xl border border-[#ff6a1a]/25 bg-gradient-to-br from-[#1c1814] to-[#12100e] p-5">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1a]">Burn rate</div>
              <div className="mt-1 text-3xl font-extrabold tabular-nums text-white">
                {formatBytes(used)}
              </div>
              <div className="text-sm text-stone-400">
                of {total > 0 ? formatBytes(total) : "Unlimited"}
              </div>
            </div>
            <div className="text-right text-sm font-semibold text-stone-300">{expiry}</div>
          </div>
          <TrafficBar
            pct={pct}
            barClassName="bg-[#ff6a1a]"
            trackClassName="h-2.5 overflow-hidden rounded-full bg-black/40"
          />
        </section>

        <section className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <DualSubCopyButtons
            systemUrl={systemUrl}
            nativeUrl={nativeUrl}
            copied={copied}
            onCopy={copy}
            t={t}
            showNative={ps.showNativeQR !== false}
            className="flex-1"
            buttonClassName="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#ff6a1a] px-4 py-3.5 text-sm font-extrabold text-[#1a0c04] transition hover:bg-[#ff812f]"
            nativeButtonClassName="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[#ff6a1a]/40 bg-[#1c1814] px-4 py-3.5 text-sm font-extrabold text-[#ff6a1a] transition hover:bg-[#ff6a1a]/10"
          />
          {ps.showPlatformQR !== false ? (
            <button
              type="button"
              onClick={() => setQrValue(systemUrl)}
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center self-center rounded-2xl border border-[#ff6a1a]/40 bg-[#1c1814] text-[#ff6a1a]"
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
          className="rounded-3xl border border-white/5 bg-[#1a1714] p-4"
          itemClassName="rounded-2xl border border-[#ff6a1a]/10 bg-black/30 px-3 py-2.5"
        />

        {contacts.length ? (
          <div className="flex flex-wrap gap-2">
            {contacts.map((c) => (
              <a
                key={c.label}
                href={c.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#ff6a1a]/15 text-[#ff6a1a]"
                title={c.label}
              >
                <c.icon size={18} />
              </a>
            ))}
          </div>
        ) : null}

        {ps.footerText ? (
          <p className="text-center text-xs text-stone-500">{ps.footerText}</p>
        ) : null}
      </div>

      <QrModal value={qrValue} onClose={() => setQrValue(null)} />
    </div>
  );
}
