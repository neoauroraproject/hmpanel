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

export default function NeonTheme({ id, data }: { id: string; data: SubData }) {
  useThemeFont("Neon");
  const model = usePortalModel(id, data, "Neon");
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
      className="min-h-[100dvh] text-zinc-100"
      style={
        {
          ["--neon-bg" as string]: "#07080c",
          ["--neon-cyan" as string]: "#22d3ee",
          background: "var(--neon-bg)",
          fontFamily: "'Space Grotesk', system-ui, sans-serif",
        } as CSSProperties
      }
    >
      <div className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 py-8 sm:px-6">
        <header className="space-y-4 border-b border-cyan-400/20 pb-6">
          <div className="flex items-center justify-between gap-3">
            <BrandMark
              logoSrc={logoSrc}
              brandName={brandName}
              className="h-10 w-auto max-w-[8rem] object-contain"
              fallbackClassName="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-400/40 text-cyan-300"
            />
            <StatusPill
              isActive={isActive}
              isExpired={isExpired}
              className="rounded-md border border-cyan-400/30 bg-cyan-400/10 text-cyan-300"
            />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-white">{brandName}</h1>
          <p className="text-sm text-zinc-500">
            <span
              className="mr-2 rounded border border-cyan-400/25 bg-cyan-400/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-cyan-300"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              client
            </span>
            {clientName}
          </p>
        </header>

        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/5 bg-[#0c0e14] p-4">
            <div
              className="text-[10px] uppercase tracking-[0.2em] text-cyan-400/70"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              traffic
            </div>
            <div className="mt-2 text-lg font-semibold tabular-nums">
              {formatBytes(used)}
              <div className="text-xs font-normal text-zinc-500">
                of {total > 0 ? formatBytes(total) : "Unlimited"}
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-white/5 bg-[#0c0e14] p-4">
            <div
              className="text-[10px] uppercase tracking-[0.2em] text-cyan-400/70"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              expiry
            </div>
            <div className="mt-2 text-sm font-semibold leading-snug">{expiry}</div>
          </div>
          <div className="col-span-2">
            <TrafficBar
              pct={pct}
              barClassName="bg-[#22d3ee]"
              trackClassName="h-1 overflow-hidden rounded-full bg-white/5"
            />
          </div>
        </section>

        <section className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <DualSubCopyButtons
            systemUrl={systemUrl}
            nativeUrl={nativeUrl}
            copied={copied}
            onCopy={copy}
            onQr={setQrValue}
            t={t}
            showNative={ps.showNativeQR !== false}
            className="flex-1"
            buttonClassName="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-400/20"
            nativeButtonClassName="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-[#0c0e14] px-4 py-3 text-sm font-semibold text-cyan-300/80 transition hover:border-cyan-400/30 hover:bg-cyan-400/5"
          />
          {ps.showPlatformQR !== false ? (
            <button
              type="button"
              onClick={() => setQrValue(systemUrl)}
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center self-center rounded-lg border border-white/10 bg-[#0c0e14] text-cyan-300"
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
          className="[&_h3]:tracking-wide [&_span.rounded-md]:font-mono [&_span.rounded-md]:text-cyan-300 [&_span.rounded-md]:bg-cyan-400/10"
          itemClassName="rounded-lg border border-white/5 bg-[#0c0e14] px-3 py-2.5"
        />

        {contacts.length ? (
          <div className="flex gap-2 border-t border-white/5 pt-4">
            {contacts.map((c) => (
              <a
                key={c.label}
                href={c.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-zinc-400 transition hover:border-cyan-400/40 hover:text-cyan-300"
                title={c.label}
              >
                <c.icon size={16} />
              </a>
            ))}
          </div>
        ) : null}

        {ps.footerText ? (
          <p
            className="text-center text-[10px] uppercase tracking-[0.18em] text-zinc-600"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {ps.footerText}
          </p>
        ) : null}
      </div>

      <QrModal value={qrValue} onClose={() => setQrValue(null)} />
    </div>
  );
}
