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

export default function StudioTheme({ id, data }: { id: string; data: SubData }) {
  useThemeFont("Studio");
  const model = usePortalModel(id, data, "Studio");
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
          ["--studio-bg" as string]: "#1c1b1f",
          ["--studio-coral" as string]: "#ff6b4a",
          background: "var(--studio-bg)",
          fontFamily: "'Work Sans', system-ui, sans-serif",
        } as CSSProperties
      }
    >
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-8 sm:px-6">
        <header className="grid grid-cols-[1.2fr_0.8fr] gap-4">
          <div className="space-y-4">
            <BrandMark
              logoSrc={logoSrc}
              brandName={brandName}
              className="h-10 w-auto max-w-[8rem] object-contain"
              fallbackClassName="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ff6b4a] text-white"
            />
            <h1
              className="text-4xl font-extrabold leading-[0.95] tracking-tight text-white sm:text-5xl"
              style={{ fontFamily: "'Syne', system-ui, sans-serif" }}
            >
              {brandName}
            </h1>
            <p className="text-sm text-zinc-400">{clientName}</p>
            <StatusPill
              isActive={isActive}
              isExpired={isExpired}
              className="rounded-md bg-[#ff6b4a]/15 text-[#ff6b4a]"
            />
          </div>

          <aside className="flex flex-col justify-between rounded-3xl border border-white/8 bg-[#252428] p-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#ff6b4a]">
                Traffic
              </div>
              <div className="mt-2 text-xl font-bold tabular-nums" style={{ fontFamily: "'Syne', system-ui, sans-serif" }}>
                {formatBytes(used)}
              </div>
              <div className="text-xs text-zinc-500">
                / {total > 0 ? formatBytes(total) : "Unlimited"}
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <div className="text-xs text-zinc-400">{expiry}</div>
              <TrafficBar
                pct={pct}
                barClassName="bg-[#ff6b4a]"
                trackClassName="h-1.5 overflow-hidden rounded-full bg-white/10"
              />
            </div>
          </aside>
        </header>

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
            buttonClassName="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#ff6b4a] px-4 py-3 text-sm font-semibold text-[#1c1b1f] transition hover:bg-[#ff8163]"
            nativeButtonClassName="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-[#252428] px-4 py-3 text-sm font-semibold text-[#ff6b4a] transition hover:border-[#ff6b4a]/40"
          />
          {ps.showPlatformQR !== false ? (
            <button
              type="button"
              onClick={() => setQrValue(systemUrl)}
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center self-center rounded-2xl border border-white/10 bg-[#252428] text-[#ff6b4a]"
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
          className="rounded-3xl border border-white/8 bg-[#252428] p-4"
          itemClassName="rounded-2xl bg-[#1c1b1f] px-3 py-2.5"
        />

        {contacts.length ? (
          <div className="flex gap-2">
            {contacts.map((c) => (
              <a
                key={c.label}
                href={c.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-zinc-300 transition hover:border-[#ff6b4a]/50 hover:text-[#ff6b4a]"
                title={c.label}
              >
                <c.icon size={16} />
              </a>
            ))}
          </div>
        ) : null}

        {ps.footerText ? (
          <p className="text-center text-xs text-zinc-500">{ps.footerText}</p>
        ) : null}
      </div>

      <QrModal value={qrValue} onClose={() => setQrValue(null)} />
    </div>
  );
}
