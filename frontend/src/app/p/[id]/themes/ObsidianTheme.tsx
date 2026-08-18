"use client";

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

export default function ObsidianTheme({ id, data }: { id: string; data: SubData }) {
  useThemeFont("Obsidian");
  const model = usePortalModel(id, data, "Obsidian");
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
      className="min-h-[100dvh] bg-black text-[#f4f0e8]"
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
    >
      <div className="mx-auto flex w-full max-w-xl flex-col gap-8 px-5 py-10 sm:px-8">
        <header className="space-y-6">
          <BrandMark
            logoSrc={logoSrc}
            brandName={brandName}
            className="h-12 w-auto max-w-[10rem] object-contain brightness-110"
            fallbackClassName="flex h-12 w-12 items-center justify-center border border-[#c4a35a]/40 text-[#c4a35a]"
          />
          <div className="border-y border-[#c4a35a]/35 py-6">
            <h1
              className="text-5xl leading-none tracking-tight text-[#f7f1e4]"
              style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}
            >
              {brandName}
            </h1>
            <p className="mt-3 text-sm tracking-wide text-[#a39a88]">{clientName}</p>
          </div>
          <div className="flex items-center justify-between">
            <StatusPill
              isActive={isActive}
              isExpired={isExpired}
              className="rounded-none border border-[#c4a35a]/30 bg-transparent px-3 py-1 text-[#c4a35a]"
            />
            <span className="text-xs tracking-[0.2em] text-[#c4a35a]/80 uppercase">{expiry}</span>
          </div>
        </header>

        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-[#c4a35a]/70">Usage</div>
              <div className="mt-1 text-2xl tabular-nums" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
                {formatBytes(used)}
                <span className="text-base text-[#8a8274]">
                  {" "}
                  / {total > 0 ? formatBytes(total) : "Unlimited"}
                </span>
              </div>
            </div>
          </div>
          <TrafficBar
            pct={pct}
            barClassName="bg-[#c4a35a]"
            trackClassName="h-px overflow-hidden bg-[#c4a35a]/25"
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
            buttonClassName="inline-flex w-full items-center justify-center gap-2 border border-[#c4a35a] px-4 py-3 text-sm font-medium text-[#c4a35a] transition hover:bg-[#c4a35a]/10"
            nativeButtonClassName="inline-flex w-full items-center justify-center gap-2 border border-[#c4a35a]/40 px-4 py-3 text-sm font-medium text-[#a39a88] transition hover:border-[#c4a35a]/70 hover:text-[#c4a35a]"
          />
          {ps.showPlatformQR !== false ? (
            <button
              type="button"
              onClick={() => setQrValue(systemUrl)}
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center self-center border border-[#c4a35a]/50 text-[#c4a35a]"
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
          title="Index"
          className="[&_h3]:text-2xl [&_h3]:font-normal [&_h3]:tracking-tight [&_ul]:[counter-reset:cfg] [&_li]:relative [&_li]:pl-10 [&_li]:before:absolute [&_li]:before:left-0 [&_li]:before:top-3 [&_li]:before:text-sm [&_li]:before:text-[#c4a35a] [&_li]:before:content-[counter(cfg,decimal-leading-zero)] [&_li]:[counter-increment:cfg]"
          itemClassName="border-b border-[#c4a35a]/20 py-3 first:border-t"
        />

        {contacts.length ? (
          <div className="flex gap-4 border-t border-[#c4a35a]/25 pt-6">
            {contacts.map((c) => (
              <a
                key={c.label}
                href={c.href}
                target="_blank"
                rel="noreferrer"
                className="text-[#c4a35a] transition hover:text-[#f4f0e8]"
                title={c.label}
              >
                <c.icon size={18} />
              </a>
            ))}
          </div>
        ) : null}

        {ps.footerText ? (
          <p className="text-center text-xs text-[#6f675c]">{ps.footerText}</p>
        ) : null}
      </div>

      <QrModal value={qrValue} onClose={() => setQrValue(null)} />
    </div>
  );
}
