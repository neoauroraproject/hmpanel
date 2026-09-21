"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  CreditCard,
  MonitorSmartphone,
  Upload,
  Users,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { API_BASE } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { compressReceiptImage } from "@/modules/storefront/receipt-image";
import { ClientAppsSheet } from "./client-apps";
import {
  BrandMark,
  ConfigList,
  DualSubCopyButtons,
  LangToggle,
  PortalConnectionPanel,
  QrModal,
  usePortalModel,
  useThemeFont,
  type SubData,
} from "./portal-kit";

export type PaygSubPortalPayload = {
  payg: true;
  status: string;
  clientEnable: boolean;
  plan: {
    name: string;
    description?: string | null;
    billingMode: string;
    categoryName?: string | null;
    pricePerHour?: number | null;
    pricePerGb?: number | null;
    limitIp?: number | null;
    deviceLabel?: string | null;
    unitPriceExtra?: number | null;
  };
  wallet: { balance: number; currency: string; minWalletBalance: number };
  usage: {
    totalAmount: number;
    totalQuantity: number;
    entries: number;
    kind: string;
    trafficBytes?: number;
  };
  remaining: {
    hours: number | null;
    gb: number | null;
    low: boolean;
    empty: boolean;
    barPct: number;
  };
  branding: {
    name: string;
    logoUrl?: string | null;
    logoDarkUrl?: string | null;
    primaryColor?: string | null;
    telegramLink?: string | null;
  };
  telegram: { enabled: boolean; botUsername?: string | null; payUrl?: string | null };
  payment: {
    cards: Array<{
      bankName?: string;
      cardNumber?: string;
      cardHolder?: string;
      iban?: string;
      instructions?: string;
    }>;
  };
};

type ChargeStep = "amount" | "pay" | "receipt" | "done";

function trimNum(n: number, digits = 2) {
  if (!Number.isFinite(n)) return "0";
  const rounded = Number(n.toFixed(digits));
  return String(rounded);
}

function formatMoney(n: number, currency: string, isFa: boolean) {
  const toman = String(currency || "").toUpperCase() !== "USD";
  const value = Number(n) || 0;
  if (toman) {
    const num = new Intl.NumberFormat(isFa ? "fa-IR" : "en-US", {
      maximumFractionDigits: 0,
    }).format(value);
    return isFa ? `${num} تومان` : `${num} Toman`;
  }
  return `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)}`;
}

function formatRemain(payg: PaygSubPortalPayload, isFa: boolean) {
  const mode = String(payg.plan.billingMode || "").toUpperCase();
  if (mode === "VOLUME") {
    const gb = Number(payg.remaining.gb || 0);
    return isFa ? `${trimNum(gb)} گیگ` : `${trimNum(gb)} GB`;
  }
  const hours = Number(payg.remaining.hours || 0);
  if (hours >= 48) {
    const d = Math.floor(hours / 24);
    const h = Math.round(hours - d * 24);
    return isFa ? `${d} روز و ${h} ساعت` : `${d}d ${h}h`;
  }
  return isFa ? `${trimNum(hours, 1)} ساعت` : `${trimNum(hours, 1)} hours`;
}

function isGenericDeviceLabel(label: string) {
  return /^(1 user|\d+\s*users)$/i.test(label.trim());
}

function formatDevices(
  count: number,
  label: string | null | undefined,
  isFa: boolean,
) {
  const custom = String(label || "").trim();
  if (custom && !isGenericDeviceLabel(custom)) return custom;
  if (!(count > 0)) return isFa ? "کاربر نامحدود" : "Unlimited users";
  if (count === 1) return isFa ? "تک‌کاربره" : "1 user";
  if (count === 2) return isFa ? "دو کاربره" : "2 users";
  return isFa ? `${count} کاربره` : `${count} users`;
}

