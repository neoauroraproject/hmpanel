"use client";

import { useEffect } from "react";
import {
  Globe,
  Mail,
  MessageCircle,
  Phone,
} from "lucide-react";
import { LanguageSwitcher, StorefrontLocaleProvider, useStorefrontLocale } from "./locale";
import { StorefrontThemeProvider, StorefrontThemeToggle, useStorefrontTheme } from "./design";
import { resolveStorefrontCopy } from "./copy";
import {
  defaultPrimaryForSkin,
  resolveStorefrontLayout,
  resolveStorefrontSkin,
  sanitizeThemeCss,
  skinChrome,
  SKIN_FONT_HREF,
  type StorefrontLayoutId,
  type StorefrontSkinId,
} from "./skins";
import { normalizeTelegramLink } from "@/lib/telegram-link";
import type { StorefrontStore } from "./types";
import "./store-skins.css";

export function StoreShell({
  store,
  children,
  topBar,
}: {
  store?: StorefrontStore;
  children: React.ReactNode;
  topBar?: React.ReactNode;
}) {
  const brandingPrimary = store?.branding?.primaryColor || "";
  const settings = store?.publishedTheme?.settings;
  const skin = resolveStorefrontSkin(settings);
  const layout = resolveStorefrontLayout(settings);
  const chrome = skinChrome(skin, layout);
  const primaryColor = brandingPrimary || defaultPrimaryForSkin(skin);
  const accentColor = store?.branding?.accentColor || primaryColor;

  return (
    <StorefrontLocaleProvider store={store}>
      <StorefrontThemeProvider>
        <StoreShellInner
          store={store}
          primaryColor={primaryColor}
          accentColor={accentColor}
          chrome={chrome}
          skin={skin}
          topBar={topBar}
        >
          {children}
        </StoreShellInner>
      </StorefrontThemeProvider>
    </StorefrontLocaleProvider>
  );
}

