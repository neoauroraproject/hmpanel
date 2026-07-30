"use client";

import { useState, type CSSProperties } from "react";
import { MonitorSmartphone, QrCode } from "lucide-react";
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
  PortalConnectionPanel,
  type SubData,
} from "./portal-kit";
import { ClientAppsSheet } from "./client-apps";

export default function AuroraTheme({ id, data }: { id: string; data: SubData }) {
  useThemeFont("Aurora");
  const model = usePortalModel(id, data, "Aurora");
  const expiry = useExpiryLabel(model.remainingDays, data.expiryTime);
  const [importSheet, setImportSheet] = useState(false);
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
    connectionOutput,
    outputType,
    t,
  } = model;

  return (
    <div
      className="relative min-h-[100dvh] overflow-hidden text-slate-100"
      style={
        {
          ["--aurora-bg" as string]: "#07101f",
          ["--aurora-teal" as string]: "#2dd4bf",
          fontFamily: "'Outfit', system-ui, sans-serif",
          background: "var(--aurora-bg)",
        } as CSSProperties
      }
    >
      <div className="pointer-events-none absolute -left-24 -top-16 h-72 w-72 rounded-full bg-teal-400/25 blur-[100px]" />
      <div className="pointer-events-none absolute -right-16 top-1/3 h-80 w-80 rounded-full bg-cyan-500/20 blur-[110px]" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-emerald-400/15 blur-[90px]" />

      <div className="relative z-10 mx-auto flex w-full max-w-lg flex-col gap-5 px-4 py-8 sm:px-6">
        <header className="space-y-5 text-center">
          <div className="flex justify-center">
            <BrandMark
              logoSrc={logoSrc}
              brandName={brandName}
              className="h-14 w-auto max-w-[11rem] object-contain drop-shadow-[0_0_24px_rgba(45,212,191,0.35)]"
              fallbackClassName="flex h-14 w-14 items-center justify-center rounded-3xl bg-white/10 text-teal-300 backdrop-blur-xl"
            />
          </div>
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-white">{brandName}</h1>
            <p className="mt-2 text-sm text-slate-400">{clientName}</p>
          </div>
          <div className="flex justify-center">
            <StatusPill isActive={isActive} isExpired={isExpired} />
          </div>
        </header>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-[0_0_40px_rgba(45,212,191,0.08)] backdrop-blur-xl">
          <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-teal-300/80">
            <span>Traffic</span>
            <span>{expiry}</span>
          </div>
          <div className="mb-3 text-2xl font-semibold tabular-nums text-white">
            {formatBytes(used)}
            <span className="text-base font-normal text-slate-400">
              {" "}
              / {total > 0 ? formatBytes(total) : "Unlimited"}
            </span>
          </div>
          <TrafficBar
            pct={pct}
            barClassName="bg-gradient-to-r from-teal-400 to-cyan-300"
            trackClassName="h-2 overflow-hidden rounded-full bg-white/10"
          />
        </section>

        {outputType !== "subscription" ? (
          <section className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
            <PortalConnectionPanel output={connectionOutput} portalSettings={ps} />
          </section>
        ) : (
          <>
            <section className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
              <DualSubCopyButtons
                systemUrl={systemUrl}
                nativeUrl={nativeUrl}
                copied={copied}
                onCopy={copy}
                t={t}
                showNative={ps.showNativeQR !== false}
                className="flex-1"
                buttonClassName="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-400 px-4 py-3 text-sm font-semibold text-[#062018] transition hover:bg-teal-300"
                nativeButtonClassName="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-teal-100 transition hover:bg-white/10"
              />
              {ps.showPlatformQR !== false ? (
                <button
                  type="button"
                  onClick={() => setQrValue(systemUrl)}
                  className="inline-flex h-12 w-12 shrink-0 items-center justify-center self-center rounded-2xl border border-white/15 bg-white/5 text-teal-200 backdrop-blur-xl"
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
              className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl"
              itemClassName="rounded-2xl border border-white/5 bg-black/20 px-3 py-2"
            />

            {ps.allowDirectImport !== false ? (
              <button
                type="button"
                onClick={() => setImportSheet(true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-400 px-4 py-3 text-sm font-semibold text-[#062018] transition hover:bg-teal-300"
              >
                <MonitorSmartphone size={18} />
                {t("importApp")}
              </button>
            ) : null}
          </>
        )}

        {contacts.length ? (
          <div className="flex flex-wrap justify-center gap-2">
            {contacts.map((c) => (
              <a
                key={c.label}
                href={c.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 backdrop-blur-xl"
                title={c.label}
              >
                <c.icon size={18} />
              </a>
            ))}
          </div>
        ) : null}

        {ps.footerText ? (
          <p className="text-center text-xs text-slate-500">{ps.footerText}</p>
        ) : null}
      </div>

      <QrModal value={qrValue} onClose={() => setQrValue(null)} />
      <ClientAppsSheet
        open={importSheet}
        onClose={() => setImportSheet(false)}
        systemUrl={systemUrl}
        brandName={brandName}
        title={t("importApp")}
        cancelLabel={t("cancel")}
        downloadLabel={t("download")}
        addLabel={t("addToApp")}
        subtitle={t("importPick")}
        panelClassName="bg-[#0c1829] text-slate-100 border border-white/10"
      />
    </div>
  );
}
