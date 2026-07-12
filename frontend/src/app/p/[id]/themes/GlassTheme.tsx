"use client";

import { useState, type CSSProperties } from "react";
import { BrandMark, LangToggle, useThemeFont, type SubData } from "./portal-kit";
import {
  NeoAdvanced,
  NeoConfigRows,
  NeoCopyRow,
  NeoFab,
  NeoImportSheet,
  NeoQrOverlay,
  NeoSupportBtn,
  useNeoMetrics,
} from "./neo-shared";

/** Glass — soft pastel blobs + frosted cards. */
export default function GlassTheme({ id, data }: { id: string; data: SubData }) {
  const m = useNeoMetrics(id, data, "Glass");
  useThemeFont("Glass", m.isFa);
  const [advanced, setAdvanced] = useState(false);
  const [sheet, setSheet] = useState(false);
  const supportHref = m.contacts[0]?.href;
  const remainLabel =
    m.remainingBytes == null ? m.t("unlimited") : m.formatBytes(m.remainingBytes);
  const daysLabel =
    m.remainingDays == null ? m.t("unlimited") : String(m.remainingDays);

  return (
    <div
      className="relative min-h-[100dvh] overflow-hidden text-zinc-900"
      style={
        {
          fontFamily: m.fontFamily || "'Plus Jakarta Sans', system-ui, sans-serif",
          background:
            "radial-gradient(ellipse at 15% 10%, #f9c5d1 0%, transparent 45%), radial-gradient(ellipse at 85% 20%, #a8e0f5 0%, transparent 40%), radial-gradient(ellipse at 50% 90%, #f6d4a8 0%, transparent 45%), #f7f4f8",
        } as CSSProperties
      }
      dir={m.isFa ? "rtl" : "ltr"}
    >
      <div className="relative z-10 mx-auto flex w-full max-w-lg flex-col gap-3.5 px-4 pb-28 pt-4">
        <div className="flex items-center justify-between rounded-full border border-white/60 bg-white/55 px-4 py-2.5 shadow-sm backdrop-blur-xl">
          <div className="flex min-w-0 items-center gap-2">
            <BrandMark
              logoSrc={m.logoSrc}
              brandName={m.brandName}
              className="h-7 w-auto max-w-[5.5rem] object-contain"
              fallbackClassName="flex h-7 w-7 items-center justify-center rounded-lg bg-white/70 text-zinc-700"
            />
            <span className="truncate text-sm font-bold">{m.brandName}</span>
          </div>
          <div className="flex items-center gap-2">
            <NeoSupportBtn
              href={supportHref}
              label={m.t("support")}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-sm"
            />
            <LangToggle lang={m.lang} setLang={m.setLang} className="border-white/70 text-zinc-700" />
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-white/50 bg-sky-100/55 px-3.5 py-3 backdrop-blur-xl">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#34d399] text-base font-bold text-white">
            {m.initial}
          </div>
          <div>
            <div className="text-[10px] font-semibold tracking-[0.18em] text-zinc-500 uppercase">
              {m.t("clientProfile")}
            </div>
            <div className="text-base font-bold">{m.clientName}</div>
          </div>
        </div>

        <section className="rounded-[1.75rem] border border-white/50 bg-gradient-to-br from-[#c7e9fb]/90 via-[#dce7ff]/85 to-[#f3d4e8]/80 p-5 shadow-lg backdrop-blur-xl">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-xs font-medium text-zinc-600">{m.t("remainingTraffic")}</div>
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
                m.isActive ? "bg-emerald-400/30 text-emerald-800" : "bg-rose-400/25 text-rose-800"
              }`}
            >
              {m.statusLabel}
            </span>
          </div>
          <div className="text-4xl font-extrabold tracking-tight tabular-nums">{remainLabel}</div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/50">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-400 to-violet-400"
              style={{ width: `${m.remainingPct}%` }}
            />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-[10px] font-semibold tracking-[0.14em] text-zinc-500 uppercase">
                {m.t("totalUsed")}
              </div>
              <div className="mt-1 font-bold tabular-nums">{m.formatBytes(m.used)}</div>
            </div>
            <div className="text-end">
              <div className="text-[10px] font-semibold tracking-[0.14em] text-zinc-500 uppercase">
                {m.t("daysLeft")}
              </div>
              <div className="mt-1 font-bold tabular-nums">{daysLabel}</div>
            </div>
          </div>
        </section>

        <NeoAdvanced
          open={advanced}
          onToggle={() => setAdvanced((v) => !v)}
          label={m.t("advancedInfo")}
          barClassName="rounded-2xl border border-white/50 bg-gradient-to-r from-[#c7e9fb]/70 to-[#f3d4e8]/70 px-4 py-3.5 text-sm font-semibold backdrop-blur-xl"
        >
          <div className="space-y-2 rounded-2xl border border-white/50 bg-white/55 p-3 text-xs text-zinc-600 backdrop-blur-xl">
            <div>UUID: {data.uuid || "—"}</div>
            <div className="break-all">{m.systemUrl}</div>
          </div>
        </NeoAdvanced>

        <section>
          <h2 className="mb-2.5 text-base font-bold">{m.t("configs")}</h2>
          <NeoConfigRows
            nodes={m.nodes}
            copied={m.copied}
            onCopy={m.copy}
            onQr={m.setQrValue}
            rowClassName="rounded-2xl border border-white/60 bg-white/65 px-3 py-2.5 backdrop-blur-xl"
            badgeClassName="bg-sky-500 text-white"
            copyBtnClassName="rounded-xl bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-700"
            qrBtnClassName="rounded-xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white"
            copyLabel="Copy"
            qrLabel={m.t("qr")}
          />
        </section>

        <NeoCopyRow
          onClick={() => m.copy(m.systemUrl, "system")}
          copied={m.copied === "system"}
          label={m.t("copySubLink")}
          copiedLabel={m.t("copied")}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/60 bg-white/65 px-4 py-3.5 text-sm font-semibold backdrop-blur-xl"
        />

        <p className="pt-1 text-center text-xs text-zinc-500">
          {m.t("poweredBy")} {m.brandName}
        </p>
      </div>

      <NeoFab
        label={m.t("quickActions")}
        onClick={() => setSheet(true)}
        className="border border-white/70 bg-white/85 text-zinc-900 shadow-[0_10px_40px_rgba(0,0,0,0.12)] backdrop-blur-xl"
      />
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
