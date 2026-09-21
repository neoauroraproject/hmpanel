"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Copy,
  MonitorSmartphone,
  Upload,
  Wallet,
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
              <p className="truncate text-sm text-zinc-500">{model.clientName}</p>
            </div>
          </div>
          <LangToggle lang={model.lang} setLang={model.setLang} className="border-zinc-200 text-zinc-600" />
        </header>

        {payg.remaining.low || String(payg.status).toUpperCase() === "SUSPENDED" ? (
          <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {payg.remaining.empty || String(payg.status).toUpperCase() === "SUSPENDED"
              ? tf(
                  "موجودی تمام شده. برای جلوگیری از قطع سرویس همین حالا شارژ کنید.",
                  "Balance is empty. Top up now to keep the service online.",
                )
              : tf(
                  "اعتبار رو به اتمام است. برای جلوگیری از قطع، کیف پول را شارژ کنید.",
                  "Remaining credit is low. Top up to avoid disconnection.",
                )}
          </div>
        ) : null}

        <section className="mb-5 grid gap-3 md:grid-cols-3">
          <article className="relative overflow-hidden rounded-[28px] bg-zinc-950 p-5 text-white shadow-sm">
            <div className="mb-8 flex items-start justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--payg-accent)] text-zinc-950">
                <Wallet size={18} />
              </div>
            </div>
            <div className="text-sm text-zinc-400">{tf("موجودی کیف پول", "Wallet balance")}</div>
            <div className="mt-1 flex items-end justify-between gap-2">
              <div className="text-4xl font-semibold tabular-nums text-[var(--payg-accent)]">
                {formatMoney(payg.wallet.balance, currency, isFa)}
              </div>
              {payg.telegram.payUrl ? (
                <a
                  href={payg.telegram.payUrl}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
                  aria-label={tf("ادامه در تلگرام", "Continue in Telegram")}
                >
                  <ArrowUpRight size={16} />
                </a>
              ) : null}
            </div>
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
            <div className="mt-1 text-xs text-zinc-800/70">{rateLabel}</div>
          </article>
        </section>

        <section className="mb-5 rounded-[28px] bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">{tf("پلن و مصرف", "Plan & Usage")}</h2>
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
                  {payg.plan.categoryName || payg.plan.name}
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-500">
                {payg.plan.description || payg.plan.name} · {rateLabel}
              </p>
            </div>
            <div className="flex gap-2">
              <div className="rounded-2xl bg-zinc-50 px-4 py-2 text-center">
                <div className="text-[11px] text-zinc-400">{tf("باقی‌مانده", "Left")}</div>
                <div className="text-lg font-semibold tabular-nums">{remainLabel}</div>
              </div>
              <div className="rounded-2xl bg-zinc-50 px-4 py-2 text-center">
                <div className="text-[11px] text-zinc-400">{tf("مصرف", "Used")}</div>
                <div className="text-lg font-semibold tabular-nums">{usageQtyLabel}</div>
              </div>
            </div>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-[repeating-linear-gradient(135deg,#ececec_0_8px,#f7f7f7_8px_16px)]">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${barPct}%`, background: accent }}
            />
          </div>
          <p className="mt-2 text-xs text-zinc-400">
            {tf(
              `با موجودی فعلی تقریباً ${remainLabel} دیگر سرویس جواب می‌دهد.`,
              `At the current balance this lasts about ${remainLabel}.`,
            )}
          </p>
        </section>

        <section className="mb-5 rounded-[28px] bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{tf("شارژ کیف پول", "Top up wallet")}</h2>
            {payg.telegram.payUrl ? (
              <a
                href={payg.telegram.payUrl}
                className="inline-flex items-center gap-2 rounded-full bg-zinc-950 px-4 py-2 text-sm font-semibold text-white"
              >
                {tf("ادامه پرداخت در تلگرام", "Continue payment in Telegram")}
                <ArrowUpRight size={14} />
              </a>
            ) : null}
          </div>

          {payg.payment.cards.length ? (
            <div className="mb-4 grid gap-2 sm:grid-cols-2">
              {payg.payment.cards.map((card, idx) => (
                <div key={`${card.cardNumber}-${idx}`} className="rounded-2xl bg-zinc-50 p-3 text-sm">
                  <div className="font-medium">{card.bankName || tf("کارت بانکی", "Bank card")}</div>
                  {card.cardHolder ? <div className="text-xs text-zinc-500">{card.cardHolder}</div> : null}
                  {card.cardNumber ? (
                    <button
                      type="button"
                      onClick={() => copyCard(card.cardNumber || "", `card-${idx}`)}
                      className="mt-1 inline-flex items-center gap-1 font-mono text-sm"
                    >
                      {copiedCard === `card-${idx}` ? t("copied") : card.cardNumber}
                      <Copy size={12} />
                    </button>
                  ) : null}
                  {card.iban ? <div className="text-xs text-zinc-500">{card.iban}</div> : null}
                  {card.instructions ? (
                    <div className="mt-1 text-xs text-zinc-500">{card.instructions}</div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">{tf("مبلغ", "Amount")}</span>
              <input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={formatMoney(0, currency, isFa)}
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-400"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">{tf("متن رسید", "Receipt note")}</span>
              <input
                value={receiptText}
                onChange={(e) => setReceiptText(e.target.value)}
                placeholder={tf("شماره پیگیری یا توضیح", "Tracking code or note")}
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-400"
              />
            </label>
          </div>
          <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-300 px-4 py-6 text-sm text-zinc-600">
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
            <img src={receiptImage} alt="" className="mt-3 max-h-40 rounded-2xl border border-zinc-200" />
          ) : null}
          {formError ? <p className="mt-2 text-sm text-rose-600">{formError}</p> : null}
          {formOk ? <p className="mt-2 text-sm text-emerald-600">{formOk}</p> : null}
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => deposit.mutate()}
            className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40 sm:w-auto"
          >
            {deposit.isPending
              ? tf("در حال ارسال…", "Submitting…")
              : tf("ارسال درخواست شارژ", "Submit top-up")}
          </button>
        </section>

        {model.outputType !== "subscription" ? (
          <section className="mb-5 rounded-[28px] bg-white p-5 shadow-sm">
            <PortalConnectionPanel output={model.connectionOutput} portalSettings={model.ps} />
          </section>
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
                buttonClassName="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white"
                nativeButtonClassName="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-800"
              />
              {model.ps.allowDirectImport !== false ? (
                <button
                  type="button"
                  onClick={() => setImportSheet(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-800"
                >
                  <MonitorSmartphone size={16} />
                  {t("importApp")}
                </button>
              ) : null}
            </section>
            <section className="mb-5 rounded-[28px] bg-white p-5 shadow-sm">
              <ConfigList
                nodes={model.nodes}
                copied={model.copied}
                onCopy={model.copy}
                onQr={model.setQrValue}
                title={t("configs")}
                empty={t("noConfigs")}
                nodesLabel={t("nodes")}
                itemClassName="rounded-2xl bg-zinc-50 px-3 py-2.5"
              />
            </section>
          </>
        )}
      </div>

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
