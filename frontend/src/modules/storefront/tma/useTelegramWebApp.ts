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

const SCRIPT_SRC = "https://telegram.org/js/telegram-web-app.js";

export function loadTelegramScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.Telegram?.WebApp) return Promise.resolve();
  const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
  if (existing) {
    return new Promise((resolve) => {
      existing.addEventListener("load", () => resolve());
      if (window.Telegram?.WebApp) resolve();
      window.setTimeout(() => resolve(), 300);
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Telegram WebApp SDK"));
    document.head.appendChild(script);
  });
}

export function applyTelegramFullscreen(wa?: TelegramWebApp | null) {
  if (!wa) return;
  try {
    wa.ready();
    wa.expand();
    try {
      wa.requestFullscreen?.();
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
    const h = wa.viewportStableHeight || wa.viewportHeight;
    if (h) {
      document.documentElement.style.setProperty("--tg-viewport-stable-height", `${h}px`);
      document.documentElement.style.setProperty("--tg-viewport-height", `${h}px`);
      document.documentElement.style.height = "100%";
      document.body.style.minHeight = `${h}px`;
      document.body.style.height = "100%";
    }
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

export function isTelegramContext() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("tg") === "1") return true;
  if (isTelegramUserAgent()) return true;
  const wa = window.Telegram?.WebApp;
  return Boolean(wa && (wa.initData || wa.initDataUnsafe?.user));
}

/** True when we must never show web token login (force Mini App / silent TG auth). */
export function forceTelegramMiniApp() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("tg") === "1" || isTelegramContext();
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
