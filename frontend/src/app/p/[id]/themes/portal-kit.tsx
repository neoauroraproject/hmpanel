"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  ensureVazirFont,
  hasPersianText,
  resolveThemeLogo,
} from "@/modules/shared/brand-logo";
import { getConnectionRenderer } from "@/components/connection/RendererRegistry";
import type { ClientOutputModel } from "@/components/connection/types";

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
  "Dark",
  "Light",
  "Eclipse",
  "Sunset",
  "Glass",
  "Vibrant",
] as const;

export type PortalThemeId = (typeof PORTAL_THEMES)[number];
export type PortalLang = "fa" | "en";

const PORTAL_LANG_KEY = "hmpanel-portal-lang";

const STRINGS = {
  active: { fa: "فعال", en: "Active" },
  expired: { fa: "منقضی", en: "Expired" },
  disabled: { fa: "غیرفعال", en: "Disabled" },
  depleted: { fa: "تمام‌شده", en: "Depleted" },
  traffic: { fa: "ترافیک", en: "Traffic" },
  usage: { fa: "مصرف", en: "Usage" },
  unlimited: { fa: "نامحدود", en: "Unlimited" },
  daysLeft: { fa: "روز مانده", en: "days left" },
  expiresOn: { fa: "انقضا", en: "Expires" },
  never: { fa: "بدون انقضا", en: "Never" },
  copyLink: { fa: "کپی لینک ساب", en: "Copy subscription" },
  copied: { fa: "کپی شد", en: "Copied" },
  qr: { fa: "کیوآر", en: "QR" },
  scanQr: { fa: "اسکن کیوآر کد", en: "Scan QR Code" },
  configs: { fa: "کانفیگ‌ها", en: "Configurations" },
  nodes: { fa: "نود", en: "nodes" },
  noConfigs: { fa: "هنوز کانفیگی موجود نیست.", en: "No configs available yet." },
  support: { fa: "پشتیبانی", en: "Support" },
  telegram: { fa: "تلگرام", en: "Telegram" },
  whatsapp: { fa: "واتساپ", en: "WhatsApp" },
  website: { fa: "وب‌سایت", en: "Website" },
  email: { fa: "ایمیل", en: "Email" },
  importApp: { fa: "ورود به اپ", en: "Import to App" },
  systemSub: { fa: "لینک سیستم", en: "System Sub" },
  nativeSub: { fa: "لینک پنل", en: "Panel Native" },
  client: { fa: "مشتری", en: "Client" },
  remaining: { fa: "باقی‌مانده", en: "Remaining" },
  download: { fa: "دانلود", en: "Download" },
  upload: { fa: "آپلود", en: "Upload" },
  timeLeft: { fa: "زمان باقی‌مانده", en: "Time remaining" },
  connect: { fa: "اتصال سریع", en: "Quick connect" },
  remainingTraffic: { fa: "ترافیک باقی‌مانده", en: "Remaining Traffic" },
  remainingData: { fa: "داده باقی‌مانده", en: "Remaining Data" },
  totalUsed: { fa: "مصرف کل", en: "Total Used" },
  totalLimit: { fa: "سقف کل", en: "Total Limit" },
  clientProfile: { fa: "پروفایل مشتری", en: "Client Profile" },
  hi: { fa: "سلام،", en: "Hi," },
  advancedInfo: { fa: "اطلاعات پیشرفته", en: "Advanced Information" },
  appsActions: { fa: "اپ‌ها و عملیات", en: "Apps & Actions" },
  copySubLink: { fa: "کپی لینک سابسکریپشن", en: "Copy Subscription Link" },
  quickActions: { fa: "عملیات سریع", en: "Quick Actions" },
  poweredBy: { fa: "قدرت‌گرفته از", en: "Powered by" },
  daysRemaining: { fa: "روز باقی‌مانده", en: "days remaining" },
} as const;

export type PortalStringKey = keyof typeof STRINGS;

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

