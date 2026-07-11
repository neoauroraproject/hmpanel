"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  Copy,
  Mail,
  MessageCircle,
  Phone,
  Globe,
  QrCode,
  X,
  ShieldCheck,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { API_BASE } from "@/lib/api";
import { formatBytes, formatDate } from "@/lib/format";
import { resolveThemeLogo } from "@/modules/shared/brand-logo";

export type PortalNode = { link: string; protocol: string; tag: string };

export type PortalSettings = {
  portalName?: string;
  logoUrl?: string;
  logoDarkUrl?: string;
  theme?: string;
  primaryColor?: string;
  footerText?: string;
  showSupportSection?: boolean;
  showTelegram?: boolean;
  telegramLink?: string;
  showWhatsApp?: boolean;
  whatsappLink?: string;
  showWebsite?: boolean;
  websiteUrl?: string;
  showEmail?: boolean;
  emailAddress?: string;
  showPlatformQR?: boolean;
  showNativeQR?: boolean;
  allowQRDownload?: boolean;
  allowDirectImport?: boolean;
};

export type SubData = {
  email?: string;
  remark?: string;
  enable?: boolean;
  up?: number;
  down?: number;
  total?: number;
  expiryTime?: number;
  subId?: string;
  uuid?: string;
  inbound?: any;
  inbounds?: any[];
  portalSettings?: PortalSettings;
};

export const PORTAL_THEMES = [
  "Aurora",
  "Obsidian",
  "Nordic",
  "Pulse",
  "Neon",
  "Ember",
  "Studio",
] as const;

export type PortalThemeId = (typeof PORTAL_THEMES)[number];

export function ensurePortalFont(family: string, href: string) {
  if (typeof document === "undefined") return;
  const id = `portal-font-${family.replace(/\s+/g, "-").toLowerCase()}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

export function supportContacts(ps?: PortalSettings) {
  if (!ps || ps.showSupportSection === false) return [];
  const items: { label: string; href: string; icon: typeof Mail }[] = [];
  if (ps.showTelegram && ps.telegramLink)
    items.push({ label: "Telegram", href: ps.telegramLink, icon: MessageCircle });
  if (ps.showWhatsApp && ps.whatsappLink)
    items.push({ label: "WhatsApp", href: ps.whatsappLink, icon: Phone });
  if (ps.showWebsite && ps.websiteUrl)
    items.push({ label: "Website", href: ps.websiteUrl, icon: Globe });
  if (ps.showEmail && ps.emailAddress)
    items.push({ label: "Email", href: `mailto:${ps.emailAddress}`, icon: Mail });
  return items;
}

export function buildSystemSubUrl(subId?: string, email?: string) {
  const key = encodeURIComponent(subId || email || "");
  if (typeof window === "undefined") return `/s/${key}`;
  return `${window.location.origin}/s/${key}`;
}

export function buildNativeSubUrl(data: SubData) {
  const sub = encodeURIComponent(data.subId || data.email || "");
  const inbound = data.inbound;
  if (inbound?.panel?.subUrl) {
    const base = inbound.panel.subUrl.endsWith("/")
      ? inbound.panel.subUrl
      : `${inbound.panel.subUrl}/`;
    return `${base}${sub}`;
  }
  if (inbound?.panel?.url) {
    try {
      const parsed = new URL(inbound.panel.url);
      return `${parsed.origin}/sub/${sub}`;
    } catch {
      const base = inbound.panel.url.endsWith("/")
        ? inbound.panel.url
        : `${inbound.panel.url}/`;
      return `${base}sub/${sub}`;
    }
  }
  return `${typeof window !== "undefined" ? window.location.origin : ""}/sub/${sub}`;
}

export function useSubscriptionNodes(id: string) {
  return useQuery({
    queryKey: ["subscriptionNodes", id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/subscriptions/${id}/nodes`);
      if (!res.ok) return [] as PortalNode[];
      return (await res.json()) as PortalNode[];
    },
    retry: false,
  });
}

export function usePortalModel(id: string, data: SubData, theme: string) {
  const { data: nodes = [] } = useSubscriptionNodes(id);
  const [copied, setCopied] = useState<string | null>(null);
  const [qrValue, setQrValue] = useState<string | null>(null);

  const ps = data.portalSettings || {};
  const used = Number(data.up || 0) + Number(data.down || 0);
  const total = Number(data.total || 0);
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const isExpired = Number(data.expiryTime || 0) > 0 && Date.now() > Number(data.expiryTime);
  const isActive = !!data.enable && !isExpired && (total === 0 || used < total);
  const remainingDays =
    Number(data.expiryTime || 0) > 0
      ? Math.max(0, Math.ceil((Number(data.expiryTime) - Date.now()) / 86400000))
      : null;
  const clientName = data.remark || data.email || "Client";
  const brandName = ps.portalName || "Subscription";
  const logoSrc = resolveThemeLogo({
    logoLight: ps.logoUrl,
    logoDark: ps.logoDarkUrl,
    theme,
  });
  const contacts = supportContacts(ps);
  const systemUrl = buildSystemSubUrl(data.subId, data.email);
  const nativeUrl = buildNativeSubUrl(data);

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* ignore */
    }
  };

  return {
    nodes: nodes as PortalNode[],
    copied,
    copy,
    qrValue,
    setQrValue,
    ps,
    used,
    total,
    pct,
    isExpired,
    isActive,
    remainingDays,
    clientName,
    brandName,
    logoSrc,
    contacts,
    systemUrl,
    nativeUrl,
    formatBytes,
    formatDate,
  };
}