function StoreShellInner({
  store,
  primaryColor,
  accentColor,
  chrome,
  skin,
  topBar,
  children,
}: {
  store?: StorefrontStore;
  primaryColor: string;
  accentColor: string;
  chrome: ReturnType<typeof skinChrome>;
  skin: StorefrontSkinId;
  topBar?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { isFa } = useStorefrontLocale();
  useStorefrontTheme();
  const copy = resolveStorefrontCopy(store?.publishedTheme?.settings, isFa);
  const logoLight = store?.logoUrl || store?.branding?.logo || null;
  const logoDark = store?.logoDarkUrl || store?.branding?.logoDark || null;
  const title = store?.branding?.name || store?.title || "Store";
  const layout: StorefrontLayoutId = chrome.layout || "classic";
  const themed = skin !== "default";
  const customCss = sanitizeThemeCss(
    store?.publishedTheme?.settings && typeof store.publishedTheme.settings === "object"
      ? (store.publishedTheme.settings as { customCss?: string }).customCss
      : "",
  );

  useEffect(() => {
    if (skin === "default" || typeof document === "undefined") return;
    const id = `store-font-${skin}`;
    if (document.getElementById(id)) return;
    const href = SKIN_FONT_HREF[skin as Exclude<StorefrontSkinId, "default">];
    if (!href) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }, [skin]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (chrome.forceDark) root.classList.add("dark");
    else if (skin === "pulse") root.classList.add("dark");
  }, [chrome.forceDark, skin]);

  const extraVars =
    store?.publishedTheme?.settings &&
    typeof store.publishedTheme.settings === "object" &&
    (store.publishedTheme.settings as { cssVars?: Record<string, string> }).cssVars &&
    typeof (store.publishedTheme.settings as { cssVars?: Record<string, string> }).cssVars ===
      "object"
      ? (store.publishedTheme.settings as { cssVars: Record<string, string> }).cssVars
      : {};

  const cssVars = {
    ["--store-primary" as string]: primaryColor,
    ["--store-accent" as string]: accentColor,
    ...chrome.style,
    ...extraVars,
    fontFamily:
      chrome.style["--store-font"] ||
      (isFa ? '"Vazirmatn", Tahoma, sans-serif' : "ui-sans-serif, system-ui, sans-serif"),
    paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px), var(--tg-safe-top, 0px))",
    paddingBottom: "max(0px, env(safe-area-inset-bottom, 0px), var(--tg-safe-bottom, 0px))",
  };

  const brandMark = <StoreBrandMark logoLight={logoLight} logoDark={logoDark} title={title} />;

  if (layout === "split" || skin === "lumen") {
    return (
      <div
        className={`store-shell ${chrome.rootClass} min-h-[100dvh] ${
          themed ? "bg-[color:var(--store-bg)] text-[color:var(--store-fg)]" : ""
        } ${isFa ? "font-[Vazirmatn,Tahoma,sans-serif]" : ""} ${chrome.forceDark ? "dark" : ""}`}
        data-store-layout={layout}
        data-store-skin={skin}
        style={cssVars}
      >
        {customCss ? <style dangerouslySetInnerHTML={{ __html: customCss }} /> : null}
        <div className="lg:grid lg:min-h-[100dvh] lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]">
          <aside className="relative z-20 border-b border-[color:var(--store-panel-border)] px-5 py-5 lg:border-b-0 lg:border-e lg:px-7 lg:py-8">
            <div className="flex items-center gap-3">
              {brandMark}
              <div className="min-w-0">
                <div className="truncate text-[17px] font-bold tracking-tight [font-family:var(--store-display,inherit)]">
                  {title}
                </div>
                {topBar ? <div className="mt-0.5 truncate text-[12px] text-[color:var(--store-muted)]">{topBar}</div> : null}
              </div>
            </div>
            {store?.branding?.description || store?.description ? (
              <p className="mt-5 max-w-sm whitespace-pre-line text-[14px] leading-relaxed text-[color:var(--store-muted)]">
                {store?.branding?.description || store?.description}
              </p>
            ) : (
              <p className="mt-5 max-w-sm text-[14px] leading-relaxed text-[color:var(--store-muted)]">
                {copy.subhead}
              </p>
            )}
            <LumenContactColumn store={store} copy={copy} />
            <div className="mt-8 hidden items-center gap-2 lg:flex">
              {chrome.forceDark ? null : <StorefrontThemeToggle />}
              <LanguageSwitcher className="!h-11 !rounded-2xl !shadow-none" />
            </div>
          </aside>
          <div className="relative min-w-0">
            <header className="sticky top-0 z-40 flex items-center justify-end gap-2 px-4 py-3 sm:px-6 lg:hidden">
              {chrome.forceDark ? null : <StorefrontThemeToggle />}
              <LanguageSwitcher className="!h-11 !rounded-2xl !shadow-none" />
            </header>
            <main className="relative mx-auto w-full max-w-4xl px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-2 sm:px-8 lg:px-10 lg:pb-16 lg:pt-8">
              {children}
              <StoreFooter note={store?.branding?.footerText || copy.footerNote} />
            </main>
          </div>
        </div>
      </div>
    );
  }

  const headerInner =
    layout === "market"
      ? "mx-auto flex max-w-xl items-center gap-3 border-b border-[color:var(--store-panel-border)] bg-[color:var(--store-panel)] px-4 py-2.5 sm:max-w-lg lg:max-w-xl"
      : layout === "funnel"
        ? "mx-auto flex max-w-5xl items-center gap-3 rounded-[1.4rem] border border-white/50 bg-white/80 px-4 py-2.5 shadow-[0_16px_50px_-28px_rgba(15,23,42,0.45)] backdrop-blur-xl"
        : `mx-auto flex max-w-5xl items-center gap-3 px-3 py-2.5 backdrop-blur-2xl lg:px-4 ${
            skin === "atelier"
              ? "rounded-[var(--store-radius)] border border-[color:var(--store-panel-border)] bg-[color:var(--store-panel)]/90 shadow-[0_10px_36px_-22px_rgba(15,23,42,0.35)]"
              : "rounded-[1.5rem] border border-black/[0.05] bg-white/80 shadow-[0_8px_30px_-18px_rgba(15,23,42,0.35)] dark:border-white/[0.08] dark:bg-zinc-950/75"
          }`;

  return (
    <div
      className={`store-shell ${chrome.rootClass} min-h-[100dvh] ${
        themed
          ? "text-[color:var(--store-fg)]"
          : "bg-[#F5F5F7] text-[#1D1D1F] dark:bg-[#0B0B0F] dark:text-zinc-50"
      } ${isFa ? "font-[Vazirmatn,Tahoma,sans-serif]" : ""} ${chrome.forceDark ? "dark" : ""}`}
      data-store-layout={layout}
      data-store-skin={skin}
      style={cssVars}
    >
      {customCss ? <style dangerouslySetInnerHTML={{ __html: customCss }} /> : null}
      {layout === "funnel" ? null : (
        <div
          aria-hidden
          className={`pointer-events-none fixed inset-x-0 top-0 opacity-90 ${
            layout === "market" ? "h-[28rem]" : "h-72"
          }`}
          style={{
            background:
              skin === "pulse"
                ? `radial-gradient(ellipse 80% 55% at 50% -8%, color-mix(in srgb, ${primaryColor} 38%, transparent), transparent 62%), radial-gradient(ellipse 40% 30% at 100% 0%, rgba(16,185,129,0.12), transparent 50%)`
                : `radial-gradient(ellipse 90% 70% at 80% -30%, color-mix(in srgb, ${primaryColor} 22%, transparent), transparent 60%)`,
          }}
        />
      )}

      <header className={layout === "market" ? "sticky top-0 z-40" : "sticky top-0 z-40 px-3 pt-1 sm:px-4"}>
        <div className={headerInner}>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {brandMark}
            <div className="min-w-0">
              <div className="truncate text-[16px] font-bold leading-tight tracking-tight [font-family:var(--store-display,inherit)]">
                {title}
              </div>
              {topBar ? <div className="mt-0.5 truncate text-[12px] text-[color:var(--store-muted)]">{topBar}</div> : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {chrome.forceDark ? null : <StorefrontThemeToggle />}
            <LanguageSwitcher className="!h-11 !rounded-2xl !shadow-none" />
          </div>
        </div>
      </header>

      <main
        className={`relative mx-auto w-full px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 lg:px-8 lg:pb-16 lg:pt-6 ${
          layout === "market" ? "max-w-lg sm:max-w-lg lg:max-w-xl" : layout === "funnel" ? "max-w-5xl" : "max-w-5xl"
        }`}
      >
        {children}
        <StoreFooter note={store?.branding?.footerText || copy.footerNote} />
      </main>
    </div>
  );
}