export function supportContacts(ps?: PortalSettings, t?: (k: PortalStringKey) => string) {
  if (!ps || ps.showSupportSection === false) return [];
  const label = (key: PortalStringKey, fallback: string) => (t ? t(key) : fallback);
  const items: { label: string; href: string; icon: typeof Mail; kind: string }[] = [];
  if (ps.showTelegram && ps.telegramLink)
    items.push({ label: label("telegram", "Telegram"), href: ps.telegramLink, icon: MessageCircle, kind: "telegram" });
  if (ps.showWhatsApp && ps.whatsappLink)
    items.push({ label: label("whatsapp", "WhatsApp"), href: ps.whatsappLink, icon: Phone, kind: "whatsapp" });
  if (ps.showWebsite && ps.websiteUrl)
    items.push({ label: label("website", "Website"), href: ps.websiteUrl, icon: Globe, kind: "website" });
  if (ps.showEmail && ps.emailAddress)
    items.push({
      label: label("email", "Email"),
      href: `mailto:${ps.emailAddress}`,
      icon: Mail,
      kind: "email",
    });
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

export function useClientOutput(id: string) {
  return useQuery({
    queryKey: ["subscription-output", id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/subscriptions/${id}/output`);
      if (!res.ok) return null;
      return (await res.json()) as ClientOutputModel;
    },
    retry: false,
    enabled: !!id,
  });
}

function detectPortalLang(data: SubData): PortalLang {
  if (typeof window !== "undefined") {
    const saved = window.localStorage.getItem(PORTAL_LANG_KEY);
    if (saved === "fa" || saved === "en") return saved;
  }
  const ps = data.portalSettings;
  if (
    hasPersianText(
      ps?.portalName,
      ps?.footerText,
      data.remark,
      data.email,
    )
  ) {
    return "fa";
  }
  return "en";
}

export function usePortalLocale(data: SubData) {
  const [lang, setLangState] = useState<PortalLang>(() => detectPortalLang(data));

  const setLang = useCallback((next: PortalLang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(PORTAL_LANG_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (lang === "fa") {
      ensureVazirFont();
      document.documentElement.lang = "fa";
      document.documentElement.dir = "rtl";
    } else {
      document.documentElement.lang = "en";
      document.documentElement.dir = "ltr";
    }
    return () => {
      document.documentElement.dir = "ltr";
      document.documentElement.lang = "en";
    };
  }, [lang]);

  const isFa = lang === "fa";
  const t = useCallback(
    (key: PortalStringKey) => STRINGS[key][lang],
    [lang],
  );
  const tf = useCallback((fa: string, en: string) => (isFa ? fa : en), [isFa]);

  return {
    lang,
    setLang,
    isFa,
    t,
    tf,
    fontFamily: isFa
      ? '"Vazirmatn", Tahoma, sans-serif'
      : undefined as string | undefined,
  };
}

export function LangToggle({
  lang,
  setLang,
  className = "",
}: {
  lang: PortalLang;
  setLang: (l: PortalLang) => void;
  className?: string;
}) {
  return (
    <div
      className={`inline-flex overflow-hidden rounded-full border text-[11px] font-semibold uppercase tracking-wider ${className}`}
      role="group"
      aria-label="Language"
    >
      <button
        type="button"
        onClick={() => setLang("fa")}
        className={`px-2.5 py-1 transition ${lang === "fa" ? "bg-current/15" : "opacity-55 hover:opacity-90"}`}
      >
        FA
      </button>
      <button
        type="button"
        onClick={() => setLang("en")}
        className={`px-2.5 py-1 transition ${lang === "en" ? "bg-current/15" : "opacity-55 hover:opacity-90"}`}
      >
        EN
      </button>
    </div>
  );
}

export function usePortalModel(id: string, data: SubData, theme: string) {
  const { data: nodes = [] } = useSubscriptionNodes(id);
  const { data: connectionOutput = null } = useClientOutput(id);
  const [copied, setCopied] = useState<string | null>(null);
  const [qrValue, setQrValue] = useState<string | null>(null);
  const locale = usePortalLocale(data);

  const ps = data.portalSettings || {};
  const used = Number(data.up || 0) + Number(data.down || 0);
  const down = Number(data.down || 0);
  const up = Number(data.up || 0);
  const total = Number(data.total || 0);
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const isExpired = Number(data.expiryTime || 0) > 0 && Date.now() > Number(data.expiryTime);
  const isActive = !!data.enable && !isExpired && (total === 0 || used < total);
  const remainingDays =
    Number(data.expiryTime || 0) > 0
      ? Math.max(0, Math.ceil((Number(data.expiryTime) - Date.now()) / 86400000))
      : null;
  const clientName = data.remark || data.email || locale.t("client");
  const brandName = ps.portalName || "Subscription";
  const logoSrc = resolveThemeLogo({
    logoLight: ps.logoUrl,
    logoDark: ps.logoDarkUrl,
    theme,
  });
  const contacts = supportContacts(ps, locale.t);
  const payload = (connectionOutput?.payload || {}) as {
    systemSubUrl?: string;
    nativeSubUrl?: string | null;
  };
  const systemUrl =
    payload.systemSubUrl || buildSystemSubUrl(data.subId, data.email);
  const nativeUrl =
    payload.nativeSubUrl || buildNativeSubUrl(data);
  const outputType = connectionOutput?.outputType || "subscription";

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* ignore */
    }
  };

  const statusLabel = isActive
    ? locale.t("active")
    : isExpired
      ? locale.t("expired")
      : !data.enable
        ? locale.t("disabled")
        : locale.t("depleted");

  return {
    nodes: nodes as PortalNode[],
    copied,
    copy,
    qrValue,
    setQrValue,
    ps,
    used,
    up,
    down,
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
    connectionOutput,
    outputType,
    formatBytes,
    formatDate,
    statusLabel,
    ...locale,
  };
}

/** Drop-in connection panel keyed by outputType (never by protocol). */
export function PortalConnectionPanel({
  output,
  portalSettings,
}: {
  output: ClientOutputModel | null | undefined;
  portalSettings?: PortalSettings;
}) {
  if (!output) return null;
  const Renderer = getConnectionRenderer(output.outputType);
  return (
    <Renderer
      output={output}
      showPlatformQR={portalSettings?.showPlatformQR !== false}
      showNativeQR={portalSettings?.showNativeQR !== false}
      allowQRDownload={portalSettings?.allowQRDownload !== false}
    />
  );
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
          className="absolute end-3 top-3 rounded-full p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800"
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
  title,
  empty,
  nodesLabel,
}: {
  nodes: PortalNode[];
  copied: string | null;
  onCopy: (link: string, key: string) => void;
  onQr: (link: string) => void;
  className?: string;
  itemClassName?: string;
  title?: string;
  empty?: string;
  nodesLabel?: string;
}) {
  return (
    <section className={className}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <h3 className="text-sm font-semibold tracking-wide">{title || "Configurations"}</h3>
        <span className="text-xs opacity-60">
          {nodes.length} {nodesLabel || "nodes"}
        </span>
      </div>
      {!nodes.length ? (
        <p className="text-sm opacity-60">{empty || "No configs available yet."}</p>
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
  label,
  className = "",
}: {
  isActive: boolean;
  isExpired: boolean;
  label?: string;
  className?: string;
}) {
  const text = label || (isActive ? "Active" : isExpired ? "Expired" : "Disabled");
  const tone = isActive
    ? "bg-emerald-500/15 text-emerald-500"
    : "bg-rose-500/15 text-rose-500";
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tone} ${className}`}>
      {text}
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

export function useExpiryLabel(
  remainingDays: number | null,
  expiryTime: number | undefined,
  t?: (k: PortalStringKey) => string,
) {
  return useMemo(() => {
    const tr = t ?? ((k: PortalStringKey) => STRINGS[k].en);
    if (!expiryTime || expiryTime <= 0) return tr("unlimited");
    if (remainingDays == null) return formatDate(expiryTime);
    if (remainingDays <= 0) return tr("expired");
    return `${remainingDays} ${tr("daysLeft")} · ${formatDate(expiryTime)}`;
  }, [remainingDays, expiryTime, t]);
}

export function useThemeFont(theme: PortalThemeId | string, isFa?: boolean) {
  useEffect(() => {
    if (isFa) {
      ensureVazirFont();
      return;
    }
    const map: Record<string, [string, string]> = {
      Aurora: ["Outfit", "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap"],
      Eclipse: [
        "EclipseFonts",
        "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap",
      ],
      Glass: [
        "GlassFonts",
        "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap",
      ],
      Vibrant: [
        "VibrantFonts",
        "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap",
      ],
      Sunset: [
        "SunsetFonts",
        "https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,500;8..60,600;8..60,700&display=swap",
      ],
    };
    const entry = map[theme];
    if (entry) ensurePortalFont(entry[0], entry[1]);
  }, [theme, isFa]);
}
