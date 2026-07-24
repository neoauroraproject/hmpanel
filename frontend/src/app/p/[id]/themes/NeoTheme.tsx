"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Copy,
  QrCode,
  MonitorSmartphone,
  Check,
  MessageCircle,
  Phone,
  Globe,
  Mail,
  X,
  ShieldCheck,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { formatBytes, formatDate } from "@/lib/format";
import { API_BASE } from "@/lib/api";
import { resolveThemeLogo } from "@/modules/shared/brand-logo";

export type NeoVariant =
  | "Neo Default"
  | "Neo Vibrant"
  | "Neo Eclipse"
  | "Neo Glass"
  | "Neo Minimal"
  | "Neo Dashboard";

type PortalSettings = {
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

const VARIANT: Record<
  NeoVariant,
  {
    light: boolean;
    font: string;
    shell: string;
    card: string;
    hero: string;
    text: string;
    muted: string;
    accent: string;
    accentBg: string;
    btn: string;
    progress: string;
    radius: string;
  }
> = {
  "Neo Default": {
    light: true,
    font: "font-sans",
    shell: "bg-[#f4f4f5] text-zinc-900",
    card: "bg-white border border-zinc-200 shadow-sm",
    hero: "bg-white border border-zinc-200",
    text: "text-zinc-900",
    muted: "text-zinc-500",
    accent: "text-blue-600",
    accentBg: "bg-blue-600",
    btn: "bg-blue-600 hover:bg-blue-500 text-white",
    progress: "bg-blue-600",
    radius: "rounded-2xl",
  },
  "Neo Vibrant": {
    light: false,
    font: "font-sans",
    shell: "bg-[#0b0b0f] text-white",
    card: "bg-[#15151c] border border-white/10",
    hero: "bg-gradient-to-br from-[#FF8C00] to-[#FF4D00] text-white",
    text: "text-white",
    muted: "text-white/60",
    accent: "text-orange-400",
    accentBg: "bg-orange-500",
    btn: "bg-orange-500 hover:bg-orange-400 text-white",
    progress: "bg-orange-400",
    radius: "rounded-[1.25rem]",
  },
  "Neo Eclipse": {
    light: false,
    font: "font-sans",
    shell: "bg-[#050505] text-[#f5f5f5]",
    card: "bg-[#121212] border border-white/5",
    hero: "bg-black text-white",
    text: "text-[#f5f5f5]",
    muted: "text-[#a3a3a3]",
    accent: "text-emerald-400",
    accentBg: "bg-emerald-500",
    btn: "bg-emerald-500 hover:bg-emerald-400 text-black font-semibold",
    progress: "bg-emerald-400",
    radius: "rounded-[2rem]",
  },
  "Neo Glass": {
    light: false,
    font: "font-sans",
    shell: "bg-[#0f172a] text-white",
    card: "bg-white/10 border border-white/20 backdrop-blur-2xl",
    hero: "bg-white/10 border border-white/20 backdrop-blur-2xl",
    text: "text-white",
    muted: "text-white/70",
    accent: "text-pink-300",
    accentBg: "bg-pink-500",
    btn: "bg-white/15 hover:bg-white/25 border border-white/20 text-white backdrop-blur-xl",
    progress: "bg-gradient-to-r from-pink-500 via-orange-400 to-cyan-400",
    radius: "rounded-[1.75rem]",
  },
  "Neo Minimal": {
    light: true,
    font: "font-sans",
    shell: "bg-white text-black",
    card: "bg-zinc-50 border border-black/10",
    hero: "bg-black text-white",
    text: "text-black",
    muted: "text-zinc-500",
    accent: "text-black",
    accentBg: "bg-black",
    btn: "bg-black hover:bg-zinc-800 text-white",
    progress: "bg-black",
    radius: "rounded-xl",
  },
  "Neo Dashboard": {
    light: false,
    font: "font-sans",
    shell: "bg-[#0f1115] text-white",
    card: "bg-[#161a22] border border-white/5",
    hero: "bg-[#161a22] border border-white/5",
    text: "text-white",
    muted: "text-white/55",
    accent: "text-blue-400",
    accentBg: "bg-blue-500",
    btn: "bg-blue-500 hover:bg-blue-400 text-white",
    progress: "bg-blue-500",
    radius: "rounded-2xl",
  },
};

function supportLinks(ps?: PortalSettings) {
  if (!ps || ps.showSupportSection === false) return [];
  const items: Array<{ href: string; icon: typeof MessageCircle; label: string }> = [];
  if (ps.showTelegram && ps.telegramLink)
    items.push({ href: ps.telegramLink, icon: MessageCircle, label: "Telegram" });
  if (ps.showWhatsApp && ps.whatsappLink)
    items.push({ href: ps.whatsappLink, icon: Phone, label: "WhatsApp" });
  if (ps.showWebsite && ps.websiteUrl)
    items.push({ href: ps.websiteUrl, icon: Globe, label: "Website" });
  if (ps.showEmail && ps.emailAddress)
    items.push({
      href: ps.emailAddress.startsWith("mailto:")
        ? ps.emailAddress
        : `mailto:${ps.emailAddress}`,
      icon: Mail,
      label: "Email",
    });
  return items;
}

export default function NeoTheme({
  id,
  data,
  variant,
}: {
  id: string;
  data: any;
  variant: NeoVariant;
}) {
  const v = VARIANT[variant];
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [qrModal, setQrModal] = useState(false);
  const [importSheet, setImportSheet] = useState(false);
  const [urlForQR, setUrlForQR] = useState("");

  const { data: nodes } = useQuery({
    queryKey: ["subscriptionNodes", id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/subscriptions/${id}/nodes`);
      if (!res.ok) return [];
      return res.json();
    },
    retry: false,
  });

  const {
    email,
    remark,
    enable,
    up,
    down,
    total,
    expiryTime,
    subId,
    inbound,
    portalSettings,
  } = data as {
    email?: string;
    remark?: string;
    enable?: boolean;
    up: number;
    down: number;
    total: number;
    expiryTime: number;
    subId?: string;
    inbound?: any;
    portalSettings?: PortalSettings;
  };

  const used = Number(up) + Number(down);
  const totalN = Number(total);
  const remaining = totalN > 0 ? Math.max(totalN - used, 0) : 0;
  const pct = totalN > 0 ? Math.min(100, (used / totalN) * 100) : 0;
  const remPct = totalN > 0 ? Math.max(0, 100 - pct) : 100;
  const isExpired = expiryTime > 0 && Date.now() > expiryTime;
  const isActive = !!enable && !isExpired && (totalN === 0 || used < totalN);
  const remainingDays =
    expiryTime > 0
      ? Math.max(0, Math.ceil((expiryTime - Date.now()) / (1000 * 60 * 60 * 24)))
      : null;

  const clientName = remark || email || "Client";
  const brandName = portalSettings?.portalName || "Subscription";
  const footerText = portalSettings?.footerText || "";
  const logoSrc = resolveThemeLogo({
    logoLight: portalSettings?.logoUrl,
    logoDark: portalSettings?.logoDarkUrl,
    theme: variant,
  });
  const contacts = supportLinks(portalSettings);
  const primaryColor = portalSettings?.primaryColor;

  const systemUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/s/${encodeURIComponent(subId || email || "")}`
      : `/s/${encodeURIComponent(subId || email || "")}`;

  const getNativeUrl = () => {
    const sub = encodeURIComponent(subId || email || "");
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
  };
  const nativeUrl = getNativeUrl();
  const primarySubUrl = systemUrl;

  const copyText = async (text: string, cid: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(cid);
      setTimeout(() => setCopiedText(null), 2000);
    } catch {
      /* ignore */
    }
  };

  const ringStyle =
    variant === "Neo Dashboard" || variant === "Neo Minimal"
      ? {
          background: `conic-gradient(${primaryColor || (variant === "Neo Minimal" ? "#000" : "#3b82f6")} ${remPct * 3.6}deg, ${
            variant === "Neo Minimal" ? "#e4e4e7" : "#1f2937"
          } 0deg)`,
        }
      : undefined;

  return (
    <div className={`relative min-h-[100dvh] w-full overflow-x-hidden ${v.shell} ${v.font}`}>
      {variant === "Neo Glass" ? (
        <div className="pointer-events-none fixed inset-0 -z-0 overflow-hidden">
          <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-[#FF2E93] opacity-50 blur-[90px]" />
          <div className="absolute -bottom-32 -right-20 h-[28rem] w-[28rem] rounded-full bg-[#FF8A00] opacity-50 blur-[90px]" />
          <div className="absolute left-1/2 top-1/3 h-80 w-80 -translate-x-1/2 rounded-full bg-[#00C2FF] opacity-40 blur-[90px]" />
        </div>
      ) : null}

      <div className="relative z-10 mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-6 sm:px-6">
        {/* Header: logo + brand + contact icons */}
        <header
          className={`flex items-center justify-between gap-3 ${
            variant === "Neo Eclipse" ? `${v.card} ${v.radius} px-4 py-3` : ""
          }`}
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {logoSrc ? (
              <img src={logoSrc} alt={brandName} className="h-10 w-auto max-w-[7rem] object-contain" />
            ) : (
              <div
                className={`flex h-10 w-10 items-center justify-center ${v.radius} ${v.accentBg} text-white`}
              >
                <ShieldCheck size={20} />
              </div>
            )}
            <div className="min-w-0">
              <div className={`truncate text-lg font-bold tracking-tight ${v.text}`}>{brandName}</div>
              {variant !== "Neo Minimal" ? (
                <div className={`text-xs ${v.muted}`}>Subscription portal</div>
              ) : null}
            </div>
          </div>
          {contacts.length ? (
            <div className="flex shrink-0 items-center gap-1.5">
              {contacts.map((c) => (
                <a
                  key={c.label}
                  href={c.href}
                  target="_blank"
                  rel="noreferrer"
                  title={c.label}
                  className={`inline-flex h-10 w-10 items-center justify-center transition hover:opacity-80 ${v.card} ${v.radius}`}
                >
                  <c.icon size={18} />
                </a>
              ))}
            </div>
          ) : null}
        </header>

        {/* Profile */}
        <section className={`flex items-center gap-4 p-4 ${v.card} ${v.radius}`}>
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white ${v.accentBg}`}
            style={primaryColor ? { background: primaryColor } : undefined}
          >
            {(clientName || "U").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className={`text-xs uppercase tracking-wide ${v.muted}`}>Client</div>
            <div className={`truncate text-base font-semibold ${v.text}`}>{clientName}</div>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              isActive
                ? "bg-emerald-500/15 text-emerald-500"
                : "bg-red-500/15 text-red-500"
            }`}
          >
            {isActive ? "Active" : isExpired ? "Expired" : "Disabled"}
          </span>
        </section>

        {/* Hero */}
        <section className={`relative overflow-hidden p-6 ${v.hero} ${v.radius}`}>
          {variant === "Neo Dashboard" || variant === "Neo Minimal" ? (
            <div className="flex flex-col items-center gap-4 py-2">
              <div
                className="relative flex h-40 w-40 items-center justify-center rounded-full"
                style={ringStyle}
              >
                <div
                  className={`flex h-[7.5rem] w-[7.5rem] flex-col items-center justify-center rounded-full ${
                    variant === "Neo Minimal" ? "bg-white text-black" : "bg-[#0f1115] text-white"
                  }`}
                >
                  <div className="text-3xl font-black tabular-nums">
                    {totalN > 0 ? `${Math.round(remPct)}%` : "∞"}
                  </div>
                  <div className={`text-xs ${variant === "Neo Minimal" ? "text-zinc-500" : "text-white/50"}`}>
                    remaining
                  </div>
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold tabular-nums">
                  {totalN > 0 ? formatBytes(remaining) : "Unlimited"}
                </div>
                <div className={`text-sm ${v.muted}`}>
                  {remainingDays != null
                    ? `${remainingDays} day${remainingDays === 1 ? "" : "s"} left`
                    : "No expiry"}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="text-sm font-medium opacity-90">Remaining traffic</div>
              <div className="mt-1 flex items-end gap-2">
                <span className="text-5xl font-black leading-none tabular-nums">
                  {totalN > 0 ? formatBytes(remaining).split(" ")[0] : "∞"}
                </span>
                <span className="pb-1 text-lg font-semibold opacity-90">
                  {totalN > 0 ? formatBytes(remaining).split(" ").slice(1).join(" ") : ""}
                </span>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <div className="font-semibold tabular-nums">{formatBytes(Number(up))}</div>
                  <div className="opacity-70">Up</div>
                </div>
                <div>
                  <div className="font-semibold tabular-nums">{formatBytes(Number(down))}</div>
                  <div className="opacity-70">Down</div>
                </div>
                <div>
                  <div className="font-semibold tabular-nums">
                    {remainingDays != null ? `${remainingDays}d` : "∞"}
                  </div>
                  <div className="opacity-70">Left</div>
                </div>
              </div>
              {totalN > 0 ? (
                <div className="mt-5 h-2 overflow-hidden rounded-full bg-black/20">
                  <div
                    className={`h-full rounded-full ${v.progress}`}
                    style={{
                      width: `${remPct}%`,
                      ...(primaryColor && variant !== "Neo Glass"
                        ? { background: primaryColor }
                        : null),
                    }}
                  />
                </div>
              ) : null}
            </>
          )}
        </section>

        {/* Details */}
        <section className={`grid grid-cols-2 gap-3 p-4 ${v.card} ${v.radius}`}>
          <div>
            <div className={`text-xs ${v.muted}`}>Used</div>
            <div className={`font-semibold tabular-nums ${v.text}`}>{formatBytes(used)}</div>
          </div>
          <div>
            <div className={`text-xs ${v.muted}`}>Total</div>
            <div className={`font-semibold tabular-nums ${v.text}`}>
              {totalN > 0 ? formatBytes(totalN) : "Unlimited"}
            </div>
          </div>
          <div>
            <div className={`text-xs ${v.muted}`}>Expires</div>
            <div className={`font-semibold ${v.text}`}>
              {expiryTime > 0 ? formatDate(expiryTime) : "Never"}
            </div>
          </div>
          <div>
            <div className={`text-xs ${v.muted}`}>Nodes</div>
            <div className={`font-semibold tabular-nums ${v.text}`}>
              {Array.isArray(nodes) ? nodes.length : "—"}
            </div>
          </div>
        </section>

        {/* Actions */}
        <section className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => copyText(primarySubUrl, "sub")}
            className={`flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-semibold transition ${v.btn} ${v.radius}`}
          >
            {copiedText === "sub" ? <Check size={16} /> : <Copy size={16} />}
            {copiedText === "sub" ? "Copied" : "Copy link"}
          </button>
          <button
            type="button"
            onClick={() => {
              setUrlForQR(primarySubUrl);
              setQrModal(true);
            }}
            className={`flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-semibold transition ${v.card} ${v.radius}`}
          >
            <QrCode size={16} /> QR code
          </button>
          <button
            type="button"
            onClick={() => setImportSheet(true)}
            className={`col-span-2 flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-semibold transition ${v.card} ${v.radius}`}
          >
            <MonitorSmartphone size={16} /> Import to app
          </button>
          {portalSettings?.showNativeQR !== false ? (
            <button
              type="button"
              onClick={() => copyText(nativeUrl, "native")}
              className={`col-span-2 flex items-center justify-center gap-2 px-4 py-3 text-sm ${v.muted} hover:opacity-80`}
            >
              {copiedText === "native" ? <Check size={14} /> : <Copy size={14} />}
              {copiedText === "native" ? "Native URL copied" : "Copy native panel URL"}
            </button>
          ) : null}
        </section>

        {/* Footer from branding footerText (replaces NeoTemplate copyright) */}
        <footer className={`mt-2 pb-8 text-center text-xs ${v.muted}`}>
          {footerText ? <p>{footerText}</p> : <p>{brandName}</p>}
        </footer>
      </div>

      <AnimatePresence>
        {qrModal ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            onClick={() => setQrModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 16 }}
              className={`relative w-full max-w-sm p-6 ${v.card} ${v.radius}`}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setQrModal(false)}
                className={`absolute right-4 top-4 ${v.muted}`}
              >
                <X size={18} />
              </button>
              <h3 className={`mb-4 text-center text-lg font-bold ${v.text}`}>Scan QR</h3>
              <div className="mb-3 flex justify-center rounded-2xl bg-white p-4">
                <QRCodeCanvas value={urlForQR} size={220} bgColor="#ffffff" fgColor="#111111" level="H" />
              </div>
            </motion.div>
          </motion.div>
        ) : null}

        {importSheet ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
            onClick={() => setImportSheet(false)}
          >
            <motion.div
              initial={{ y: 40 }}
              animate={{ y: 0 }}
              exit={{ y: 40 }}
              className={`w-full max-w-md space-y-3 p-6 ${v.card} ${v.radius}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2 flex items-center justify-between">
                <h3 className={`text-lg font-bold ${v.text}`}>Import</h3>
                <button type="button" onClick={() => setImportSheet(false)} className={v.muted}>
                  <X size={18} />
                </button>
              </div>
              <a
                href={`v2rayng://install-sub?url=${encodeURIComponent(primarySubUrl)}`}
                className={`block w-full py-3.5 text-center text-sm font-semibold ${v.btn} ${v.radius}`}
              >
                V2rayNG
              </a>
              <a
                href={`shadowrocket://add/sub://${btoa(primarySubUrl)}`}
                className={`block w-full py-3.5 text-center text-sm font-semibold ${v.card} ${v.radius}`}
              >
                Shadowrocket
              </a>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
