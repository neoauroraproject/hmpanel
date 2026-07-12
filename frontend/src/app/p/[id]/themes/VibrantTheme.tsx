"use client";

import { useState, type CSSProperties } from "react";
import { BrandMark, LangToggle, useThemeFont, type SubData } from "./portal-kit";
import {
  NeoAdvanced,
  NeoConfigRows,
  NeoFab,
  NeoImportSheet,
  NeoQrOverlay,
  NeoSupportBtn,
  useNeoMetrics,
} from "./neo-shared";

/** Vibrant — warm orange hero, clean white shell. */
export default function VibrantTheme({ id, data }: { id: string; data: SubData }) {
  const m = useNeoMetrics(id, data, "Vibrant");
  useThemeFont("Vibrant", m.isFa);
  const [advanced, setAdvanced] = useState(false);
  const [sheet, setSheet] = useState(false);
  const supportHref = m.contacts[0]?.href;
  const remainLabel =
    m.remainingBytes == null ? m.t("unlimited") : m.formatBytes(m.remainingBytes);
  const daysText =
    m.remainingDays == null
      ? m.t("unlimited")
      : `${m.remainingDays} ${m.t("daysRemaining")}`;

  return (
    <div
      className="relative min-h-[100dvh] bg-[#f7f8fa] text-[#0f172a]"
      style={{ fontFamily: m.fontFamily || "'Plus Jakarta Sans', system-ui, sans-serif" } as CSSProperties}
      dir={m.isFa ? "rtl" : "ltr"}
    >
      <div className="mx-auto flex w-full max-w-lg flex-col gap-3.5 px-4 pb-28 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <BrandMark
              logoSrc={m.logoSrc}
              brandName={m.brandName}
              className="h-8 w-auto max-w-[6rem] object-contain"
              fallbackClassName="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-100 text-orange-600"
            />
            <span className="truncate text-lg font-bold">{m.brandName}</span>
          </div>
          <div className="flex items-center gap-2">
            <NeoSupportBtn
              href={supportHref}
              label={m.t("support")}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#ff8a1f] px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
            />
            <LangToggle lang={m.lang} setLang={m.setLang} className="border-zinc-200 text-zinc-700" />
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl bg-white px-3.5 py-3 shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#ff8a1f] text-base font-bold text-white">
            {m.initial}
          </div>
          <div>
            <div className="text-[10px] font-semibold tracking-[0.18em] text-zinc-400 uppercase">
              {m.t("clientProfile")}
            </div>
            <div className="text-base font-bold">{m.clientName}</div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-1">
          <span
            className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase ${
              m.isActive ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
            }`}
          >
            {m.statusLabel}
          </span>
          <span className="text-sm text-zinc-400">{daysText}</span>
        </div>

        <section className="rounded-[1.75rem] bg-gradient-to-br from-[#ff8a1f] via-[#ff9f3d] to-[#ffb347] p-6 text-white shadow-[0_16px_40px_rgba(255,138,31,0.35)]">
          <div className="text-center">
            <div className="text-4xl font-extrabold tracking-tight tabular-nums sm:text-5xl">
              {remainLabel}
            </div>
            <div className="mt-1 text-sm text-white/85">{m.t("remainingTraffic")}</div>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-2 border-t border-white/25 pt-4 text-center text-xs">
            <div>
              <div className="font-bold tabular-nums">{m.formatBytes(m.up)}</div>
              <div className="mt-1 text-white/75">{m.t("upload")}</div>
            </div>
            <div>
              <div className="font-bold tabular-nums">{m.formatBytes(m.down)}</div>
              <div className="mt-1 text-white/75">{m.t("download")}</div>
            </div>
            <div>
              <div className="font-bold tabular-nums">
                {m.total > 0 ? m.formatBytes(m.total) : m.t("unlimited")}
              </div>
              <div className="mt-1 text-white/75">{m.t("totalLimit")}</div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-2.5 text-base font-bold">{m.t("configs")}</h2>
          <NeoConfigRows
            nodes={m.nodes}
            copied={m.copied}
            onCopy={m.copy}
            onQr={m.setQrValue}
            rowClassName="rounded-2xl bg-white px-3 py-2.5 shadow-[0_8px_24px_rgba(15,23,42,0.05)]"
            badgeClassName="bg-[#ff8a1f] text-white"
            copyBtnClassName="rounded-xl bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-700"
            qrBtnClassName="rounded-xl bg-[#0f172a] px-3 py-2 text-xs font-semibold text-white"
            copyLabel="Copy"
            qrLabel={m.t("qr")}
          />
        </section>

        <NeoAdvanced
          open={advanced}
          onToggle={() => setAdvanced((v) => !v)}
          label={m.t("advancedInfo")}
          barClassName="rounded-2xl bg-white px-4 py-3.5 text-sm font-semibold shadow-[0_8px_24px_rgba(15,23,42,0.05)]"
        >
          <div className="space-y-2 rounded-2xl bg-white p-3 text-xs text-zinc-500 shadow-sm">
            <div>UUID: {data.uuid || "—"}</div>
            <div className="break-all">{m.systemUrl}</div>
            <button
              type="button"
              onClick={() => m.copy(m.systemUrl, "system")}
              className="mt-1 w-full rounded-xl bg-zinc-900 py-2.5 text-xs font-semibold text-white"
            >
              {m.copied === "system" ? m.t("copied") : m.t("copySubLink")}
            </button>
          </div>
        </NeoAdvanced>

        <p className="pt-2 text-center text-xs text-zinc-400">
          {m.t("poweredBy")} {m.brandName}
        </p>
      </div>

      <NeoFab label={m.t("quickActions")} onClick={() => setSheet(true)} />
      <NeoImportSheet
        open={sheet}
        onClose={() => setSheet(false)}
        systemUrl={m.systemUrl}
        brandName={m.brandName}
        title={m.t("importApp")}
        cancelLabel={m.isFa ? "بستن" : "Close"}
      />
      <NeoQrOverlay value={m.qrValue} onClose={() => m.setQrValue(null)} title={m.t("scanQr")} />
    </div>
  );
}