function suggestAmounts(payg: PaygSubPortalPayload): number[] {
  const mode = String(payg.plan.billingMode || "").toUpperCase();
  const toman = String(payg.wallet.currency || "").toUpperCase() !== "USD";
  const rate =
    mode === "VOLUME" ? Number(payg.plan.pricePerGb || 0) : Number(payg.plan.pricePerHour || 0);
  const units = mode === "VOLUME" ? [5, 10, 25] : [24, 168, 720];
  const fromRate = rate > 0 ? units.map((u) => Math.max(1, Math.round(rate * u))) : [];
  const fallback = toman ? [50_000, 100_000, 200_000] : [5, 10, 20];
  return [...new Set((fromRate.length ? fromRate : fallback).filter((n) => n > 0))].slice(0, 4);
}

function mergePaygBrand(data: SubData, payg: PaygSubPortalPayload): SubData {
  return {
    ...data,
    portalSettings: {
      ...data.portalSettings,
      portalName: payg.branding.name || data.portalSettings?.portalName,
      logoUrl: payg.branding.logoUrl || data.portalSettings?.logoUrl,
      logoDarkUrl: payg.branding.logoDarkUrl || data.portalSettings?.logoDarkUrl,
      primaryColor: payg.branding.primaryColor || data.portalSettings?.primaryColor,
      telegramLink: payg.branding.telegramLink || data.portalSettings?.telegramLink,
    },
  };
}

function ExpandCard({
  title,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="mb-3 overflow-hidden rounded-[28px] bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 px-5 py-4 text-start outline-none transition-colors duration-200 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-900/15"
      >
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          {badge}
        </div>
        <ChevronDown
          size={18}
          className={`shrink-0 text-zinc-400 motion-safe:transition-transform motion-safe:duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? <div className="px-5 pb-5">{children}</div> : null}
    </section>
  );
}

function DeviceChip({ label, dark = false }: { label: string; dark?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
        dark ? "bg-white/12 text-white" : "bg-zinc-950 text-white"
      }`}
    >
      <Users size={13} />
      {label}
    </span>
  );
}

