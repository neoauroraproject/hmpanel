"use client";

import type { StorefrontStore } from "./types";

export type CheckoutPayMethod = "MANUAL_BANK" | "WALLET" | "TELEGRAM_STARS" | "TELEGRAM_WALLET";

export type StorefrontPayOption = {
  id: CheckoutPayMethod;
  catalogId: "manual_bank" | "wallet" | "telegram_stars" | "telegram_wallet";
};

export const WALLET_PAY_BUTTON_TEXT = "👛 Wallet Pay";

const CATALOG_TO_CHECKOUT: Record<string, CheckoutPayMethod> = {
  manual_bank: "MANUAL_BANK",
  wallet: "WALLET",
  telegram_stars: "TELEGRAM_STARS",
  telegram_wallet: "TELEGRAM_WALLET",
};

function catalogEnabled(
  payment: StorefrontStore["payment"] | null | undefined,
  catalogId: string,
  fallbackWhenEmpty: boolean,
) {
  const methods = payment?.methods;
  if (!Array.isArray(methods) || methods.length === 0) return fallbackWhenEmpty;
  return methods.some((m) => m.id === catalogId && m.enabled && m.available !== false);
}

export function detectTelegramUserId(): string | null {
  if (typeof window === "undefined") return null;
  const id = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  if (id == null) return null;
  const digits = String(id).replace(/\D/g, "");
  return digits || null;
}

export function storefrontPayOptions(
  payment: StorefrontStore["payment"] | null | undefined,
  opts?: { hasWalletSession?: boolean; hasTelegramUserId?: boolean },
): StorefrontPayOption[] {
  const hasCatalog = Array.isArray(payment?.methods) && payment!.methods!.length > 0;
  const out: StorefrontPayOption[] = [];
  if (catalogEnabled(payment, "manual_bank", !hasCatalog)) {
    out.push({ id: "MANUAL_BANK", catalogId: "manual_bank" });
  }
  if (opts?.hasWalletSession !== false && catalogEnabled(payment, "wallet", !hasCatalog)) {
    out.push({ id: "WALLET", catalogId: "wallet" });
  }
  if (catalogEnabled(payment, "telegram_stars", false)) {
    out.push({ id: "TELEGRAM_STARS", catalogId: "telegram_stars" });
  }
  if (opts?.hasTelegramUserId && catalogEnabled(payment, "telegram_wallet", false)) {
    out.push({ id: "TELEGRAM_WALLET", catalogId: "telegram_wallet" });
  }
  if (!out.length) out.push({ id: "MANUAL_BANK", catalogId: "manual_bank" });
  return out;
}

export function pickStorefrontPayMethod(
  payment: StorefrontStore["payment"] | null | undefined,
  opts?: { hasWalletSession?: boolean; hasTelegramUserId?: boolean },
  current?: string | null,
): CheckoutPayMethod {
  const options = storefrontPayOptions(payment, opts);
  const ids = options.map((o) => o.id);
  const currentId = String(current || "").toUpperCase() as CheckoutPayMethod;
  if (ids.includes(currentId)) return currentId;
  const preferred = CATALOG_TO_CHECKOUT[String(payment?.method || "").toLowerCase()];
  if (preferred && ids.includes(preferred)) return preferred;
  return ids[0] || "MANUAL_BANK";
}

export function isReceiptPayMethod(method?: string | null) {
  return String(method || "").toUpperCase() === "MANUAL_BANK";
}

export function isWalletPayMethod(method?: string | null) {
  return String(method || "").toUpperCase() === "TELEGRAM_WALLET";
}

export function openTelegramStarsInvoice(invoiceUrl?: string | null) {
  const url = String(invoiceUrl || "").trim();
  if (!url) return false;
  const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;
  const openInvoice = (tg as { openInvoice?: (u: string, cb?: (s: string) => void) => void } | undefined)
    ?.openInvoice;
  if (typeof openInvoice === "function") {
    openInvoice(url, () => undefined);
    return true;
  }
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}

/** Wallet Pay docs: Mini Apps must use openTelegramLink, not openLink. */
export function openWalletPayLink(payUrl?: string | null) {
  const url = String(payUrl || "").trim();
  if (!url) return false;
  const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;
  const openTelegramLink = (tg as { openTelegramLink?: (u: string) => void } | undefined)?.openTelegramLink;
  if (typeof openTelegramLink === "function") {
    openTelegramLink(url);
    return true;
  }
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}

export function openCheckoutPayUrl(invoiceUrl?: string | null, paymentMethod?: string | null) {
  if (isWalletPayMethod(paymentMethod) || /t\.me\/wallet/i.test(String(invoiceUrl || ""))) {
    return openWalletPayLink(invoiceUrl);
  }
  return openTelegramStarsInvoice(invoiceUrl);
}
