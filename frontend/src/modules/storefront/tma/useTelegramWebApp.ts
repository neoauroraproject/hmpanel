"use client";

import { useCallback, useEffect, useState } from "react";

export type TelegramThemeParams = {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
  header_bg_color?: string;
};

export type TelegramWebAppUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
};

type TelegramWebApp = {
  initData: string;
  initDataUnsafe?: { user?: TelegramWebAppUser; start_param?: string };
  themeParams?: TelegramThemeParams;
  colorScheme?: "light" | "dark";
  platform?: string;
  isExpanded?: boolean;
  viewportHeight?: number;
  viewportStableHeight?: number;
  ready: () => void;
  expand: () => void;
  close: () => void;
  requestFullscreen?: () => void;
  exitFullscreen?: () => void;
  disableVerticalSwipes?: () => void;
  enableClosingConfirmation?: () => void;
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
    selectionChanged: () => void;
  };
  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  MainButton?: {
    text: string;
    show: () => void;
    hide: () => void;
    enable: () => void;
    disable: () => void;
    showProgress: (leaveActive?: boolean) => void;
    hideProgress: () => void;
    setText: (text: string) => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const CDN_SCRIPT_SRC = "https://telegram.org/js/telegram-web-app.js";
/** Optional self-hosted copy — put file at frontend/public/js/telegram-web-app.js if CDN is blocked. */
const LOCAL_SCRIPT_SRC = "/js/telegram-web-app.js";

function scriptCandidates(): string[] {
  // Prefer CDN (always present). Local only if previously injected / available.
  if (typeof document !== "undefined") {
    const localTag = document.querySelector(`script[src="${LOCAL_SCRIPT_SRC}"]`);
    if (localTag) return [LOCAL_SCRIPT_SRC, CDN_SCRIPT_SRC];
  }
  return [CDN_SCRIPT_SRC];
}

function injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      if (window.Telegram?.WebApp) {
        resolve();
        return;
      }
      const onLoad = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error(`Failed to load ${src}`));
      };
      const cleanup = () => {
        existing.removeEventListener("load", onLoad);
        existing.removeEventListener("error", onError);
      };
      existing.addEventListener("load", onLoad);
      existing.addEventListener("error", onError);
      // Already finished loading before listeners attached
      window.setTimeout(() => {
        if (window.Telegram?.WebApp) {
          cleanup();
          resolve();
        }
      }, 0);
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      reject(new Error(`Failed to load ${src}`));
    };
    document.head.appendChild(script);
  });
}

export function loadTelegramScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.Telegram?.WebApp) return Promise.resolve();

  const tryNext = async (index: number): Promise<void> => {
    const sources = scriptCandidates();
    if (index >= sources.length) {
      throw new Error("Failed to load Telegram WebApp SDK");
    }
    try {
      await injectScript(sources[index]);
      for (let i = 0; i < 30; i += 1) {
        if (window.Telegram?.WebApp) return;
        await new Promise((r) => window.setTimeout(r, 50));
      }
      if (window.Telegram?.WebApp) return;
      await tryNext(index + 1);
    } catch {
      await tryNext(index + 1);
    }
  };

  return tryNext(0);
}

/** Wait until Telegram populates signed initData (string required for backend HMAC). */
export function waitForTelegramInitData(opts?: {
  timeoutMs?: number;
  isCancelled?: () => boolean;
}): Promise<string> {
  const timeoutMs = opts?.timeoutMs ?? 5000;
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (opts?.isCancelled?.()) return;
      const wa = window.Telegram?.WebApp;
      if (wa) {
        try {
          wa.ready();
        } catch {
          /* ignore */
        }
        const data = wa.initData || "";
        if (data) {
          resolve(data);
          return;
        }
      }
      if (Date.now() - started >= timeoutMs) {
        reject(new Error("Open this Mini App from the store bot inside Telegram."));
        return;
      }
      window.setTimeout(tick, 100);
    };
    tick();
  });
}

/** Keep Mini App intent across client-side navigations. */
export function withTgQuery(path: string): string {
  if (!path) return path;
  if (typeof window === "undefined") return path;
  if (/[?&]tg=1(?:&|$)/.test(path)) return path;
  const keep =
    forceTelegramMiniApp() ||
    Boolean(window.Telegram?.WebApp?.initData) ||
    isTelegramUserAgent();
  if (!keep) return path;
  return path.includes("?") ? `${path}&tg=1` : `${path}?tg=1`;
}

/** Mobile Telegram clients only — desktop/web keep the compact Mini App size. */
export function isTelegramMobilePlatform(wa?: TelegramWebApp | null) {
  const platform = String(wa?.platform || "").toLowerCase();
  if (platform === "ios" || platform === "android" || platform === "android_x") return true;
  if (
    platform === "tdesktop" ||
    platform === "macos" ||
    platform === "web" ||
    platform === "weba" ||
    platform === "webk"
  ) {
    return false;
  }
  if (typeof window === "undefined") return false;
  // Fallback when platform missing: treat touch + narrow as mobile.
  return window.matchMedia?.("(pointer: coarse)").matches && window.innerWidth < 900;
}