function StoreBrandMark({
  logoLight,
  logoDark,
  title,
}: {
  logoLight: string | null;
  logoDark: string | null;
  title: string;
}) {
  if (logoLight || logoDark) {
    return (
      <span className="relative h-11 w-11 shrink-0">
        {logoLight ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoLight}
            alt=""
            className={`absolute inset-0 h-11 w-11 rounded-[1.05rem] object-cover shadow-sm transition-opacity duration-300 ${
              logoDark ? "opacity-100 dark:opacity-0" : "opacity-100"
            }`}
          />
        ) : null}
        {logoDark ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoDark}
            alt=""
            className={`absolute inset-0 h-11 w-11 rounded-[1.05rem] object-cover shadow-sm transition-opacity duration-300 ${
              logoLight ? "opacity-0 dark:opacity-100" : "opacity-100"
            }`}
          />
        ) : null}
      </span>
    );
  }
  return (
    <div
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[1.05rem] text-base font-black text-white shadow-sm"
      style={{ background: "var(--store-primary)" }}
    >
      {title.slice(0, 1)}
    </div>
  );
}

function StoreFooter({ note }: { note?: string }) {
  if (!note) return null;
  return (
    <p className="mx-auto mt-10 max-w-lg text-center text-[13px] leading-relaxed text-[color:var(--store-muted)]">
      {note}
    </p>
  );
}

function LumenContactColumn({
  store,
  copy,
}: {
  store?: StorefrontStore;
  copy: ReturnType<typeof resolveStorefrontCopy>;
}) {
  const links = normalizeSupportLinks(store?.branding?.supportLinks);
  if (!links.length) return null;
  return (
    <div className="mt-8 space-y-5">
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noreferrer"
          className="store-focus-ring group flex cursor-pointer items-start gap-3 rounded-xl p-1 text-start transition duration-200 hover:bg-slate-50"
        >
          <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500">
            <link.icon size={16} />
          </span>
          <span>
            <span className="block text-[13px] font-semibold text-slate-900">
              {link.kind === "telegram" || link.kind === "whatsapp"
                ? copy.chatLabel
                : link.kind === "website"
                  ? copy.officeLabel
                  : copy.phoneLabel}
            </span>
            <span className="mt-0.5 block text-[13px] text-slate-500 underline-offset-2 group-hover:underline">
              {link.label}
            </span>
          </span>
        </a>
      ))}
    </div>
  );
}

type SupportLinks = {
  showTelegram?: boolean | string;
  telegramLink?: string;
  showWhatsApp?: boolean | string;
  whatsappLink?: string;
  showWebsite?: boolean | string;
  websiteUrl?: string;
  showEmail?: boolean | string;
  emailAddress?: string;
} | null | undefined;

export function StoreSupportChips({ supportLinks }: { supportLinks?: SupportLinks }) {
  const links = normalizeSupportLinks(supportLinks);
  if (!links.length) return null;
  return (
    <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noreferrer"
          className="store-focus-ring inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-[color:var(--store-panel-border)] bg-[color:var(--store-panel)] px-4 py-2 text-sm text-[color:var(--store-muted)] transition duration-200 hover:border-[color:var(--store-primary)] hover:text-[color:var(--store-fg)]"
        >
          <link.icon size={15} />
          {link.label}
        </a>
      ))}
    </div>
  );
}

function normalizeSupportLinks(supportLinks: SupportLinks) {
  const data = supportLinks || {};
  const isOn = (value: unknown) => value === true || value === "true" || value === 1;
  const items: Array<{
    label: string;
    href: string;
    icon: typeof MessageCircle;
    kind: "telegram" | "whatsapp" | "website" | "email";
  }> = [];

  if (isOn(data.showTelegram) && data.telegramLink) {
    const tg = normalizeTelegramLink(data.telegramLink);
    if (tg) items.push({ label: "Telegram", href: tg, icon: MessageCircle, kind: "telegram" });
  }
  if (isOn(data.showWhatsApp) && data.whatsappLink) {
    items.push({ label: "WhatsApp", href: data.whatsappLink, icon: Phone, kind: "whatsapp" });
  }
  if (isOn(data.showWebsite) && data.websiteUrl) {
    items.push({ label: "Website", href: data.websiteUrl, icon: Globe, kind: "website" });
  }
  if (isOn(data.showEmail) && data.emailAddress) {
    items.push({
      label: "Email",
      href: data.emailAddress.startsWith("mailto:") ? data.emailAddress : `mailto:${data.emailAddress}`,
      icon: Mail,
      kind: "email",
    });
  }
  return items;
}