function UsageMeter({
  pct,
  accent,
  remainLabel,
  usedLabel,
  remainCaption,
  usedCaption,
  low,
}: {
  pct: number;
  accent: string;
  remainLabel: string;
  usedLabel: string;
  remainCaption: string;
  usedCaption: string;
  low: boolean;
}) {
  const remainPct = Math.max(0, Math.min(100, pct));
  return (
    <div className="space-y-3">
      <div
        className="relative h-24 overflow-hidden rounded-[28px] bg-zinc-950 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(remainPct)}
        aria-label={`${remainCaption} ${remainLabel}`}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-35"
          style={{
            backgroundImage:
              "repeating-linear-gradient(115deg, transparent 0 12px, rgba(255,255,255,0.05) 12px 13px)",
          }}
        />
        {[25, 50, 75].map((tick) => (
          <div
            key={tick}
            className="pointer-events-none absolute top-4 bottom-4 w-px bg-white/10"
            style={{ insetInlineStart: `${tick}%` }}
          />
        ))}
        <div
          className="relative h-full overflow-hidden rounded-[20px] motion-safe:transition-[width] motion-safe:duration-500 motion-reduce:transition-none"
          style={{
            width: `${remainPct}%`,
            background: `linear-gradient(90deg, ${accent} 0%, color-mix(in srgb, ${accent} 82%, white) 100%)`,
            boxShadow: low ? "0 0 32px rgba(245, 158, 11, 0.4)" : `0 0 36px ${accent}73`,
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-white/40 via-white/5 to-black/15" />
          {remainPct >= 16 ? (
            <div className="absolute end-2 top-1/2 z-10 flex h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 px-2.5 text-xs font-bold tabular-nums text-zinc-950 shadow-lg">
              {Math.round(remainPct)}%
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex items-end justify-between gap-3 text-sm">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">{remainCaption}</div>
          <div className="text-base font-semibold tabular-nums">{remainLabel}</div>
        </div>
        {remainPct < 16 ? (
          <div className="text-xs font-semibold tabular-nums text-zinc-500">{Math.round(remainPct)}%</div>
        ) : null}
        <div className="text-end">
          <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">{usedCaption}</div>
          <div className="text-base font-semibold tabular-nums">{usedLabel}</div>
        </div>
      </div>
    </div>
  );
}

function ChargeWalletModal({
  open,
  onClose,
  payg,
  isFa,
  tf,
  amount,
  setAmount,
  receiptText,
  setReceiptText,
  receiptImage,
  setReceiptImage,
  formError,
  setFormError,
  formOk,
  copiedCard,
  copyCard,
  canSubmit,
  depositPending,
  onSubmit,
  step,
  setStep,
}: {
  open: boolean;
  onClose: () => void;
  payg: PaygSubPortalPayload;
  isFa: boolean;
  tf: (fa: string, en: string) => string;
  amount: string;
  setAmount: (v: string) => void;
  receiptText: string;
  setReceiptText: (v: string) => void;
  receiptImage: string;
  setReceiptImage: (v: string) => void;
  formError: string;
  setFormError: (v: string) => void;
  formOk: string;
  copiedCard: string | null;
  copyCard: (value: string, key: string) => void;
  canSubmit: boolean;
  depositPending: boolean;
  onSubmit: () => void;
  step: ChargeStep;
  setStep: (s: ChargeStep) => void;
}) {
  const amountId = useId();
  const receiptId = useId();
  const hasCards = payg.payment.cards.length > 0;
  const presets = useMemo(() => suggestAmounts(payg), [payg]);
  const currency = payg.wallet.currency;

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const goNextFromAmount = () => {
    if (!(Number(amount) > 0)) return;
    setStep(hasCards ? "pay" : "receipt");
  };

  const steps: ChargeStep[] = hasCards ? ["amount", "pay", "receipt"] : ["amount", "receipt"];
  const stepIndex = Math.max(0, steps.indexOf(step === "done" ? "receipt" : step));

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 cursor-pointer bg-zinc-950/55 backdrop-blur-md"
        onClick={onClose}
        aria-label={tf("بستن", "Close")}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="payg-charge-title"
        className="relative z-10 flex max-h-[min(92dvh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] border border-white/40 bg-white shadow-2xl sm:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 shrink-0 border-b border-zinc-100 bg-white/90 px-5 pb-3 pt-4 backdrop-blur-xl">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 id="payg-charge-title" className="text-lg font-semibold">
                {tf("شارژ کیف پول", "Top up wallet")}
              </h2>
              <p className="mt-0.5 text-sm text-zinc-500">
                {step === "done"
                  ? tf("درخواست ثبت شد", "Request submitted")
                  : step === "pay"
                    ? tf("کارت را کپی کنید و واریز کنید", "Copy the card and pay")
                    : step === "receipt"
                      ? tf("رسید را بفرستید تا تأیید شود", "Send the receipt for approval")
                      : tf("اول مبلغ را وارد کنید", "Enter the amount first")}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-zinc-400 transition-colors duration-200 hover:bg-zinc-100 hover:text-zinc-800 focus-visible:ring-2 focus-visible:ring-zinc-900/15"
              aria-label={tf("بستن", "Close")}
            >
              <X size={18} />
            </button>
          </div>
          {step !== "done" ? (
            <div className="flex gap-1.5">
              {steps.map((s, i) => (
                <div
                  key={s}
                  className={`h-1.5 flex-1 rounded-full ${i <= stepIndex ? "bg-zinc-950" : "bg-zinc-200"}`}
                />
              ))}
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-5 py-4 [-webkit-overflow-scrolling:touch]">
          {payg.telegram.payUrl && step === "amount" ? (
            <>
              <a
                href={payg.telegram.payUrl}
                className="mb-4 flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-2xl bg-[#229ED9] px-4 py-3 text-sm font-semibold text-white transition-opacity duration-200 hover:opacity-95"
              >
                <span>{tf("ادامه پرداخت در تلگرام", "Continue payment in Telegram")}</span>
                <ArrowUpRight size={16} />
              </a>
              <div className="relative mb-4 text-center text-xs text-zinc-400">
                <span className="relative z-10 bg-white px-2">
                  {tf("یا همین‌جا شارژ کنید", "Or top up here")}
                </span>
              </div>
            </>
          ) : null}

          {step === "amount" ? (
            <div className="space-y-4">
              <label htmlFor={amountId} className="block space-y-1.5">
                <span className="text-sm font-medium">{tf("مبلغ شارژ", "Charge amount")}</span>
                <input
                  id={amountId}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                  placeholder={formatMoney(0, currency, isFa)}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3.5 text-base outline-none transition-colors duration-200 focus:border-zinc-400 focus-visible:ring-2 focus-visible:ring-zinc-900/10"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                {presets.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setAmount(String(value))}
                    className={`min-h-11 cursor-pointer rounded-full px-3.5 text-sm font-medium transition-colors duration-200 ${
                      Number(amount) === value
                        ? "bg-zinc-950 text-white"
                        : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                    }`}
                  >
                    {formatMoney(value, currency, isFa)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {step === "pay" ? (
            <div className="space-y-3">
              <p className="text-sm text-zinc-600">
                {tf(
                  `مبلغ ${formatMoney(Number(amount) || 0, currency, isFa)} را به یکی از کارت‌ها واریز کنید.`,
                  `Pay ${formatMoney(Number(amount) || 0, currency, false)} to one of the cards below.`,
                )}
              </p>
              {payg.payment.cards.map((card, idx) => (
                <div key={`${card.cardNumber}-${idx}`} className="rounded-2xl bg-zinc-50 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{card.bankName || tf("کارت بانکی", "Bank card")}</div>
                      {card.cardHolder ? <div className="text-xs text-zinc-500">{card.cardHolder}</div> : null}
                    </div>
                    <CreditCard size={16} className="mt-0.5 text-zinc-400" />
                  </div>
                  {card.cardNumber ? (
                    <button
                      type="button"
                      onClick={() => copyCard(card.cardNumber || "", `card-${idx}`)}
                      className="mt-2 inline-flex min-h-11 cursor-pointer items-center gap-1.5 font-mono text-sm"
                    >
                      {copiedCard === `card-${idx}` ? (
                        <>
                          <Check size={14} /> {tf("کپی شد", "Copied")}
                        </>
                      ) : (
                        <>
                          {card.cardNumber} <Copy size={12} />
                        </>
                      )}
                    </button>
                  ) : null}
                  {card.iban ? <div className="text-xs text-zinc-500">{card.iban}</div> : null}
                  {card.instructions ? (
                    <div className="mt-2 text-xs leading-5 text-zinc-500">{card.instructions}</div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {step === "receipt" ? (
            <div className="space-y-3">
              <label htmlFor={receiptId} className="block space-y-1.5">
                <span className="text-sm font-medium">{tf("متن رسید", "Receipt note")}</span>
                <input
                  id={receiptId}
                  value={receiptText}
                  onChange={(e) => setReceiptText(e.target.value)}
                  placeholder={tf("شماره پیگیری یا توضیح", "Tracking code or note")}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3.5 text-base outline-none transition-colors duration-200 focus:border-zinc-400 focus-visible:ring-2 focus-visible:ring-zinc-900/10"
                />
              </label>
              <label className="flex min-h-24 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-300 px-4 py-6 text-sm text-zinc-600 transition-colors duration-200 hover:bg-zinc-50">
                <Upload size={16} />
                {receiptImage
                  ? tf("تصویر رسید انتخاب شد", "Receipt image selected")
                  : tf("آپلود تصویر رسید", "Upload receipt image")}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    try {
                      setFormError("");
                      setReceiptImage(await compressReceiptImage(file));
                    } catch (err: any) {
                      setFormError(err?.message || tf("آپلود تصویر ناموفق بود", "Could not process image"));
                    }
                  }}
                />
              </label>
              {receiptImage ? (
                <img src={receiptImage} alt="" className="max-h-40 rounded-2xl border border-zinc-200" />
              ) : null}
            </div>
          ) : null}

          {step === "done" ? (
            <div className="rounded-2xl bg-emerald-50 px-4 py-6 text-center text-sm text-emerald-800">
              {formOk ||
                tf(
                  "درخواست شارژ ثبت شد و برای تأیید به فروشگاه ارسال شد.",
                  "Top-up request submitted and sent to the store for approval.",
                )}
            </div>
          ) : null}

          {formError && step !== "done" ? <p className="mt-3 text-sm text-rose-600">{formError}</p> : null}
        </div>

        <div className="sticky bottom-0 shrink-0 border-t border-zinc-100 bg-white/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
          {step === "done" ? (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-2xl bg-zinc-950 px-4 text-sm font-semibold text-white"
            >
              {tf("بستن", "Close")}
            </button>
          ) : (
            <div className="flex gap-2">
              {step !== "amount" ? (
                <button
                  type="button"
                  onClick={() => setStep(step === "receipt" && hasCards ? "pay" : "amount")}
                  className="inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-800"
                >
                  {tf("بازگشت", "Back")}
                </button>
              ) : null}
              {step === "amount" ? (
                <button
                  type="button"
                  disabled={!(Number(amount) > 0)}
                  onClick={goNextFromAmount}
                  className="inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center rounded-2xl bg-zinc-950 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {tf("ادامه", "Continue")}
                </button>
              ) : null}
              {step === "pay" ? (
                <button
                  type="button"
                  onClick={() => setStep("receipt")}
                  className="inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center rounded-2xl bg-zinc-950 px-4 text-sm font-semibold text-white"
                >
                  {tf("ارسال رسید", "Send receipt")}
                </button>
              ) : null}
              {step === "receipt" ? (
                <button
                  type="button"
                  disabled={!canSubmit}
                  onClick={onSubmit}
                  className="inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center rounded-2xl bg-zinc-950 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {depositPending
                    ? tf("در حال ارسال…", "Submitting…")
                    : tf("ارسال درخواست شارژ", "Submit top-up")}
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PaygSubPortal({
  id,
  data,
  payg,
}: {
  id: string;
  data: SubData;
  payg: PaygSubPortalPayload;
}) {
  const qc = useQueryClient();
  const merged = useMemo(() => mergePaygBrand(data, payg), [data, payg]);
  const model = usePortalModel(id, merged, "Light");
  useThemeFont("Aurora", model.isFa);
  const [importSheet, setImportSheet] = useState(false);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [chargeStep, setChargeStep] = useState<ChargeStep>("amount");
  const [amount, setAmount] = useState("");
  const [receiptText, setReceiptText] = useState("");
  const [receiptImage, setReceiptImage] = useState("");
  const [formError, setFormError] = useState("");
  const [formOk, setFormOk] = useState("");
  const [copiedCard, setCopiedCard] = useState<string | null>(null);

  const accent = payg.branding.primaryColor || "#84cc16";
  const isFa = model.isFa;
  const tf = model.tf;
  const t = model.t;
  const mode = String(payg.plan.billingMode || "").toUpperCase();
  const currency = payg.wallet.currency;
  const devices = Math.max(0, Math.floor(Number(payg.plan.limitIp || 0)));
  const deviceLabel = formatDevices(devices, payg.plan.deviceLabel, isFa);
  const extra = Math.max(0, Number(payg.plan.unitPriceExtra || 0));
  const rateLabel =
    mode === "VOLUME"
      ? tf(
          `هر گیگ ${formatMoney(Number(payg.plan.pricePerGb || 0), currency, isFa)}`,
          `${formatMoney(Number(payg.plan.pricePerGb || 0), currency, false)} / GB`,
        )
      : tf(
          `هر ساعت ${formatMoney(Number(payg.plan.pricePerHour || 0), currency, isFa)}`,
          `${formatMoney(Number(payg.plan.pricePerHour || 0), currency, false)} / hour`,
        );
  const usageQtyLabel =
    mode === "VOLUME"
      ? tf(`${trimNum(payg.usage.totalQuantity)} گیگ`, `${trimNum(payg.usage.totalQuantity)} GB`)
      : tf(
          `${trimNum(payg.usage.totalQuantity, 1)} ساعت`,
          `${trimNum(payg.usage.totalQuantity, 1)} h`,
        );
  const remainLabel = formatRemain(payg, isFa);
  const barPct = Math.max(0, Math.min(100, Number(payg.remaining.barPct) || 0));
  const needsCharge = payg.remaining.low || String(payg.status).toUpperCase() === "SUSPENDED";

  const openCharge = () => {
    setFormError("");
    setFormOk("");
    setChargeStep("amount");
    setChargeOpen(true);
  };

  const deposit = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `${API_BASE}/store/payg-sub/${encodeURIComponent(id)}/wallet/deposit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: Number(amount),
            currency,
            receiptText: receiptText.trim() || undefined,
            receiptImage: receiptImage || undefined,
          }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.message || tf("ارسال ناموفق بود", "Could not submit deposit"));
      }
      return json as { id: string; telegramPayUrl?: string | null };
    },
    onSuccess: async () => {
      setFormError("");
      setFormOk(
        tf(
          "درخواست شارژ ثبت شد و برای تأیید به فروشگاه ارسال شد.",
          "Top-up request submitted and sent to the store for approval.",
        ),
      );
      setAmount("");
      setReceiptText("");
      setReceiptImage("");
      setChargeStep("done");
      await qc.invalidateQueries({ queryKey: ["payg-sub-portal", id] });
    },
    onError: (e: any) => {
      setFormOk("");
      setFormError(e?.message || tf("ارسال ناموفق بود", "Could not submit deposit"));
    },
  });

  const copyCard = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value.replace(/\s+/g, ""));
      setCopiedCard(key);
      setTimeout(() => setCopiedCard(null), 1600);
    } catch {
      /* ignore */
    }
  };

  const canSubmit =
    Number(amount) > 0 && (!!receiptText.trim() || !!receiptImage) && !deposit.isPending;

  return (
    <div
      className="min-h-[100dvh] bg-[#f5f6f8] text-zinc-900"
      style={{
        fontFamily: isFa
          ? '"Vazirmatn", Tahoma, sans-serif'
          : '"Outfit", system-ui, sans-serif',
        ["--payg-accent" as string]: accent,
      }}
    >
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-6 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark
              logoSrc={model.logoSrc}
              brandName={payg.branding.name}
              className="h-11 w-auto max-w-[9rem] object-contain"
              fallbackClassName="flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-900 text-white"
            />
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">
                {payg.branding.name}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <p className="truncate text-sm text-zinc-500">{model.clientName}</p>
                {devices > 0 ? <DeviceChip label={deviceLabel} /> : null}
              </div>
            </div>
          </div>
          <LangToggle lang={model.lang} setLang={model.setLang} className="border-zinc-200 text-zinc-600" />
        </header>

        {needsCharge ? (
          <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
            <p>
              {payg.remaining.empty || String(payg.status).toUpperCase() === "SUSPENDED"
                ? tf(
                    "موجودی تمام شده. برای جلوگیری از قطع سرویس همین حالا شارژ کنید.",
                    "Balance is empty. Top up now to keep the service online.",
                  )
                : tf(
                    "اعتبار رو به اتمام است. برای جلوگیری از قطع، کیف پول را شارژ کنید.",
                    "Remaining credit is low. Top up to avoid disconnection.",
                  )}
            </p>
            <button
              type="button"
              onClick={openCharge}
              className="inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-amber-900 px-4 text-sm font-semibold text-amber-50"
            >
              {tf("شارژ", "Charge")}
            </button>
          </div>
        ) : null}

        <section className="mb-5 grid gap-3 md:grid-cols-3">
          <article className="relative overflow-hidden rounded-[28px] bg-zinc-950 p-5 text-white shadow-sm">
            <div className="mb-8 flex items-start justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--payg-accent)] text-zinc-950">
                <Wallet size={18} />
              </div>
              {devices > 0 ? <DeviceChip label={deviceLabel} dark /> : null}
            </div>
            <div className="text-sm text-zinc-400">{tf("موجودی کیف پول", "Wallet balance")}</div>
            <div className="mt-1 text-4xl font-semibold tabular-nums text-[var(--payg-accent)]">
              {formatMoney(payg.wallet.balance, currency, isFa)}
            </div>
            <button
              type="button"
              onClick={openCharge}
              className="mt-5 inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[var(--payg-accent)] px-4 text-sm font-semibold text-zinc-950 transition-opacity duration-200 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-white/40"
            >
              <Zap size={16} />
              {tf("شارژ", "Charge")}
            </button>
          </article>

          <article className="relative overflow-hidden rounded-[28px] bg-zinc-100 p-5 shadow-sm">
            <div className="mb-8 flex items-start justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-zinc-700 shadow-sm">
                <Upload size={18} />
              </div>
            </div>
            <div className="text-sm text-zinc-500">{tf("مجموع مصرف", "Total usage")}</div>
            <div className="mt-1 text-4xl font-semibold tabular-nums">{usageQtyLabel}</div>
            <div className="mt-1 text-xs text-zinc-400">
              {formatMoney(payg.usage.totalAmount, currency, isFa)}
              {mode === "VOLUME" && payg.usage.trafficBytes
                ? ` · ${formatBytes(payg.usage.trafficBytes)}`
                : null}
            </div>
          </article>

          <article
            className="relative overflow-hidden rounded-[28px] p-5 text-zinc-950 shadow-sm"
            style={{ background: accent }}
          >
            <div className="mb-8 flex items-start justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black/10">
                <Wallet size={18} />
              </div>
            </div>
            <div className="text-sm text-zinc-800/70">
              {mode === "VOLUME" ? tf("تخمین باقی‌مانده", "Estimated remaining") : tf("اعتبار زمانی", "Time credit")}
            </div>
            <div className="mt-1 text-4xl font-semibold tabular-nums">{remainLabel}</div>
            <div className="mt-1 text-xs text-zinc-800/70">
              {rateLabel}
              {devices > 1 ? ` · ${deviceLabel}` : null}
            </div>
          </article>
        </section>

        <section className="mb-5 rounded-[28px] bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">{tf("مصرف سرویس", "Service usage")}</h2>
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
                  {payg.plan.categoryName || payg.plan.name}
                </span>
                {devices > 0 ? <DeviceChip label={deviceLabel} /> : null}
              </div>
              <p className="mt-1 text-sm text-zinc-500">{rateLabel}</p>
            </div>
          </div>
          <UsageMeter
            pct={barPct}
            accent={accent}
            remainLabel={remainLabel}
            usedLabel={usageQtyLabel}
            remainCaption={tf("باقی‌مانده", "Left")}
            usedCaption={tf("مصرف", "Used")}
            low={payg.remaining.low}
          />
          <p className="mt-3 text-xs text-zinc-400">
            {tf(
              `با موجودی فعلی تقریباً ${remainLabel} دیگر سرویس جواب می‌دهد.`,
              `At the current balance this lasts about ${remainLabel}.`,
            )}
          </p>
        </section>

        <ExpandCard
          title={tf("جزئیات پلن", "Plan details")}
          badge={devices > 0 ? <DeviceChip label={deviceLabel} /> : undefined}
        >
          <div className="space-y-2 text-sm text-zinc-600">
            <p className="font-medium text-zinc-800">{payg.plan.name}</p>
            {payg.plan.description ? <p>{payg.plan.description}</p> : null}
            <p>{rateLabel}</p>
            {devices > 0 ? (
              <p>
                {extra > 0
                  ? tf(
                      `این اشتراک ${deviceLabel} است؛ نرخ آن نسبت به تک‌کاربره بالاتر محاسبه می‌شود.`,
                      `This subscription is ${deviceLabel}, so the rate is higher than the 1-user tier.`,
                    )
                  : tf(
                      `ظرفیت این اشتراک: ${deviceLabel}.`,
                      `This subscription is ${deviceLabel}.`,
                    )}
              </p>
            ) : null}
          </div>
        </ExpandCard>

        {model.outputType !== "subscription" ? (
          <ExpandCard title={tf("اتصال", "Connection")} defaultOpen>
            <PortalConnectionPanel output={model.connectionOutput} portalSettings={model.ps} />
          </ExpandCard>
        ) : (
          <>
            <section className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-stretch">
              <DualSubCopyButtons
                systemUrl={model.systemUrl}
                nativeUrl={model.nativeUrl}
                copied={model.copied}
                onCopy={model.copy}
                onQr={model.setQrValue}
                t={t}
                showNative={model.ps.showNativeQR !== false}
                className="flex-1"
                buttonClassName="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white"
                nativeButtonClassName="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-800"
              />
              {model.ps.allowDirectImport !== false ? (
                <button
                  type="button"
                  onClick={() => setImportSheet(true)}
                  className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-800"
                >
                  <MonitorSmartphone size={16} />
                  {t("importApp")}
                </button>
              ) : null}
            </section>
            <ExpandCard
              title={t("configs")}
              badge={
                <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-500">
                  {model.nodes.length} {t("nodes")}
                </span>
              }
              defaultOpen
            >
              <ConfigList
                nodes={model.nodes}
                copied={model.copied}
                onCopy={model.copy}
                onQr={model.setQrValue}
                hideHeader
                empty={t("noConfigs")}
                nodesLabel={t("nodes")}
                itemClassName="rounded-2xl bg-zinc-50 px-3 py-2.5"
              />
            </ExpandCard>
          </>
        )}
      </div>

      <ChargeWalletModal
        open={chargeOpen}
        onClose={() => setChargeOpen(false)}
        payg={payg}
        isFa={isFa}
        tf={tf}
        amount={amount}
        setAmount={setAmount}
        receiptText={receiptText}
        setReceiptText={setReceiptText}
        receiptImage={receiptImage}
        setReceiptImage={(v) => {
          setFormError("");
          setReceiptImage(v);
        }}
        formError={formError}
        setFormError={setFormError}
        formOk={formOk}
        copiedCard={copiedCard}
        copyCard={copyCard}
        canSubmit={canSubmit}
        depositPending={deposit.isPending}
        onSubmit={() => deposit.mutate()}
        step={chargeStep}
        setStep={(s) => {
          setFormError("");
          setChargeStep(s);
        }}
      />
      <QrModal value={model.qrValue} onClose={() => model.setQrValue(null)} title={t("scanQr")} />
      <ClientAppsSheet
        open={importSheet}
        onClose={() => setImportSheet(false)}
        systemUrl={model.systemUrl}
        brandName={payg.branding.name}
        title={t("importApp")}
        cancelLabel={t("cancel")}
        downloadLabel={t("download")}
        addLabel={t("addToApp")}
        subtitle={t("importPick")}
        panelClassName="bg-white text-zinc-900 border border-zinc-200"
      />
    </div>
  );
}
