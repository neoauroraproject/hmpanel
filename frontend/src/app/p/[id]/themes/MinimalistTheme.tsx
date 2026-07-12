"use client";

import type { CSSProperties } from "react";
import { Check, Copy, QrCode } from "lucide-react";
import {
  usePortalModel,
  QrModal,
  BrandMark,
  ConfigList,
  TrafficBar,
  LangToggle,
  useExpiryLabel,
  useThemeFont,
  type SubData,
} from "./portal-kit";

/** Quiet Ledger — sparse white field, editorial type, hairline structure. */
export default function MinimalistTheme({ id, data }: { id: string; data: SubData }) {
  const model = usePortalModel(id, data, "Minimalist");
  useThemeFont("Minimalist", model.isFa);
  const expiry = useExpiryLabel(model.remainingDays, data.expiryTime, model.t);
  const {
    brandName,
    logoSrc,
    clientName,
    isActive,
    used,
    total,
    pct,
    up,
    down,
    formatBytes,
    systemUrl,
    copy,
    copied,
    setQrValue,
    qrValue,
    nodes,
    contacts,
    ps,
    t,
    statusLabel,
    fontFamily,
    lang,
    setLang,
  } = model;

  return (
    <div
      className="min-h-[100dvh] bg-[#f7f6f3] text-[#141414]"
      style={
        {
          fontFamily: fontFamily || "'DM Sans', 'Segoe UI', sans-serif",
        } as CSSProperties
      }
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col px-5 py-8 sm:px-8 sm:py-14">
        <div className="mb-12 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BrandMark
              logoSrc={logoSrc}
              brandName={brandName}
              className="h-10 w-auto max-w-[8rem] object-contain"
              fallbackClassName="flex h-10 w-10 items-center justify-center border border-[#141414]/15 text-[#141414]"
            />
            <span className="text-xs font-medium tracking-[0.22em] text-[#141414]/45 uppercase">
              {brandName}
            </span>
          </div>
          <LangToggle lang={lang} setLang={setLang} className="border-[#141414]/20 text-[#141414]" />
        </div>

        <header className="mb-10 space-y-3 border-b border-[#141414]/10 pb-10">
          <p className="text-[11px] font-medium tracking-[0.24em] text-[#141414]/40 uppercase">
            {statusLabel}
          </p>
          <h1
            className="text-4xl leading-[1.05] text-[#141414] sm:text-6xl"
            style={{ fontFamily: fontFamily || "'Instrument Serif', Georgia, serif" }}
          >
            {clientName}
          </h1>
          <p className="text-sm text-[#141414]/45">{expiry}</p>
        </header>

        <section className="mb-10 space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[11px] font-medium tracking-[0.2em] text-[#141414]/40 uppercase">
                {t("traffic")}
              </div>
              <div className="mt-2 text-3xl font-medium tabular-nums tracking-tight sm:text-4xl">
                {formatBytes(used)}
                <span className="ms-2 text-base font-normal text-[#141414]/35">
                  / {total > 0 ? formatBytes(total) : t("unlimited")}
                </span>
              </div>
            </div>
            <div className="space-y-1 text-end text-xs text-[#141414]/45">
              <div>
                {t("download")} · {formatBytes(down)}
              </div>
              <div>
                {t("upload")} · {formatBytes(up)}
              </div>
            </div>
          </div>
          <TrafficBar
            pct={pct}
            barClassName="bg-[#141414]"
            trackClassName="h-0.5 overflow-hidden bg-[#141414]/12"
          />
          <div className="flex items-center gap-2 text-xs text-[#141414]/40">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${isActive ? "bg-emerald-600" : "bg-rose-500"}`}
            />
            {statusLabel}
          </div>
        </section>

        <section className="mb-12 flex flex-col gap-3 border-y border-[#141414]/10 py-8 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => copy(systemUrl, "system")}
            className="inline-flex flex-1 items-center justify-center gap-2 bg-[#141414] px-5 py-3.5 text-sm font-medium tracking-wide text-[#f7f6f3] transition hover:bg-[#2a2a2a]"
          >
            {copied === "system" ? <Check size={16} /> : <Copy size={16} />}
            {copied === "system" ? t("copied") : t("copyLink")}
          </button>
          {ps.showPlatformQR !== false ? (
            <button
              type="button"
              onClick={() => setQrValue(systemUrl)}
              className="inline-flex items-center justify-center gap-2 border border-[#141414]/20 px-5 py-3.5 text-sm font-medium transition hover:border-[#141414]/45"
            >
              <QrCode size={16} />
              {t("qr")}
            </button>
          ) : null}
        </section>

        <ConfigList
          nodes={nodes}
          copied={copied}
          onCopy={copy}
          onQr={setQrValue}
          title={t("configs")}
          empty={t("noConfigs")}
          nodesLabel={t("nodes")}
          className="mb-12"
          itemClassName="border-b border-[#141414]/8 px-0 py-3 last:border-b-0"
        />

        {contacts.length ? (
          <div className="mb-8 flex flex-wrap gap-x-6 gap-y-3">
            {contacts.map((c) => (
              <a
                key={c.kind}
                href={c.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm text-[#141414]/70 underline-offset-4 transition hover:text-[#141414] hover:underline"
              >
                <c.icon size={14} />
                {c.label}
              </a>
            ))}
          </div>
        ) : null}

        {ps.footerText ? (
          <p className="border-t border-[#141414]/10 pt-6 text-center text-xs text-[#141414]/35">
            {ps.footerText}
          </p>
        ) : null}
      </div>

      <QrModal value={qrValue} onClose={() => setQrValue(null)} title={t("scanQr")} />
    </div>
  );
}
