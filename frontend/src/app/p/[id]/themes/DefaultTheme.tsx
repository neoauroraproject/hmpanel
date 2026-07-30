"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Copy,
  Download,
  QrCode,
  MonitorSmartphone,
  Check,
  MessageCircle,
  Phone,
  Globe,
  Mail,
  X,
  ShieldCheck,
  Clock,
  Zap,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { formatBytes, formatDate } from "@/lib/format";
import { API_BASE } from "@/lib/api";
import { normalizePortalTheme, resolveThemeLogo } from "@/modules/shared/brand-logo";
import {
  buildNativeSubUrl,
  buildSystemSubUrl,
  LangToggle,
  normalizeTelegramHref,
  PortalConnectionPanel,
  useClientOutput,
  usePortalLocale,
  type SubData,
} from "./portal-kit";
import { ClientAppsSheet } from "./client-apps";

export default function DefaultTheme({ id, data }: { id: string; data: SubData }) {
  const { lang, setLang, isFa, t, fontFamily } = usePortalLocale(data);
  const { data: nodes } = useQuery({
    queryKey: ["subscriptionNodes", id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/subscriptions/${id}/nodes`);
      if (!res.ok) return [];
      return res.json();
    },
    retry: false,
  });
  const { data: connectionOutput } = useClientOutput(id);
  const outputType = connectionOutput?.outputType || "subscription";

  const [qrModal, setQrModal] = useState(false);
  const [urlForQR, setUrlForQR] = useState("");
  const [importSheet, setImportSheet] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [showTrafficDetails, setShowTrafficDetails] = useState(false);

  const { email, remark, enable, up, down, total, expiryTime, portalSettings, uuid, subId } =
    data;
  const used = Number(up || 0) + Number(down || 0);
  const totalBytes = Number(total || 0);
  const downBytes = Number(down || 0);
  const upBytes = Number(up || 0);
  const expiry = Number(expiryTime || 0);

  const normalized = normalizePortalTheme(portalSettings?.theme);
  const currentTheme = normalized === "Light" ? "Light" : "Dark";
  const ts = {
    Dark: {
      bg: "bg-[#0a0a0c]",
      cardBg: "bg-[#121319]",
      card: "bg-[#121319] border-zinc-800/80",
      cardHover: "hover:bg-[#16171e]",
      text: "text-zinc-200",
      heading: "text-white",
      muted: "text-zinc-500",
      accent: "text-emerald-400",
      accentBg: "bg-emerald-500/20",
      accentGlow: "bg-emerald-500/5",
      selection: "selection:bg-emerald-500/30",
      roundedLg: "rounded-2xl",
      roundedXl: "rounded-[2rem]",
      shadow: "shadow-2xl shadow-black/50",
      font: "font-sans",
    },
    Light: {
      bg: "bg-zinc-50",
      cardBg: "bg-white",
      card: "bg-white border-zinc-200 shadow-lg",
      cardHover: "hover:bg-zinc-50",
      text: "text-zinc-800",
      heading: "text-zinc-900",
      muted: "text-zinc-500",
      accent: "text-blue-600",
      accentBg: "bg-blue-500/10",
      accentGlow: "bg-blue-500/5",
      selection: "selection:bg-blue-500/30",
      roundedLg: "rounded-2xl",
      roundedXl: "rounded-[2rem]",
      shadow: "shadow-xl shadow-zinc-200",
      font: "font-sans",
    },
  }[currentTheme];

  const pct = totalBytes > 0 ? Math.min(100, (used / totalBytes) * 100) : 0;
  const remainingDays =
    expiry > 0 ? Math.max(0, Math.ceil((expiry - Date.now()) / (1000 * 60 * 60 * 24))) : null;
  const isExpired = expiry > 0 && Date.now() > expiry;
  const isActive = !!enable && !isExpired && (totalBytes === 0 || used < totalBytes);

  const statusColor = isActive
    ? `${ts.accent} bg-emerald-500/10 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.2)]`
    : "text-red-400 bg-red-500/10 border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.2)]";
  const statusText = isExpired
    ? t("expired")
    : !enable
      ? t("disabled")
      : totalBytes > 0 && used >= totalBytes
        ? t("depleted")
        : t("active");

  const brandName = portalSettings?.portalName || t("subscriptionInfo");
  const logoSrc = resolveThemeLogo({
    logoLight: portalSettings?.logoUrl,
    logoDark: portalSettings?.logoDarkUrl,
    theme: currentTheme,
  });
  const primarySubUrl = buildSystemSubUrl(subId, email);
  const nativeUrl = buildNativeSubUrl(data);

  const copyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(key);
      setTimeout(() => setCopiedText(null), 2000);
    } catch {
      /* ignore */
    }
  };

  const openQR = (url: string) => {
    setUrlForQR(url);
    setQrModal(true);
  };

  const clientName = remark || email || t("client");
  const toggleClass =
    currentTheme === "Light"
      ? "border-zinc-300 text-zinc-700"
      : "border-zinc-700 text-zinc-200";

  return (
    <div
      className={`flex min-h-[100dvh] w-full flex-col ${ts.bg} ${ts.font} ${ts.text} ${ts.selection}`}
      dir={isFa ? "rtl" : "ltr"}
      style={fontFamily ? { fontFamily } : undefined}
      lang={lang}
    >
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between p-4 py-6 md:px-8">
        <div className="flex items-center gap-4">
          {logoSrc ? (
            <img src={logoSrc} alt={brandName} className="h-14 w-auto object-contain" />
          ) : (
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${ts.accentBg}`}>
              <ShieldCheck size={28} className={ts.accent} />
            </div>
          )}
          <span className={`text-2xl font-black tracking-wide ${ts.heading}`}>{brandName}</span>
        </div>

        <div className="flex items-center gap-3">
          <LangToggle lang={lang} setLang={setLang} className={toggleClass} />
          <div className="hidden items-center gap-4 md:flex">
            {portalSettings?.showTelegram && (
              <HeaderAction icon={<MessageCircle size={22} />} href={normalizeTelegramHref(portalSettings.telegramLink) || "#"} />
            )}
            {portalSettings?.showWhatsApp && (
              <HeaderAction icon={<Phone size={22} />} href={portalSettings.whatsappLink || "#"} />
            )}
            {portalSettings?.showWebsite && (
              <HeaderAction icon={<Globe size={22} />} href={portalSettings.websiteUrl || "#"} />
            )}
            {portalSettings?.showEmail && (
              <HeaderAction
                icon={<Mail size={22} />}
                href={`mailto:${portalSettings.emailAddress || ""}`}
              />
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 pb-12 md:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center pb-4 pt-8 md:pt-12"
        >
          <div
            className={`mb-6 flex items-center gap-2 rounded-full border px-4 py-1 text-xs font-bold uppercase tracking-widest ${statusColor}`}
          >
            <div
              className={`h-2 w-2 animate-pulse rounded-full ${isActive ? "bg-emerald-400" : "bg-red-400"}`}
            />
            {statusText}
          </div>
          <h1
            className={`text-center text-4xl font-black leading-tight tracking-tight md:text-6xl ${ts.heading}`}
          >
            {clientName}
          </h1>
          <p className={`mt-4 font-mono text-sm md:text-base ${ts.muted}`}>ID: {uuid}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={`relative w-full overflow-hidden border p-6 md:p-10 ${ts.card} ${ts.roundedXl} ${ts.shadow}`}
        >
          <div
            className={`pointer-events-none absolute left-1/2 top-0 h-[200px] w-[80%] -translate-x-1/2 rounded-full blur-[120px] ${ts.accentGlow}`}
          />

          <div className="relative z-10 mb-8 grid grid-cols-1 items-end gap-8 md:grid-cols-2 md:gap-16">
            <div>
              <div
                className={`mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest ${ts.muted}`}
              >
                <Zap size={14} /> {t("trafficUsage")}
              </div>
              <div className="flex items-baseline gap-2">
                <span className={`text-5xl font-black tracking-tighter md:text-6xl ${ts.heading}`}>
                  {formatBytes(used)}
                </span>
                <span className={`text-xl font-medium md:text-2xl ${ts.muted}`}>
                  / {totalBytes === 0 ? "∞" : formatBytes(totalBytes)}
                </span>
              </div>
              <div className="mt-4 flex gap-6 text-sm font-medium">
                <div className={ts.accent}>↓ {formatBytes(downBytes)}</div>
                <div className="text-blue-400">↑ {formatBytes(upBytes)}</div>
              </div>
            </div>

            <div className={isFa ? "md:text-left" : "md:text-right"}>
              <div
                className={`mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest md:justify-end ${ts.muted}`}
              >
                <Clock size={14} /> {t("timeLeft")}
              </div>
              {remainingDays !== null ? (
                <div className="flex items-baseline gap-2 md:justify-end">
                  <span
                    className={`text-5xl font-black tracking-tighter md:text-6xl ${
                      remainingDays < 7 ? "text-red-400" : ts.heading
                    }`}
                  >
                    {remainingDays}
                  </span>
                  <span className={`text-xl font-medium md:text-2xl ${ts.muted}`}>{t("days")}</span>
                </div>
              ) : (
                <div className={`text-3xl font-black tracking-tighter md:text-5xl ${ts.accent}`}>
                  {t("unlimited")}
                </div>
              )}
              <div className={`mt-4 text-sm font-medium ${ts.muted}`}>
                {expiry > 0
                  ? `${t("expiresOnDate")} ${formatDate(expiry)}`
                  : t("noExpiry")}
              </div>
            </div>
          </div>

          <div className="relative z-10">
            <div className="h-3 w-full overflow-hidden rounded-full border border-zinc-800/50 bg-zinc-900 shadow-inner md:h-4">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 1.5, delay: 0.3, ease: "easeOut" }}
                className={`relative h-full overflow-hidden rounded-full ${
                  pct > 90
                    ? "bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.6)]"
                    : pct > 75
                      ? "bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.6)]"
                      : "bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.6)]"
                }`}
              >
                <div className="absolute inset-0 h-full w-full -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              </motion.div>
            </div>

            <button
              onClick={() => setShowTrafficDetails(!showTrafficDetails)}
              className="mx-auto mt-6 flex items-center gap-2 text-sm font-medium text-zinc-400 transition-colors hover:text-white"
            >
              {showTrafficDetails ? t("hideDetails") : t("showDetails")}
              {showTrafficDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            <AnimatePresence>
              {showTrafficDetails && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="mt-4 overflow-hidden"
                >
                  <div className="flex flex-col items-center gap-6 divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 sm:flex-row sm:divide-x sm:divide-y-0">
                    <div className="w-full text-center sm:w-1/3 sm:text-start">
                      <div className={`mb-1 text-xs ${ts.muted}`}>{t("totalLimit")}</div>
                      <div className={`text-lg font-bold ${ts.heading}`}>
                        {totalBytes === 0 ? t("unlimited") : formatBytes(totalBytes)}
                      </div>
                    </div>
                    <div className="w-full pt-4 text-center sm:w-1/3 sm:pt-0">
                      <div className={`mb-1 text-xs ${ts.muted}`}>{t("totalConsumed")}</div>
                      <div className="text-lg font-bold text-amber-400">{formatBytes(used)}</div>
                    </div>
                    <div className="w-full pt-4 text-center sm:w-1/3 sm:pt-0 sm:text-end">
                      <div className={`mb-1 text-xs ${ts.muted}`}>{t("remaining")}</div>
                      <div className={`text-lg font-bold ${ts.accent}`}>
                        {totalBytes === 0
                          ? t("unlimited")
                          : formatBytes(Math.max(0, totalBytes - used))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-6 lg:col-span-2"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-1 rounded-full bg-emerald-500" />
              <h2 className={`text-2xl font-bold ${ts.heading}`}>{t("subLink")}</h2>
            </div>

            <div
              className={`group relative overflow-hidden border p-6 shadow-xl transition-colors hover:border-zinc-700 ${ts.card} ${ts.roundedLg}`}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className={`mb-2 text-xs font-bold uppercase tracking-widest ${ts.muted}`}>
                    {t("systemSub")}
                  </div>
                  <div className="select-all truncate font-mono text-sm text-zinc-300 md:text-base">
                    {primarySubUrl}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <MainActionBtn
                    icon={
                      copiedText === "sub" ? (
                        <Check size={18} className={ts.accent} />
                      ) : (
                        <Copy size={18} />
                      )
                    }
                    label={copiedText === "sub" ? t("copied") : t("linkPanel")}
                    onClick={() => copyText(primarySubUrl, "sub")}
                    active={copiedText === "sub"}
                  />
                  <MainActionBtn
                    icon={<QrCode size={18} />}
                    label={t("qrCode")}
                    onClick={() => openQR(primarySubUrl)}
                  />
                </div>
              </div>
            </div>

            {nodes && nodes.length > 0 && (
              <div className="space-y-4 pt-4">
                <h3 className={`mb-4 text-lg font-bold ${ts.heading}`}>{t("configs")}</h3>
                <div className="flex flex-col gap-3">
                  {nodes.map((node: any, idx: number) => (
                    <div
                      key={idx}
                      className={`flex flex-col gap-4 border p-4 shadow-lg transition-colors sm:flex-row sm:items-center ${ts.card} ${ts.roundedLg} ${ts.cardHover}`}
                    >
                      <div className="flex shrink-0 gap-2">
                        <span className="rounded-lg bg-blue-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-400">
                          {node.protocol}
                        </span>
                      </div>
                      <div className={`flex-1 truncate text-base font-medium ${ts.text}`}>
                        {node.tag}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          onClick={() => copyText(node.link, "node_" + idx)}
                          className="rounded-xl bg-zinc-800 p-2.5 text-zinc-300 transition-colors hover:bg-zinc-700"
                        >
                          {copiedText === "node_" + idx ? (
                            <Check size={16} className={ts.accent} />
                          ) : (
                            <Copy size={16} />
                          )}
                        </button>
                        <button
                          onClick={() => openQR(node.link)}
                          className="rounded-xl bg-zinc-800 p-2.5 text-zinc-300 transition-colors hover:bg-zinc-700"
                        >
                          <QrCode size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-6"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-1 rounded-full bg-blue-500" />
              <h2 className={`text-2xl font-bold ${ts.heading}`}>{t("connect")}</h2>
            </div>

            <div className={`space-y-4 border p-6 shadow-xl ${ts.card} ${ts.roundedLg}`}>
              {outputType !== "subscription" ? (
                <PortalConnectionPanel
                  output={connectionOutput}
                  portalSettings={portalSettings}
                />
              ) : (
                <>
                  <p className="mb-4 text-sm text-zinc-400">{t("importHint")}</p>
                  {portalSettings?.allowDirectImport !== false ? (
                  <button
                    onClick={() => setImportSheet(true)}
                    className={`flex w-full items-center justify-center gap-3 rounded-xl bg-emerald-600 py-4 font-bold shadow-lg shadow-emerald-600/20 transition-colors hover:bg-emerald-500 ${ts.heading}`}
                  >
                    <MonitorSmartphone size={20} /> {t("importApp")}
                  </button>
                  ) : null}

                  <div className="mt-4 border-t border-zinc-800/80 pt-4">
                    <div className={`mb-3 text-xs font-bold uppercase tracking-widest ${ts.muted}`}>
                      {t("nativeSub")}
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex-1 truncate rounded-lg border border-zinc-800 bg-zinc-900 p-2.5 font-mono text-xs ${ts.muted}`}
                      >
                        {nativeUrl}
                      </div>
                      <button
                        onClick={() => copyText(nativeUrl, "panel")}
                        className="rounded-lg bg-zinc-800 px-3 py-2.5 text-xs font-semibold text-zinc-300 transition-colors hover:bg-zinc-700"
                        title={t("linkNative")}
                        aria-label={t("linkNative")}
                      >
                        {copiedText === "panel" ? (
                          <span className={`inline-flex items-center gap-1.5 ${ts.accent}`}>
                            <Check size={14} />
                            {t("copied")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            <Copy size={14} />
                            {t("linkNative")}
                          </span>
                        )}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      {portalSettings?.showSupportSection !== false && (
        <div className={`flex justify-center gap-6 border-t border-zinc-800/50 py-8 md:hidden ${ts.bg}`}>
          {portalSettings?.showTelegram && (
            <a href={normalizeTelegramHref(portalSettings.telegramLink) || "#"} className={`${ts.muted} hover:text-blue-400`}>
              <MessageCircle size={24} />
            </a>
          )}
          {portalSettings?.showWhatsApp && (
            <a href={portalSettings.whatsappLink} className={`${ts.muted} hover:${ts.accent}`}>
              <Phone size={24} />
            </a>
          )}
          {portalSettings?.showWebsite && (
            <a href={portalSettings.websiteUrl} className={`${ts.muted} hover:text-purple-400`}>
              <Globe size={24} />
            </a>
          )}
          {portalSettings?.showEmail && (
            <a
              href={`mailto:${portalSettings.emailAddress}`}
              className={`${ts.muted} hover:text-amber-400`}
            >
              <Mail size={24} />
            </a>
          )}
        </div>
      )}

      <AnimatePresence>
        {qrModal && (
          <ModalWrapper onClose={() => setQrModal(false)}>
            <div className={`flex flex-col ${ts.cardBg}`}>
              <div className="flex items-center justify-between border-b border-zinc-800/80 bg-[#16171e] p-5">
                <h3 className={`text-lg font-bold ${ts.heading}`}>{t("scanQr")}</h3>
                <button
                  onClick={() => setQrModal(false)}
                  className="rounded-full bg-zinc-800 p-1.5 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="flex flex-col items-center p-8">
                <div className="mb-8 rounded-3xl bg-white p-5 shadow-2xl shadow-black ring-4 ring-white/10">
                  <QRCodeCanvas id="qr-canvas" value={urlForQR} size={240} level="M" />
                </div>
                <button
                  onClick={() => {
                    const canvas = document.getElementById("qr-canvas") as HTMLCanvasElement;
                    if (canvas) {
                      const link = document.createElement("a");
                      link.download = `Subscription_QR.png`;
                      link.href = canvas.toDataURL("image/png");
                      link.click();
                    }
                  }}
                  className={`flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-4 font-bold shadow-lg shadow-emerald-600/20 transition-colors hover:bg-emerald-500 ${ts.heading}`}
                >
                  <Download size={20} /> {t("saveQr")}
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {importSheet && portalSettings?.allowDirectImport !== false ? (
          <ClientAppsSheet
            open={importSheet}
            onClose={() => setImportSheet(false)}
            systemUrl={primarySubUrl}
            brandName={brandName}
            title={t("importApp")}
            cancelLabel={t("cancel")}
            downloadLabel={t("download")}
            addLabel={t("addToApp")}
            subtitle={t("importPick")}
            panelClassName={`${ts.cardBg} text-inherit`}
          />
        ) : null}
      </AnimatePresence>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
      `,
        }}
      />
    </div>
  );
}

function HeaderAction({ icon, href }: { icon: React.ReactNode; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="rounded-lg border border-zinc-700/50 bg-zinc-800/50 p-2 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-white"
    >
      {icon}
    </a>
  );
}

function MainActionBtn({
  icon,
  label,
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl border px-4 py-3 transition-colors ${
        active
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
      }`}
    >
      {icon}{" "}
      <span className="hidden text-sm font-bold sm:inline">{label}</span>
    </button>
  );
}

function ModalWrapper({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={onClose}
      />
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="relative w-full max-w-sm overflow-hidden rounded-[2rem] border border-zinc-800 shadow-2xl shadow-black"
      >
        {children}
      </motion.div>
    </div>
  );
}

