"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, Copy, MessageCircle, QrCode, Zap } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import type { PortalNode, SubData } from "./portal-kit";
import { usePortalModel, PortalConnectionPanel } from "./portal-kit";
import type { ClientOutputModel } from "@/components/connection/types";
import { ClientAppsSheet } from "./client-apps";

export function useNeoMetrics(id: string, data: SubData, theme: string) {
  const model = usePortalModel(id, data, theme);
  const remainingBytes = useMemo(() => {
    if (model.total <= 0) return null;
    return Math.max(0, model.total - model.used);
  }, [model.total, model.used]);
  const remainingPct = useMemo(() => {
    if (model.total <= 0) return 100;
    return Math.max(0, Math.min(100, ((model.total - model.used) / model.total) * 100));
  }, [model.total, model.used]);
  const initial = (model.clientName || "?").trim().charAt(0).toUpperCase();
  return { ...model, remainingBytes, remainingPct, initial };
}

export function NeoImportSheet({
  open,
  onClose,
  systemUrl,
  brandName,
  title,
  cancelLabel,
  panelClassName = "bg-white text-zinc-900",
  downloadLabel,
  addLabel,
  subtitle,
}: {
  open: boolean;
  onClose: () => void;
  systemUrl: string;
  brandName: string;
  title: string;
  cancelLabel: string;
  panelClassName?: string;
  downloadLabel?: string;
  addLabel?: string;
  subtitle?: string;
}) {
  return (
    <ClientAppsSheet
      open={open}
      onClose={onClose}
      systemUrl={systemUrl}
      brandName={brandName}
      title={title}
      cancelLabel={cancelLabel}
      panelClassName={panelClassName}
      downloadLabel={downloadLabel}
      addLabel={addLabel}
      subtitle={subtitle}
    />
  );
}

export function NeoConfigRows({
  nodes,
  copied,
  onCopy,
  onQr,
  rowClassName,
  badgeClassName,
  copyBtnClassName,
  qrBtnClassName,
  copyLabel,
  qrLabel,
}: {
  nodes: PortalNode[];
  copied: string | null;
  onCopy: (link: string, key: string) => void;
  onQr: (link: string) => void;
  rowClassName: string;
  badgeClassName: string;
  copyBtnClassName: string;
  qrBtnClassName: string;
  copyLabel: string;
  qrLabel: string;
}) {
  if (!nodes.length) return null;
  return (
    <ul className="space-y-2.5">
      {nodes.map((node, idx) => {
        const key = `node-${idx}`;
        return (
          <li key={key} className={`flex items-center gap-3 ${rowClassName}`}>
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[9px] font-extrabold uppercase tracking-wide ${badgeClassName}`}>
              {(node.protocol || "CFG").slice(0, 5)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">{node.tag || `Config ${idx + 1}`}</div>
              <div className="truncate text-xs opacity-50">{(node.protocol || "").toLowerCase()}</div>
            </div>
            <button type="button" onClick={() => onCopy(node.link, key)} className={copyBtnClassName}>
              {copied === key ? <Check size={14} /> : null}
              {copied === key ? "" : copyLabel}
            </button>
            <button type="button" onClick={() => onQr(node.link)} className={qrBtnClassName}>
              {qrLabel}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function NeoQrOverlay({
  value,
  onClose,
  title,
}: {
  value: string | null;
  onClose: () => void;
  title: string;
}) {
  if (!value) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-zinc-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 text-center text-sm font-semibold">{title}</div>
        <div className="flex justify-center rounded-2xl bg-zinc-50 p-4">
          <QRCodeCanvas value={value} size={200} />
        </div>
      </div>
    </div>
  );
}

export function NeoConnectionBlock({
  outputType,
  connectionOutput,
  portalSettings,
  children,
  className = "",
}: {
  outputType: string;
  connectionOutput: ClientOutputModel | null | undefined;
  portalSettings?: any;
  children: ReactNode;
  className?: string;
}) {
  if (outputType !== "subscription") {
    return (
      <div className={className}>
        <PortalConnectionPanel output={connectionOutput} portalSettings={portalSettings} />
      </div>
    );
  }
  return <>{children}</>;
}

export function NeoFab({
  label,
  onClick,
  icon = <Zap size={16} />,
  className = "bg-white text-zinc-900 shadow-[0_10px_40px_rgba(0,0,0,0.18)]",
}: {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
      <button
        type="button"
        onClick={onClick}
        className={`pointer-events-auto inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold ${className}`}
      >
        {icon}
        {label}
      </button>
    </div>
  );
}

export function NeoSupportBtn({
  href,
  label,
  className,
}: {
  href?: string;
  label: string;
  className: string;
}) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      <MessageCircle size={14} />
      {label}
    </a>
  );
}

export function NeoAdvanced({
  open,
  onToggle,
  label,
  children,
  barClassName,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  children: ReactNode;
  barClassName: string;
}) {
  return (
    <div>
      <button type="button" onClick={onToggle} className={`flex w-full items-center justify-between ${barClassName}`}>
        <span>{label}</span>
        <ChevronDown size={18} className={`transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}

export function NeoCopyRow({
  onClick,
  copied,
  label,
  copiedLabel,
  className,
}: {
  onClick: () => void;
  copied: boolean;
  label: string;
  copiedLabel: string;
  className: string;
}) {
  return (
    <button type="button" onClick={onClick} className={className}>
      {copied ? <Check size={16} /> : <Copy size={16} />}
      {copied ? copiedLabel : label}
    </button>
  );
}

/** Panel (/s/) + Native (/sub/) copy buttons for Neo-family themes. */
export function NeoDualSubCopy({
  systemUrl,
  nativeUrl,
  copied,
  onCopy,
  panelLabel,
  nativeLabel,
  copiedLabel,
  showNative = true,
  className = "grid gap-2 sm:grid-cols-2",
  buttonClassName,
  nativeButtonClassName,
}: {
  systemUrl: string;
  nativeUrl?: string | null;
  copied: string | null;
  onCopy: (text: string, key: string) => void;
  panelLabel: string;
  nativeLabel: string;
  copiedLabel: string;
  showNative?: boolean;
  className?: string;
  buttonClassName: string;
  nativeButtonClassName?: string;
}) {
  const show = showNative !== false && !!nativeUrl;
  return (
    <div className={className}>
      <NeoCopyRow
        onClick={() => onCopy(systemUrl, "system")}
        copied={copied === "system"}
        label={panelLabel}
        copiedLabel={copiedLabel}
        className={buttonClassName}
      />
      {show ? (
        <NeoCopyRow
          onClick={() => onCopy(nativeUrl!, "native")}
          copied={copied === "native"}
          label={nativeLabel}
          copiedLabel={copiedLabel}
          className={nativeButtonClassName || buttonClassName}
        />
      ) : null}
    </div>
  );
}