export function QrModal({
  value,
  onClose,
  title = "Scan QR",
}: {
  value: string | null;
  onClose: () => void;
  title?: string;
}) {
  if (!value) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="relative w-full max-w-sm rounded-3xl bg-white p-6 text-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800"
          aria-label="Close"
        >
          <X size={18} />
        </button>
        <div className="mb-4 text-center text-sm font-semibold tracking-wide">{title}</div>
        <div className="flex justify-center rounded-2xl bg-zinc-50 p-4">
          <QRCodeCanvas value={value} size={200} />
        </div>
      </div>
    </div>
  );
}

export function BrandMark({
  logoSrc,
  brandName,
  className = "h-11 w-auto max-w-[9rem] object-contain",
  fallbackClassName = "flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-white",
}: {
  logoSrc: string | null;
  brandName: string;
  className?: string;
  fallbackClassName?: string;
}) {
  if (logoSrc) return <img src={logoSrc} alt={brandName} className={className} />;
  return (
    <div className={fallbackClassName}>
      <ShieldCheck size={22} />
    </div>
  );
}

export function ConfigList({
  nodes,
  copied,
  onCopy,
  onQr,
  className = "",
  itemClassName = "",
  title = "Configurations",
  empty = "No configs available yet.",
}: {
  nodes: PortalNode[];
  copied: string | null;
  onCopy: (link: string, key: string) => void;
  onQr: (link: string) => void;
  className?: string;
  itemClassName?: string;
  title?: string;
  empty?: string;
}) {
  return (
    <section className={className}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <h3 className="text-sm font-semibold tracking-wide">{title}</h3>
        <span className="text-xs opacity-60">{nodes.length} nodes</span>
      </div>
      {!nodes.length ? (
        <p className="text-sm opacity-60">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {nodes.map((node, idx) => {
            const key = `node-${idx}`;
            return (
              <li key={key} className={`flex items-center gap-3 ${itemClassName}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-black/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider dark:bg-white/10">
                      {node.protocol}
                    </span>
                    <span className="truncate text-sm font-medium">
                      {node.tag || `Config ${idx + 1}`}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onCopy(node.link, key)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/5 hover:bg-black/10 dark:bg-white/10"
                  aria-label="Copy config"
                >
                  {copied === key ? <Check size={16} /> : <Copy size={16} />}
                </button>
                <button
                  type="button"
                  onClick={() => onQr(node.link)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/5 hover:bg-black/10 dark:bg-white/10"
                  aria-label="QR"
                >
                  <QrCode size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function StatusPill({
  isActive,
  isExpired,
  className = "",
}: {
  isActive: boolean;
  isExpired: boolean;
  className?: string;
}) {
  const label = isActive ? "Active" : isExpired ? "Expired" : "Disabled";
  const tone = isActive
    ? "bg-emerald-500/15 text-emerald-500"
    : "bg-rose-500/15 text-rose-500";
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tone} ${className}`}>
      {label}
    </span>
  );
}

export function TrafficBar({
  pct,
  barClassName,
  trackClassName = "h-2 overflow-hidden rounded-full bg-black/10",
}: {
  pct: number;
  barClassName: string;
  trackClassName?: string;
}) {
  return (
    <div className={trackClassName}>
      <div className={`h-full rounded-full transition-all ${barClassName}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function useExpiryLabel(remainingDays: number | null, expiryTime?: number) {
  return useMemo(() => {
    if (!expiryTime || expiryTime <= 0) return "Unlimited";
    if (remainingDays == null) return formatDate(expiryTime);
    if (remainingDays <= 0) return "Expired";
    return `${remainingDays}d left · ${formatDate(expiryTime)}`;
  }, [remainingDays, expiryTime]);
}

export function useThemeFont(theme: PortalThemeId) {
  useEffect(() => {
    const map: Record<PortalThemeId, [string, string]> = {
      Aurora: ["Outfit", "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap"],
      Obsidian: [
        "Instrument",
        "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Instrument+Serif:ital@0;1&display=swap",
      ],
      Nordic: [
        "Fraunces",
        "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Source+Sans+3:wght@400;600&display=swap",
      ],
      Pulse: ["Sora", "https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&display=swap"],
      Neon: [
        "SpaceGrotesk",
        "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Space+Grotesk:wght@400;500;600;700&display=swap",
      ],
      Ember: ["Manrope", "https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap"],
      Studio: [
        "Syne",
        "https://fonts.googleapis.com/css2?family=Syne:wght@500;600;700;800&family=Work+Sans:wght@400;500;600&display=swap",
      ],
    };
    const [name, href] = map[theme];
    ensurePortalFont(name, href);
  }, [theme]);
}
