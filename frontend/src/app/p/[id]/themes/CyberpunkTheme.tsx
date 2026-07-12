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

/** Signal Deck — graphite HUD, cyan accent, sharp geometry. */
export default function CyberpunkTheme({ id, data }: { id: string; data: SubData }) {
  const model = usePortalModel(id, data, "Cyberpunk");
  useThemeFont("Cyberpunk", model.isFa);
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
      className="relative min-h-[100dvh] text-[#e8f7ff]"
      style={
        {
          fontFamily: fontFamily || "'Syne', 'Segoe UI', sans-serif",
          background: "#07080c",
          ["--cx" as string]: "#22d3ee",
        } as CSSProperties
      }
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(34,211,238,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.06) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/80 to-transparent" />

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pb-28 pt-5 sm:px-6 sm:pb-10 lg:py-10">
        <div className="flex items-center justify-between gap-3 border border-cyan-400/25 bg-[#0c0e14] px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark
              logoSrc={logoSrc}
              brandName={brandName}
              className="h-9 w-auto max-w-[7.5rem] object-contain"
              fallbackClassName="flex h-9 w-9 items-center justify-center border border-cyan-400/40 bg-cyan-400/10 text-cyan-300"
            />
            <div className="min-w-0">
              <div
                className="truncate text-sm font-bold tracking-[0.14em] text-white uppercase"
                style={{ fontFamily: fontFamily || "'Syne', sans-serif" }}
              >
                {brandName}
              </div>
              <div
                className="truncate font-mono text-[10px] tracking-wider text-cyan-400/70"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                SIGNAL // {isActive ? "ONLINE" : "OFFLINE"}
              </div>
            </div>
          </div>
          <LangToggle lang={lang} setLang={setLang} className="border-cyan-400/30 text-cyan-200" />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.35fr_0.85fr]">
          <section className="border border-white/10 bg-[#0c0e14] p-5 sm:p-7">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex border px-2.5 py-1 font-mono text-[10px] font-semibold tracking-[0.16em] uppercase ${
                  isActive
                    ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-300"
                    : "border-rose-400/40 bg-rose-500/10 text-rose-300"
                }`}
              >
                {statusLabel}
              </span>
              <span className="font-mono text-[10px] text-white/35 tracking-wider">{expiry}</span>
            </div>
            <h1
              className="text-3xl font-extrabold tracking-tight text-white sm:text-5xl"
              style={{ fontFamily: fontFamily || "'Syne', sans-serif" }}
            >
              {clientName}
            </h1>
            {data.uuid ? (
              <p
                className="mt-3 truncate font-mono text-[11px] text-cyan-400/55"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                ID {data.uuid}
              </p>
            ) : null}

            <div className="mt-8 space-y-3">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="font-mono text-[10px] tracking-[0.2em] text-cyan-400/60 uppercase">
                    {t("traffic")}
                  </div>
                  <div className="mt-1 text-2xl font-bold tabular-nums text-white sm:text-3xl">
                    {formatBytes(used)}
                    <span className="ms-2 text-sm font-medium text-white/40">
                      / {total > 0 ? formatBytes(total) : t("unlimited")}
                    </span>
                  </div>
                </div>
                <div
                  className="text-end font-mono text-[11px] text-white/45"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  <div>
                    ↓ {formatBytes(down)}
                  </div>
                  <div>
                    ↑ {formatBytes(up)}
                  </div>
                </div>
              </div>
              <TrafficBar
                pct={pct}
                barClassName="bg-cyan-400"
                trackClassName="h-1.5 overflow-hidden bg-white/10"
              />
            </div>
          </section>

          <section className="flex flex-col gap-3 border border-cyan-400/20 bg-[#0c0e14] p-5">
            <div
              className="font-mono text-[10px] tracking-[0.22em] text-cyan-400/70 uppercase"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {t("connect")}
            </div>
            <button
              type="button"
              onClick={() => copy(systemUrl, "system")}
              className="inline-flex flex-1 items-center justify-center gap-2 border border-cyan-400 bg-cyan-400 px-4 py-3.5 text-sm font-bold tracking-wide text-[#041016] transition hover:bg-cyan-300"
            >
              {copied === "system" ? <Check size={16} /> : <Copy size={16} />}
              {copied === "system" ? t("copied") : t("copyLink")}
            </button>
            {ps.showPlatformQR !== false ? (
              <button
                type="button"
                onClick={() => setQrValue(systemUrl)}
                className="inline-flex items-center justify-center gap-2 border border-white/15 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-cyan-200 transition hover:border-cyan-400/40"
              >
                <QrCode size={16} />
                {t("qr")}
              </button>
            ) : null}
            <p
              className="truncate font-mono text-[10px] text-white/30"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
              title={systemUrl}
            >
              {systemUrl}
            </p>
          </section>
        </div>

        <ConfigList
          nodes={nodes}
          copied={copied}
          onCopy={copy}
          onQr={setQrValue}
          title={t("configs")}
          empty={t("noConfigs")}
          nodesLabel={t("nodes")}
          className="border border-white/10 bg-[#0c0e14] p-4"
          itemClassName="border border-white/8 bg-black/30 px-3 py-2.5"
        />

        {contacts.length ? (
          <div className="flex flex-wrap gap-2">
            {contacts.map((c) => (
              <a
                key={c.kind}
                href={c.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 border border-white/10 px-3 py-2 font-mono text-[11px] tracking-wide text-cyan-100/80 transition hover:border-cyan-400/40"
              >
                <c.icon size={14} />
                {c.label}
              </a>
            ))}
          </div>
        ) : null}

        {ps.footerText ? (
          <p className="text-center font-mono text-[11px] text-white/30">{ps.footerText}</p>
        ) : null}
      </div>

      {/* Mobile sticky actions */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-cyan-400/20 bg-[#07080c]/95 p-3 backdrop-blur-md sm:hidden">
        <div className="mx-auto flex max-w-5xl gap-2">
          <button
            type="button"
            onClick={() => copy(systemUrl, "system-m")}
            className="inline-flex flex-1 items-center justify-center gap-2 bg-cyan-400 py-3 text-sm font-bold text-[#041016]"
          >
            {copied === "system-m" || copied === "system" ? <Check size={16} /> : <Copy size={16} />}
            {copied === "system-m" || copied === "system" ? t("copied") : t("copyLink")}
          </button>
          {ps.showPlatformQR !== false ? (
            <button
              type="button"
              onClick={() => setQrValue(systemUrl)}
              className="inline-flex h-12 w-12 items-center justify-center border border-cyan-400/40 text-cyan-300"
              aria-label={t("qr")}
            >
              <QrCode size={18} />
            </button>
          ) : null}
        </div>
      </div>

      <QrModal value={qrValue} onClose={() => setQrValue(null)} title={t("scanQr")} />
    </div>
  );
}