export function applyTelegramFullscreen(wa?: TelegramWebApp | null) {
  if (!wa) return;
  try {
    wa.ready();
    wa.expand();
    const mobile = isTelegramMobilePlatform(wa);
    try {
      if (mobile) wa.requestFullscreen?.();
      else wa.exitFullscreen?.();
    } catch {
      /* older clients */
    }
    wa.disableVerticalSwipes?.();
    if (wa.themeParams?.bg_color && wa.setBackgroundColor) {
      wa.setBackgroundColor(wa.themeParams.bg_color);
    }
    if (wa.themeParams?.header_bg_color && wa.setHeaderColor) {
      wa.setHeaderColor(wa.themeParams.header_bg_color);
    }
    applyTelegramSafeArea(wa);
    const h = wa.viewportStableHeight || wa.viewportHeight;
    if (h) {
      document.documentElement.style.setProperty("--tg-viewport-stable-height", `${h}px`);
      document.documentElement.style.setProperty("--tg-viewport-height", `${h}px`);
      document.documentElement.style.height = "100%";
      document.body.style.minHeight = `${h}px`;
      document.body.style.height = "100%";
    }
    document.documentElement.dataset.tgPlatform = String(wa.platform || (mobile ? "mobile" : "desktop"));
  } catch {
    /* ignore */
  }
}

export function isTelegramWebAppPresent() {
  if (typeof window === "undefined") return false;
  return Boolean(window.Telegram?.WebApp);
}

export function isTelegramUserAgent() {
  if (typeof window === "undefined") return false;
  return /Telegram/i.test(window.navigator.userAgent || "");
}

/** True only when we have real Mini App session data (script stub alone is NOT enough). */
export function hasTelegramInitData() {
  if (typeof window === "undefined") return false;
  const wa = window.Telegram?.WebApp;
  return Boolean(wa && (wa.initData || wa.initDataUnsafe?.user?.id));
}

export function isTelegramContext() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  // ?tg=1 means bot Open button — treat as Mini App intent
  if (params.get("tg") === "1") return true;
  // Real in-app browser with init payload
  if (hasTelegramInitData()) return true;
  // Telegram UA alone is not enough (false positives / after script inject)
  return false;
}

/** True when URL forces Mini App (bot web_app). Browser without ?tg=1 must stay web. */
export function forceTelegramMiniApp() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("tg") === "1";
}

export function applyTelegramSafeArea(wa?: TelegramWebApp | null) {
  if (typeof window === "undefined") return;
  const anyWa = wa as TelegramWebApp & {
    safeAreaInset?: { top?: number; bottom?: number };
    contentSafeAreaInset?: { top?: number; bottom?: number };
  };
  const top = Math.max(
    Number(anyWa?.contentSafeAreaInset?.top || 0),
    Number(anyWa?.safeAreaInset?.top || 0),
  );
  const bottom = Math.max(
    Number(anyWa?.contentSafeAreaInset?.bottom || 0),
    Number(anyWa?.safeAreaInset?.bottom || 0),
  );
  // Fullscreen mobile Mini Apps need a floor so UI clears status bar / TG chrome.
  // Desktop Mini App stays compact — do not force large top padding.
  const mobile = isTelegramMobilePlatform(wa || window.Telegram?.WebApp || null);
  // iOS fullscreen + Telegram header (~44–56) + breathing room for store header card
  const topPad = Math.max(
    top,
    mobile && (isTelegramUserAgent() || forceTelegramMiniApp()) ? 88 : 0,
  );
  document.documentElement.style.setProperty("--tg-safe-top", `${topPad}px`);
  document.documentElement.style.setProperty("--tg-safe-bottom", `${bottom}px`);
}

export function useTelegramWebApp() {
  const [ready, setReady] = useState(false);
  const [webApp, setWebApp] = useState<TelegramWebApp | null>(null);

  useEffect(() => {
    let cancelled = false;
    let retries = 0;

    const boot = () => {
      if (cancelled) return;
      const wa = window.Telegram?.WebApp || null;
      if (wa) {
        applyTelegramFullscreen(wa);
        window.setTimeout(() => {
          if (!cancelled) applyTelegramFullscreen(wa);
        }, 250);
        window.setTimeout(() => {
          if (!cancelled) applyTelegramFullscreen(wa);
        }, 800);
        window.setTimeout(() => {
          if (!cancelled) applyTelegramFullscreen(wa);
        }, 1600);
        setWebApp(wa);
        setReady(true);
        return;
      }
      if (retries < 30) {
        retries += 1;
        window.setTimeout(boot, 100);
        return;
      }
      setReady(true);
    };

    loadTelegramScript()
      .then(boot)
      .catch(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const haptic = useCallback(
    (kind: "light" | "medium" | "success" | "error" | "selection" = "light") => {
      const hf = webApp?.HapticFeedback;
      if (!hf) return;
      try {
        if (kind === "success" || kind === "error") hf.notificationOccurred(kind);
        else if (kind === "selection") hf.selectionChanged();
        else hf.impactOccurred(kind);
      } catch {
        /* ignore */
      }
    },
    [webApp],
  );

  return {
    ready,
    webApp,
    initData: webApp?.initData || "",
    user: webApp?.initDataUnsafe?.user || null,
    theme: webApp?.themeParams || {},
    colorScheme: webApp?.colorScheme || "light",
    haptic,
  };
}
