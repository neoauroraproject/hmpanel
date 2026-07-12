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

/** Horizon Atelier — dusk navy field, warm amber accent, formal & calm. */
export default function SunsetTheme({ id, data }: { id: string; data: SubData }) {
  const model = usePortalModel(id, data, "Sunset");
  useThemeFont("Sunset", model.isFa);
  const expiry = useExpiryLabel(model.remainingDays, data.expiryTime, model.t);
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
    t,
    statusLabel,
    fontFamily,
    lang,
    setLang,
  } = model;

  return (
    <div
      className="relative min-h-[100dvh] overflow-hidden text-[#f6efe6]"
      style={
        {
          fontFamily: fontFamily || "'Sora', 'Segoe UI', sans-serif",
          background:
            "radial-gradient(120% 80% at 50% -10%, #3a2818 0%, #151a28 42%, #0c1018 100%)",
        } as CSSProperties
      }
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-amber-500/25 via-orange-600/10 to-transparent" />
      <div className="pointer-events-none absolute -bottom-24 left-1/2 h-56 w-[120%] -translate-x-1/2 rounded-[100%] bg-amber-600/15 blur-3xl" />

      <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 sm:px-6 lg:py-14">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <BrandMark
              logoSrc={logoSrc}
              brandName={brandName}
              className="h-12 w-auto max-w-[9rem] object-contain"
              fallbackClassName="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-200"
            />
            <div>
              <h1
                className="text-2xl font-semibold tracking-tight text-[#fff7ed] sm:text-3xl"
                style={{ fontFamily: fontFamily || "'Source Serif 4', Georgia, serif" }}
              >
                {brandName}
              </h1>
              <p className="mt-0.5 text-sm text-amber-100/50">{t("systemSub")}</p>
            </div>
          </div>
          <LangToggle lang={lang} setLang={setLang} className="border-amber-200/20 text-amber-100" />
        </div>

        <header className="space-y-4 text-center sm:pt-4">
          <p className="text-xs font-medium tracking-[0.28em] text-amber-200/55 uppercase">
            {statusLabel}
          </p>
          <h2
            className="text-4xl font-semibold tracking-tight text-white sm:text-5xl"
            style={{ fontFamily: fontFamily || "'Source Serif 4', Georgia, serif" }}
          >
            {clientName}
          </h2>
          <p className="text-sm text-amber-50/45">{expiry}</p>
        </header>

        <section className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.25)] backdrop-blur-md sm:p-8">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-xs font-medium tracking-[0.18em] text-amber-200/55 uppercase">
                {t("usage")}
              </div>
              <div className="mt-2 text-3xl font-semibold tabular-nums text-white sm:text-4xl">
                {formatBytes(used)}
                <span className="ms-2 text-base font-normal text-amber-50/40">
                  / {total > 0 ? formatBytes(total) : t("unlimited")}
                </span>
              </div>
            </div>
            <div
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                isActive
                  ? "bg-amber-400/15 text-amber-200"
                  : isExpired
                    ? "bg-rose-400/15 text-rose-200"
                    : "bg-white/10 text-white/60"
              }`}
            >
              {statusLabel}
            </div>
          </div>
          <TrafficBar
            pct={pct}
            barClassName="bg-gradient-to-r from-amber-500 to-orange-300"
            trackClassName="h-2 overflow-hidden rounded-full bg-white/10"
          />
        </section>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => copy(systemUrl, "system")}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#f3b36a] px-5 py-3.5 text-sm font-semibold text-[#1a120c] transition hover:bg-[#f6c48a]"
          >
            {copied === "system" ? <Check size={16} /> : <Copy size={16} />}
            {copied === "system" ? t("copied") : t("copyLink")}
          </button>
          {ps.showPlatformQR !== false ? (
            <button
              type="button"
              onClick={() => setQrValue(systemUrl)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-200/20 bg-white/[0.04] px-5 py-3.5 text-sm font-semibold text-amber-50 transition hover:bg-white/[0.07]"
            >
              <QrCode size={16} />
              {t("scanQr")}
            </button>
          ) : null}
        </div>

        <ConfigList
          nodes={nodes}
          copied={copied}
          onCopy={copy}
          onQr={setQrValue}
          title={t("configs")}
          empty={t("noConfigs")}
          nodesLabel={t("nodes")}
          className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4 sm:p-5"
          itemClassName="rounded-2xl border border-white/8 bg-[#121722]/60 px-3 py-2.5"
        />

        {contacts.length ? (
          <div className="flex flex-wrap justify-center gap-2">
            {contacts.map((c) => (
              <a
                key={c.kind}
                href={c.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-amber-100/15 bg-white/[0.03] px-4 py-2 text-sm text-amber-50/80 transition hover:border-amber-200/35"
              >
                <c.icon size={15} />
                {c.label}
              </a>
            ))}
          </div>
        ) : null}

        {ps.footerText ? (
          <p className="text-center text-xs text-amber-50/35">{ps.footerText}</p>
        ) : null}
      </div>

      <QrModal value={qrValue} onClose={() => setQrValue(null)} title={t("scanQr")} />
    </div>
  );
}
