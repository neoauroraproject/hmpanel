"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, LoaderCircle, Upload, X } from "lucide-react";
import { publicApi } from "@/lib/api";
import { compressReceiptImage } from "../receipt-image";
import { useStorefrontLocale } from "../locale";
import type { CustomerService, StorefrontProduct, StorefrontStore } from "../types";
import { BankCardVisual, resolvePaymentCards } from "../BankCardVisual";
import { scrollTmaToTop } from "./scroll";
import { useTelegramWebApp } from "./useTelegramWebApp";

type Mode = "buy" | "renew";
type Step = 0 | 1 | 2 | 3;

const LIGHT = {
  bg: "#ffffff",
  secondary: "#f4f4f5",
  text: "#18181b",
  hint: "#71717a",
  border: "rgba(24,24,27,0.12)",
  button: "#2563eb",
  link: "#2563eb",
};

export function TmaCheckoutSheet({
  open,
  mode,
  products,
  renewService,
  primaryColor,
  payment,
  onClose,
  onSuccess,
}: {
  open: boolean;
  mode: Mode;
  products: StorefrontProduct[];
  renewService?: CustomerService | null;
  primaryColor?: string;
  payment?: StorefrontStore["payment"] | null;
  onClose: () => void;
  onSuccess: (trackingCode: string) => void;
}) {
  const { t, formatToman, isFa } = useStorefrontLocale();
  const { user } = useTelegramWebApp();
  const queryClient = useQueryClient();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>(0);
  const [productId, setProductId] = useState(products[0]?.id || "");
  const [configName, setConfigName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [contactNote, setContactNote] = useState("");
  const [receiptText, setReceiptText] = useState("");
  const [receiptImage, setReceiptImage] = useState("");
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");

  const catalog =
    mode === "renew" ? products.filter((p) => p.renewable !== false) : products;
  // buy: Product → Config → Contact → Payment
  // renew: Product → Payment → Confirm
  const labelsBuy = [
    t("محصول", "Product"),
    t("کانفیگ", "Config"),
    t("پروفایل", "Profile"),
    t("پرداخت", "Payment"),
  ];
  const labelsRenew = [t("محصول", "Product"), t("پرداخت", "Payment"), t("تأیید", "Confirm")];
  const labels = mode === "renew" ? labelsRenew : labelsBuy;
  const maxStep = (labels.length - 1) as Step;
  const selected = catalog.find((p) => p.id === productId) || catalog[0];
  const accent = primaryColor || LIGHT.button;
  const paymentCards = resolvePaymentCards(payment);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setError("");
    setConfigName("");
    setReceiptText("");
    setReceiptImage("");
    setPreview("");
    setProductId(products[0]?.id || catalog[0]?.id || "");
    const tgName = [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim();
    setDisplayName(tgName);
    setContactNote(user?.username ? `@${user.username}` : "");
    requestAnimationFrame(() => scrollTmaToTop(sheetRef.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    scrollTmaToTop(sheetRef.current);
  }, [step, open]);

  const goNext = () => {
    setError("");
    if (step === 0 && !productId) {
      setError(t("یک محصول انتخاب کنید", "Select a product"));
      return;
    }
    if (mode === "buy" && step === 1 && !configName.trim()) {
      setError(t("نام کانفیگ الزامی است", "Config name is required"));
      return;
    }
    if (mode === "buy" && step === 2 && !displayName.trim()) {
      setError(t("نام پروفایل الزامی است", "Profile name is required"));
      return;
    }
    // Renew: step 1 is payment — require receipt before confirm
    if (mode === "renew" && step === 1 && !receiptText.trim() && !receiptImage) {
      setError(t("رسید یا یادداشت پرداخت الزامی است", "Payment receipt or note is required"));
      return;
    }
    setStep((s) => Math.min(maxStep, s + 1) as Step);
  };

  const goBack = () => {
    setError("");
    if (step === 0) {
      onClose();
      return;
    }
    setStep((s) => Math.max(0, s - 1) as Step);
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (!productId) throw new Error(t("یک محصول انتخاب کنید", "Select a product"));
      if (mode === "buy" && !configName.trim()) {
        throw new Error(t("نام کانفیگ الزامی است", "Config name is required"));
      }
      if (mode === "renew" && !renewService?.id) {
        throw new Error(t("سرویس یافت نشد", "Service missing"));
      }
      if (!receiptText.trim() && !receiptImage) {
        throw new Error(
          t("رسید یا یادداشت پرداخت الزامی است", "Payment receipt or note is required"),
        );
      }

      if (mode === "renew") {
        return (
          await publicApi.post("/store/customer/renew", {
            clientId: renewService!.id,
            productId,
            receiptText: receiptText || undefined,
            receiptImage: receiptImage || undefined,
          })
        ).data;
      }

      return (
        await publicApi.post("/store/customer/order", {
          productId,
          configName: configName.trim(),
          name: displayName.trim() || undefined,
          telegram: contactNote.trim() || undefined,
          receiptText: receiptText || undefined,
          receiptImage: receiptImage || undefined,
        })
      ).data;
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["customer-session"] });
      onSuccess(data.trackingCode);
    },
    onError: (err: any) => {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          t("ثبت سفارش ناموفق بود", "Checkout failed"),
      );
    },
  });

  if (!open) return null;

  const priceLabel = selected
    ? selected.priceToman
      ? formatToman(selected.priceToman)
      : `$${selected.priceUsd}`
    : "";

  const showPayment =
    (mode === "buy" && step === 3) || (mode === "renew" && (step === 1 || step === 2));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 animate-[fadeIn_0.2s_ease]">
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0.65; transform: translateY(36px); } to { opacity: 1; transform: none; } }
      `}</style>
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div
        ref={sheetRef}
        className={`relative z-10 flex max-h-[94dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[1.75rem] shadow-2xl animate-[slideUp_0.32s_cubic-bezier(0.22,1,0.36,1)] ${
          isFa ? "font-[Vazirmatn,Tahoma,sans-serif]" : ""
        }`}
        style={{
          background: LIGHT.bg,
          color: LIGHT.text,
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div
          className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full"
          style={{ background: LIGHT.hint, opacity: 0.35 }}
        />

        <div
          className="flex shrink-0 items-center gap-2 border-b px-3 py-3"
          style={{ borderColor: LIGHT.border }}
        >
          <button
            type="button"
            onClick={goBack}
            className="flex h-9 w-9 items-center justify-center rounded-full active:scale-95"
            style={{ background: LIGHT.secondary }}
            aria-label="Back"
          >
            {step === 0 ? <X size={18} /> : <ChevronLeft size={20} className={isFa ? "rotate-180" : ""} />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold leading-tight">
              {mode === "renew" ? t("تمدید سرویس", "Renew") : t("سفارش جدید", "New order")}
            </div>
            <div className="text-[11px]" style={{ color: LIGHT.hint }}>
              {t("مرحله", "Step")} {step + 1} {t("از", "of")} {labels.length} · {labels[step]}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 gap-1.5 px-4 pt-3">
          {labels.map((label, i) => (
            <div key={`${label}-${i}`} className="min-w-0 flex-1">
              <div
                className="h-1 rounded-full transition-all"
                style={{
                  background: i <= step ? accent : "rgba(24,24,27,0.12)",
                }}
              />
            </div>
          ))}
        </div>

        <div
          key={step}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 animate-[fadeIn_0.22s_ease]"
        >
          {mode === "renew" && renewService ? (
            <div className="mb-4 space-y-2">
              <div
                className="rounded-2xl px-3.5 py-2.5 text-[13px]"
                style={{ background: LIGHT.secondary }}
              >
                {t("تمدید", "Renewing")}: <b>{renewService.remark || renewService.email}</b>
              </div>
              <p
                className="rounded-2xl px-3.5 py-2.5 text-[12px] leading-relaxed"
                style={{ background: "rgba(34,197,94,0.12)", color: "#166534" }}
              >
                {t(
                  "حجم و زمان پلن انتخابی به سرویس فعلی اضافه می‌شود؛ مصرف قبلی پاک نمی‌شود.",
                  "Selected plan volume and days are added. Used traffic is kept.",
                )}
              </p>
            </div>
          ) : null}

          {step === 0 ? (
            <div className="space-y-2">
              <p className="mb-1 text-[13px] font-medium" style={{ color: LIGHT.hint }}>
                {t("یک پلن انتخاب کنید", "Choose a plan")}
              </p>
              {catalog.map((p) => {
                const active = productId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProductId(p.id)}
                    className="flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3.5 text-start transition active:scale-[0.99]"
                    style={{
                      borderColor: active ? accent : LIGHT.border,
                      background: active ? `${accent}14` : "transparent",
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{p.name}</div>
                      <div className="mt-0.5 text-[12px]" style={{ color: LIGHT.hint }}>
                        {p.traffic} · {p.durationDays} {t("روز", "days")}
                      </div>
                    </div>
                    <div className="text-end">
                      <div className="text-sm font-bold" style={{ color: LIGHT.link }}>
                        {p.priceToman ? formatToman(p.priceToman) : `$${p.priceUsd}`}
                      </div>
                      {active ? <Check size={16} className="ms-auto mt-1" style={{ color: accent }} /> : null}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}

          {step === 1 && mode === "buy" ? (
            <div className="space-y-4">
              <div
                className="rounded-[1.35rem] border px-4 py-4"
                style={{ borderColor: `${accent}55`, background: `${accent}0d` }}
              >
                <div className="text-sm font-bold">{t("نام کانفیگ", "Config name")}</div>
                <p className="mt-1 text-[12px]" style={{ color: LIGHT.hint }}>
                  {t(
                    "این نام روی سرویس شما نمایش داده می‌شود — جدا از پروفایل تماس.",
                    "Shown on your service — separate from contact profile.",
                  )}
                </p>
                <input
                  autoFocus
                  className="mt-3 w-full rounded-2xl border bg-white px-4 py-3.5 outline-none"
                  style={{ borderColor: LIGHT.border, fontSize: "16px", color: LIGHT.text }}
                  value={configName}
                  onChange={(e) => setConfigName(e.target.value)}
                  placeholder={t("مثلاً phone-1", "e.g. phone-1")}
                />
              </div>
              {selected ? (
                <div className="rounded-2xl px-3.5 py-3 text-[13px]" style={{ background: LIGHT.secondary }}>
                  <div className="font-semibold">{selected.name}</div>
                  <div style={{ color: LIGHT.hint }}>{priceLabel}</div>
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 2 && mode === "buy" ? (
            <div className="space-y-4">
              <div
                className="rounded-[1.35rem] border px-4 py-4"
                style={{ borderColor: LIGHT.border, background: LIGHT.secondary }}
              >
                <div className="text-sm font-bold">{t("پروفایل و تماس", "Profile & contact")}</div>
                <p className="mt-1 text-[12px]" style={{ color: LIGHT.hint }}>
                  {t(
                    "از اکانت تلگرام پر شده — در صورت نیاز ویرایش کنید.",
                    "Filled from Telegram — edit if needed.",
                  )}
                </p>
                <label className="mt-3 block space-y-1.5 text-sm">
                  <span className="font-medium">{t("نام نمایشی", "Display name")}</span>
                  <input
                    className="w-full rounded-2xl border bg-white px-4 py-3.5 outline-none"
                    style={{ borderColor: LIGHT.border, fontSize: "16px" }}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </label>
                <label className="mt-3 block space-y-1.5 text-sm">
                  <span className="font-medium">{t("تلگرام / تماس", "Telegram / contact")}</span>
                  <input
                    className="w-full rounded-2xl border bg-white px-4 py-3.5 outline-none"
                    style={{ borderColor: LIGHT.border, fontSize: "16px" }}
                    value={contactNote}
                    onChange={(e) => setContactNote(e.target.value)}
                    placeholder="@username"
                  />
                </label>
              </div>
            </div>
          ) : null}

          {showPayment ? (
            <div className="space-y-4">
              {(mode === "buy" && step === 3) || (mode === "renew" && step === 2) ? (
                <div className="space-y-1.5 rounded-2xl px-3.5 py-3 text-[13px]" style={{ background: LIGHT.secondary }}>
                  <div className="flex justify-between gap-2">
                    <span style={{ color: LIGHT.hint }}>{t("محصول", "Product")}</span>
                    <span className="font-semibold">{selected?.name}</span>
                  </div>
                  {mode === "buy" ? (
                    <div className="flex justify-between gap-2">
                      <span style={{ color: LIGHT.hint }}>{t("کانفیگ", "Config")}</span>
                      <span className="font-semibold">{configName}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-2">
                    <span style={{ color: LIGHT.hint }}>{t("مبلغ", "Amount")}</span>
                    <span className="font-semibold">{priceLabel}</span>
                  </div>
                </div>
              ) : null}

              {(mode === "buy" && step === 3) || (mode === "renew" && step === 1) ? (
                <>
                  {paymentCards.length ? (
                    <div className="space-y-3">
                      {paymentCards.map((card) => (
                        <BankCardVisual
                          key={card.id}
                          bankName={card.bankName}
                          cardNumber={card.cardNumber}
                          cardHolder={card.cardHolder}
                          iban={card.iban}
                          instructions={card.instructions}
                          transferLabel={t("کارت به کارت", "Card to Card")}
                          copyLabel={t("کپی شماره کارت", "Copy card number")}
                          copiedLabel={t("کپی شد", "Copied")}
                        />
                      ))}
                    </div>
                  ) : (
                    <p
                      className="rounded-2xl px-3.5 py-3 text-[13px]"
                      style={{ background: "rgba(245,158,11,0.12)", color: "#92400e" }}
                    >
                      {t(
                        "اطلاعات کارت پرداخت هنوز تنظیم نشده. با پشتیبانی تماس بگیرید.",
                        "Payment card is not configured yet. Contact support.",
                      )}
                    </p>
                  )}
                  <label className="block space-y-2 text-sm">
                    <span className="font-medium">
                      {t("یادداشت پرداخت", "Payment note")}
                      <span className="ms-1 font-normal" style={{ color: LIGHT.hint }}>
                        ({t("یا رسید تصویری", "or image receipt")})
                      </span>
                    </span>
                    <textarea
                      rows={2}
                      className="w-full rounded-2xl border bg-white px-4 py-3 outline-none"
                      style={{ borderColor: LIGHT.border, fontSize: "16px" }}
                      value={receiptText}
                      onChange={(e) => setReceiptText(e.target.value)}
                      placeholder={t("شماره پیگیری واریز…", "Transfer reference…")}
                    />
                  </label>

                  <label
                    className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-7 text-sm active:scale-[0.99]"
                    style={{ borderColor: "rgba(24,24,27,0.22)" }}
                  >
                    <Upload size={20} style={{ color: LIGHT.hint }} />
                    <span className="font-medium">
                      {preview
                        ? t("رسید پیوست شد — برای تغییر ضربه بزنید", "Receipt attached — tap to change")
                        : t("آپلود رسید", "Upload receipt")}
                    </span>
                    <span className="text-[12px]" style={{ color: LIGHT.hint }}>
                      {t("الزامی برای بررسی ادمین", "Required for admin review")}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const value = await compressReceiptImage(file);
                          setReceiptImage(value);
                          setPreview(value);
                        } catch {
                          setError(t("پردازش تصویر ناموفق بود", "Could not process image"));
                        }
                      }}
                    />
                    {preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={preview} alt="Receipt" className="mt-1 max-h-36 rounded-xl object-contain" />
                    ) : null}
                  </label>
                </>
              ) : null}

              {step === 2 && mode === "renew" ? (
                <p className="text-[13px]" style={{ color: LIGHT.hint }}>
                  {t(
                    "رسید برای بررسی ادمین الزامی است. پس از ثبت، اعلان به ربات ادمین می‌رود.",
                    "A receipt is required for admin review. After submit, the admin bot is notified.",
                  )}
                </p>
              ) : null}

              {(mode === "buy" && step === 3) ? (
                <p className="text-[12px]" style={{ color: LIGHT.hint }}>
                  {t(
                    "با ثبت سفارش، رسید برای ادمین در ربات ارسال می‌شود تا تأیید یا رد کند.",
                    "On submit, your receipt is sent to the admin bot for approve/reject.",
                  )}
                </p>
              ) : null}
            </div>
          ) : null}

          {error ? <p className="mt-3 text-sm text-red-500">{error}</p> : null}
        </div>

        <div className="shrink-0 border-t px-4 py-3" style={{ borderColor: LIGHT.border }}>
          {step < maxStep ? (
            <button
              type="button"
              onClick={goNext}
              className="flex h-12 w-full items-center justify-center rounded-2xl text-[15px] font-semibold text-white transition active:scale-[0.98]"
              style={{ background: accent }}
            >
              {t("بعدی", "Next")}
            </button>
          ) : (
            <button
              type="button"
              disabled={submit.isPending}
              onClick={() => {
                setError("");
                submit.mutate();
              }}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
              style={{ background: accent }}
            >
              {submit.isPending ? <LoaderCircle size={18} className="animate-spin" /> : null}
              {mode === "renew"
                ? t("ثبت تمدید", "Submit renewal")
                : t("ثبت سفارش", "Place order")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
