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

/** Ops Console — phosphor terminal, monospace, command-line actions. */
export default function HackerTheme({ id, data }: { id: string; data: SubData }) {
  const model = usePortalModel(id, data, "Hacker");
  useThemeFont("Hacker", model.isFa);
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

  const mono = fontFamily || "'IBM Plex Mono', ui-monospace, monospace";

  return (
    <div
      className="relative min-h-[100dvh] text-[#3dff7a]"
      style={
        {
          fontFamily: mono,
          background: "#030504",
        } as CSSProperties
      }
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.35) 3px)",
        }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col gap-4 px-3 py-5 sm:px-5 sm:py-8">
        <div className="flex items-center justify-between gap-3 border border-[#3dff7a]/35 bg-[#061008] px-3 py-2">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark
              logoSrc={logoSrc}
              brandName={brandName}
              className="h-8 w-auto max-w-[6.5rem] object-contain brightness-110 contrast-125"
              fallbackClassName="flex h-8 w-8 items-center justify-center border border-[#3dff7a]/40 text-[#3dff7a]"
            />
            <div className="min-w-0 truncate text-[12px] sm:text-sm">
              <span className="text-[#3dff7a]/55">root@</span>
              <span className="text-[#9cffb8]">{brandName.replace(/\s+/g, "-").toLowerCase()}</span>
              <span className="text-[#3dff7a]/55">:~#</span>
            </div>
          </div>
          <LangToggle lang={lang} setLang={setLang} className="border-[#3dff7a]/35 text-[#3dff7a]" />
        </div>

        <pre className="overflow-x-auto border border-[#3dff7a]/25 bg-[#061008] p-4 text-[11px] leading-relaxed text-[#6dff9a] sm:text-xs whitespace-pre-wrap">
{`$ session --status
> client: ${clientName}
> state:  ${statusLabel.toUpperCase()}
> expiry: ${expiry}
> uuid:   ${data.uuid || "n/a"}
> link:   ${isActive ? "ESTABLISHED" : "CLOSED"}`}
        </pre>

        <section className="border border-[#3dff7a]/25 bg-[#061008] p-4 sm:p-5">
          <div className="mb-2 text-[11px] text-[#3dff7a]/60">
            $ {t("traffic").toLowerCase()} --report
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="text-xl tabular-nums text-[#b8ffd0] sm:text-2xl">
              {formatBytes(used)}
              <span className="ms-2 text-sm text-[#3dff7a]/45">
                / {total > 0 ? formatBytes(total) : t("unlimited")}
              </span>
            </div>
            <div className="text-[11px] text-[#3dff7a]/55">
              <div>rx {formatBytes(down)}</div>
              <div>tx {formatBytes(up)}</div>
            </div>
          </div>
          <div className="mt-3">
            <TrafficBar
              pct={pct}
              barClassName="bg-[#3dff7a]"
              trackClassName="h-1 overflow-hidden bg-[#3dff7a]/15"
            />
          </div>
          <div className="mt-2 text-[11px] text-[#3dff7a]/50">
            [{Math.round(pct)}%] {t("usage").toLowerCase()}
          </div>
        </section>

        <section className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <button
            type="button"
            onClick={() => copy(systemUrl, "system")}
            className="inline-flex items-center justify-center gap-2 border border-[#3dff7a] bg-[#3dff7a]/10 px-4 py-3 text-sm text-[#b8ffd0] transition hover:bg-[#3dff7a]/20"
          >
            {copied === "system" ? <Check size={15} /> : <Copy size={15} />}
            <span>
              [{copied === "system" ? t("copied").toUpperCase() : "COPY"}] {t("systemSub")}
            </span>
          </button>
          {ps.showPlatformQR !== false ? (
            <button
              type="button"
              onClick={() => setQrValue(systemUrl)}
              className="inline-flex items-center justify-center gap-2 border border-[#3dff7a]/35 px-4 py-3 text-sm text-[#3dff7a] transition hover:border-[#3dff7a]"
            >
              <QrCode size={15} />
              [QR]
            </button>
          ) : null}
        </section>

        <div className="border border-[#3dff7a]/25 bg-[#061008] p-3 sm:p-4">
          <div className="mb-3 text-[11px] text-[#3dff7a]/60">
            $ ls ./{t("configs").toLowerCase()}
          </div>
          <ConfigList
            nodes={nodes}
            copied={copied}
            onCopy={copy}
            onQr={setQrValue}
            title=""
            empty={t("noConfigs")}
            nodesLabel={t("nodes")}
            className="[&>div:first-child]:hidden"
            itemClassName="border border-[#3dff7a]/20 bg-black/40 px-2.5 py-2"
          />
        </div>

        {contacts.length ? (
          <div className="flex flex-wrap gap-2 border border-[#3dff7a]/20 bg-[#061008] p-3">
            <span className="w-full text-[11px] text-[#3dff7a]/55">$ {t("support").toLowerCase()}</span>
            {contacts.map((c) => (
              <a
                key={c.kind}
                href={c.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 border border-[#3dff7a]/25 px-2.5 py-1.5 text-[11px] text-[#9cffb8] transition hover:border-[#3dff7a]/60"
              >
                <c.icon size={12} />
                {c.label}
              </a>
            ))}
          </div>
        ) : null}

        {ps.footerText ? (
          <p className="text-center text-[11px] text-[#3dff7a]/35"># {ps.footerText}</p>
        ) : null}
      </div>

      <QrModal value={qrValue} onClose={() => setQrValue(null)} title={t("scanQr")} />
    </div>
  );
}
