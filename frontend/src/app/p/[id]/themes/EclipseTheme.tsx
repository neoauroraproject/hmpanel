"use client";

import { useState, type CSSProperties } from "react";
import { Boxes } from "lucide-react";
import { BrandMark, LangToggle, useThemeFont, type SubData } from "./portal-kit";
import {
  NeoAdvanced,
  NeoConfigRows,
  NeoDualSubCopy,
  NeoFab,
  NeoImportSheet,
  NeoQrOverlay,
  NeoSupportBtn,
  useNeoMetrics,
} from "./neo-shared";

/** Eclipse — light shell, black hero card, emerald accents. */
export default function EclipseTheme({ id, data }: { id: string; data: SubData }) {
  const m = useNeoMetrics(id, data, "Eclipse");
  useThemeFont("Eclipse", m.isFa);
  const [advanced, setAdvanced] = useState(false);
  const [sheet, setSheet] = useState(false);
  const supportHref = m.contacts[0]?.href;
  const remainLabel =
    m.remainingBytes == null ? m.t("unlimited") : m.formatBytes(m.remainingBytes);
  const daysLabel =
    m.remainingDays == null ? m.t("unlimited") : String(m.remainingDays);

  return (
    <div
      className="relative min-h-[100dvh] bg-[#f3f4f6] text-zinc-900"
      style={{ fontFamily: m.fontFamily || "'Plus Jakarta Sans', system-ui, sans-serif" } as CSSProperties}
      dir={m.isFa ? "rtl" : "ltr"}
    >
      <div className="mx-auto flex w-full max-w-lg flex-col gap-3.5 px-4 pb-28 pt-4">
        <div className="flex items-center justify-between rounded-full bg-white px-4 py-2.5 shadow-sm">
          <div className="flex min-w-0 items-center gap-2">
            <BrandMark
              logoSrc={m.logoSrc}
              brandName={m.brandName}
              className="h-7 w-auto max-w-[5.5rem] object-contain"
              fallbackClassName="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700"
            />
            <span className="truncate text-sm font-bold">{m.brandName}</span>
          </div>
          <div className="flex items-center gap-2">
            <NeoSupportBtn
              href={supportHref}
              label={m.t("support")}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#22c55e] px-3 py-1.5 text-xs font-semibold text-white"
            />
            <LangToggle lang={m.lang} setLang={m.setLang} className="border-zinc-200 text-zinc-700" />
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl bg-[#e8eaee] px-3.5 py-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#22c55e] text-base font-bold text-white">
            {m.initial}
          </div>
          <div>
            <div className="text-[10px] font-semibold tracking-[0.18em] text-zinc-400 uppercase">
              {m.t("clientProfile")}
            </div>
            <div className="text-base font-bold">
              {m.t("hi")} {m.clientName}
            </div>
          </div>
        </div>

        <section className="rounded-[1.75rem] bg-black p-5 text-white shadow-lg">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
              <Boxes size={20} className="text-white" />
            </div>
            <div className="text-end">
              <div className="text-[10px] font-semibold tracking-[0.16em] text-zinc-400 uppercase">
                {m.t("remainingTraffic")}
              </div>
              <div className="text-2xl font-extrabold tabular-nums">{remainLabel}</div>
            </div>
          </div>
          <div className="mb-5 h-2.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-[#22c55e]" style={{ width: `${m.remainingPct}%` }} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-[#1a1a1a] px-3 py-3">
              <div className="text-lg font-bold tabular-nums">{m.formatBytes(m.used)}</div>
              <div className="mt-1 text-[10px] font-semibold tracking-[0.14em] text-zinc-500 uppercase">
                {m.t("totalUsed")}
              </div>
            </div>
            <div className="rounded-2xl bg-[#1a1a1a] px-3 py-3">
              <div className="text-lg font-bold tabular-nums">{daysLabel}</div>
              <div className="mt-1 text-[10px] font-semibold tracking-[0.14em] text-zinc-500 uppercase">
                {m.t("daysLeft")}
              </div>
            </div>
          </div>
        </section>

        <NeoAdvanced
          open={advanced}
          onToggle={() => setAdvanced((v) => !v)}
          label={m.t("advancedInfo")}
          barClassName="rounded-2xl border border-zinc-200 bg-white px-4 py-3.5 text-sm font-semibold text-zinc-700"
        >
          <div className="space-y-2 rounded-2xl bg-white p-3 text-xs text-zinc-500">
            <div>UUID: {data.uuid || "—"}</div>
            <div className="break-all">{m.systemUrl}</div>
            <div className="break-all opacity-70">{m.nativeUrl}</div>
          </div>
        </NeoAdvanced>

        <section>
          <h2 className="mb-2.5 text-base font-bold">{m.t("configs")}</h2>
          <NeoConfigRows
            nodes={m.nodes}
            copied={m.copied}
            onCopy={m.copy}
            onQr={m.setQrValue}
            rowClassName="rounded-2xl bg-[#e8eaee] px-3 py-2.5"
            badgeClassName="bg-[#22c55e] text-white"
            copyBtnClassName="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-zinc-700"
            qrBtnClassName="rounded-xl bg-black px-3 py-2 text-xs font-semibold text-white"
            copyLabel="Copy"
            qrLabel={m.t("qr")}
          />
        </section>

        <section>
          <h2 className="mb-2.5 text-base font-bold">{m.t("appsActions")}</h2>
          <NeoDualSubCopy
            systemUrl={m.systemUrl}
            nativeUrl={m.nativeUrl}
            copied={m.copied}
            onCopy={m.copy}
            panelLabel={m.t("linkPanel")}
            nativeLabel={m.t("linkNative")}
            copiedLabel={m.t("copied")}
            showNative={m.ps.showNativeQR !== false}
            buttonClassName="flex w-full items-center gap-3 rounded-2xl bg-[#e8eaee] px-4 py-3.5 text-sm font-semibold"
            nativeButtonClassName="flex w-full items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3.5 text-sm font-semibold text-zinc-700"
          />
        </section>

        <p className="pt-2 text-center text-[10px] font-semibold tracking-[0.2em] text-zinc-400 uppercase">
          {m.t("poweredBy")} {m.brandName}
        </p>
      </div>

      {m.ps.allowDirectImport !== false ? (
        <NeoFab label={m.t("quickActions")} onClick={() => setSheet(true)} />
      ) : null}
      <NeoImportSheet
        open={sheet && m.ps.allowDirectImport !== false}
        onClose={() => setSheet(false)}
        systemUrl={m.systemUrl}
        brandName={m.brandName}
        title={m.t("importApp")}
        cancelLabel={m.isFa ? "بستن" : "Close"}
        downloadLabel={m.t("download")}
        addLabel={m.t("addToApp")}
        subtitle={m.t("importPick")}
      />
      <NeoQrOverlay value={m.qrValue} onClose={() => m.setQrValue(null)} title={m.t("scanQr")} />
    </div>
  );
}
