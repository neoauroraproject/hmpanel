"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, LoaderCircle, Upload, X } from "lucide-react";
import { publicApi } from "@/lib/api";
import { formatQuotaLabel } from "@/lib/format";
import { FieldBlock, springSoft } from "@/modules/storefront/design";
import { BankCardVisual, resolvePaymentCards } from "@/modules/storefront/BankCardVisual";
import { useStorefrontLocale } from "@/modules/storefront/locale";
import type {
  CustomerService,
  StorefrontCategory,
  StorefrontProduct,
  StorefrontStore,
} from "@/modules/storefront/types";
import { computeCheckoutPreview, type CouponPreview } from "@/modules/storefront/checkout-preview";
import { fetchApplicableCoupons, pickAutoCouponCode } from "@/modules/storefront/checkout-coupons";
import {
  AddonPicker,
  CategoryPicker,
  CheckoutCouponBox,
  CheckoutLiveSummary,
} from "@/modules/storefront/checkout-ui";
import { motion } from "framer-motion";

type FlowMode = "idle" | "buy" | "renew";
type PortalStepId = "category" | "product" | "extras" | "payment";

function buildPortalSteps(mode: FlowMode): PortalStepId[] {
  if (mode === "renew") return ["product", "extras", "payment"];
  return ["category", "product", "extras", "payment"];
}

export function CheckoutSheet({
  mode,
  step,
  setStep,
  categories,
  products,
  selectedProduct,
  setSelectedProduct,
  selectedAddonIds,
  setSelectedAddonIds,
  couponCode,
  setCouponCode,
  renewingService,
  configName,
  setConfigName,
  receiptText,
  setReceiptText,
  receiptPreview,
  onReceiptFile,
  onClose,
  submitting,
  error,
  onSubmit,
  primary,
  payment,
  storeSlug,
}: {
  mode: FlowMode;
  step: number;
  setStep: Dispatch<SetStateAction<number>>;
  categories: StorefrontCategory[];
  products: StorefrontProduct[];
  selectedProduct: StorefrontProduct | null;
  setSelectedProduct: (p: StorefrontProduct | null) => void;
  selectedAddonIds: string[];
  setSelectedAddonIds: Dispatch<SetStateAction<string[]>>;
  couponCode: string;
  setCouponCode: (v: string) => void;
  renewingService: CustomerService | null;
  configName: string;
  setConfigName: (v: string) => void;
  receiptText: string;
  setReceiptText: (v: string) => void;
  receiptPreview: string;
  onReceiptFile: (file?: File | null) => void;
  onClose: () => void;
  submitting: boolean;
  error: any;
  onSubmit: () => void;
  primary: string;
  payment: StorefrontStore["payment"] | null;
  storeSlug?: string;
}) {
  const { t, formatToman, isFa } = useStorefrontLocale();
  const lockedCategoryId = mode === "renew" ? String(renewingService?.categoryId || "") : "";
  const [categoryId, setCategoryId] = useState(lockedCategoryId);
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponError, setCouponError] = useState("");
  const [couponOffers, setCouponOffers] = useState<
    Array<{
      code: string;
      description?: string | null;
      discountAmount: number;
      finalAmount: number;
    }>
  >([]);
  const [couponPreview, setCouponPreview] = useState<CouponPreview | null>(null);

  useEffect(() => {
    if (lockedCategoryId) setCategoryId(lockedCategoryId);
  }, [lockedCategoryId]);

  const chipCategories = useMemo(() => {
    const ids = new Set(products.map((p) => p.categoryId).filter(Boolean));
    return [...categories]
      .filter((c) => ids.has(c.id))
      .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0) || a.name.localeCompare(b.name));
  }, [products, categories]);

  const catalog = useMemo(() => {
    const cat = categoryId || lockedCategoryId;
    return [...products]
      .filter((p) => !cat || p.categoryId === cat)
      .sort(
        (a, b) =>
          Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0) || (a.name || "").localeCompare(b.name || ""),
      );
  }, [products, categoryId, lockedCategoryId]);

  const steps = buildPortalSteps(mode);
  const safeStep = Math.min(Math.max(0, step), Math.max(0, steps.length - 1));
  const current = steps[safeStep] || "product";
  const paymentCards = resolvePaymentCards(payment);
  const preview = computeCheckoutPreview(selectedProduct, selectedAddonIds, couponPreview);
  const money = (value: number) =>
    preview.hasToman
      ? formatToman(value)
      : `$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  useEffect(() => {
    if (current !== "payment" || !selectedProduct?.id) return;
    let cancelled = false;
    const load = async () => {
      setCouponOffers([]);
      setCouponError("");
      try {
        const offers = await fetchApplicableCoupons({
          slug: storeSlug,
          productId: selectedProduct.id,
          isRenewal: mode === "renew",
          selectedAddonIds,
        });
        if (cancelled) return;
        setCouponOffers(offers);
        const nextCode = pickAutoCouponCode(offers, couponCode);
        if (nextCode) {
          await applyCoupon(nextCode);
        } else {
          setCouponPreview(null);
          setCouponCode("");
        }
      } catch {
        if (!cancelled) setCouponOffers([]);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, selectedProduct?.id, mode, selectedAddonIds, storeSlug]);

  const applyCoupon = async (codeOverride?: string) => {
    const code = String(codeOverride || couponCode || "").trim();
    if (!code) {
      setCouponPreview(null);
      setCouponCode("");
      return;
    }
    if (!selectedProduct?.id) {
      setCouponError(t("کد تخفیف را وارد کنید", "Enter a discount code"));
      return;
    }
    setCouponBusy(true);
    setCouponError("");
    try {
      const { data } = await publicApi.post("/store/customer/coupon/validate", {
        productId: selectedProduct.id,
        couponCode: code,
        isRenewal: mode === "renew",
        selectedAddonIds,
      });
      setCouponPreview({
        amount: Number(data.amount || 0),
        discountAmount: Number(data.discountAmount || 0),
        finalAmount: Number(data.finalAmount || 0),
        currency: String(data.currency || ""),
        code: data.code || code.toUpperCase(),
      });
      setCouponCode(data.code || code.toUpperCase());
    } catch (err: any) {
      setCouponPreview(null);
      setCouponError(
        err?.response?.data?.message ||
          err?.message ||
          t("کد تخفیف نامعتبر است", "Invalid discount code"),
      );
    } finally {
      setCouponBusy(false);
    }
  };

  const goNext = () => {
    if (current === "category" && !categoryId) return;
    if (current === "product" && !selectedProduct) return;
    if (current === "extras" && mode === "buy" && !configName.trim()) return;
    if (current === "payment") {
      if (!receiptText.trim() && !receiptPreview) return;
      onSubmit();
      return;
    }
    setStep((s) => Math.min(s + 1, steps.length - 1));
  };

  const nextDisabled =
    submitting ||
    (current === "category" && !categoryId) ||
    (current === "product" && !selectedProduct) ||
    (current === "extras" && mode === "buy" && !configName.trim()) ||
    (current === "payment" && !receiptText.trim() && !receiptPreview);

  const stepLabel =
    current === "category"
      ? t("دسته", "Category")
      : current === "product"
        ? t("پلن", "Plan")
        : current === "extras"
          ? t("جزئیات", "Details")
          : t("پرداخت", "Payment");

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-6">
      <button type="button" className="absolute inset-0 cursor-pointer" aria-label="Close" onClick={onClose} />
      <motion.div
        initial={{ y: 48, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={springSoft}
        className={`relative z-10 flex max-h-[min(92dvh,calc(100dvh-1.5rem))] w-full max-w-lg flex-col overflow-hidden rounded-t-[1.85rem] bg-white shadow-2xl dark:bg-zinc-950 sm:max-h-[min(90dvh,calc(100dvh-3rem))] sm:rounded-[1.85rem] ${
          isFa ? "font-[Vazirmatn,Tahoma,sans-serif]" : ""
        }`}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-700 sm:hidden" />
        <div className="flex items-center gap-2 border-b border-black/[0.05] px-3 py-3 dark:border-white/10">
          <button
            type="button"
            onClick={() => (safeStep === 0 ? onClose() : setStep((s) => Math.max(0, s - 1)))}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-2xl bg-[#F5F5F7] dark:bg-zinc-900"
          >
            {safeStep === 0 ? <X size={18} /> : <ChevronLeft size={20} className={isFa ? "rotate-180" : ""} />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="font-bold">
              {mode === "renew" ? t("تمدید سرویس", "Renew service") : t("سفارش جدید", "New order")}
            </div>
            <div className="text-[11px] text-zinc-500">
              {t("مرحله", "Step")} {safeStep + 1}/{steps.length} · {stepLabel}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          {mode === "renew" && renewingService ? (
            <div className="space-y-2">
              <div className="rounded-2xl bg-zinc-100 px-3.5 py-2.5 text-sm dark:bg-zinc-900">
                {t("تمدید", "Renewing")}: <b>{renewingService.remark || renewingService.email}</b>
              </div>
              <p className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-2.5 text-[13px] leading-relaxed text-emerald-800 dark:text-emerald-300">
                {t(
                  "حجم و زمان پلن انتخابی به سرویس فعلی اضافه می‌شود؛ مصرف قبلی و تنظیمات پاک نمی‌شوند.",
                  "Selected plan volume and days are added to this service. Used traffic and settings are kept.",
                )}
              </p>
            </div>
          ) : null}

          {current === "category" ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold">{t("یک دسته‌بندی انتخاب کنید", "Choose a category")}</p>
              <CategoryPicker
                categories={chipCategories}
                selectedId={categoryId}
                onSelect={(id) => {
                  setCategoryId(id);
                  setSelectedProduct(null);
                  setSelectedAddonIds([]);
                  setCouponCode("");
                  setCouponPreview(null);
                }}
              />
            </div>
          ) : null}

          {current === "product" ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold">{t("یک پلن انتخاب کنید", "Choose a plan")}</p>
              {catalog.map((p) => {
                const active = selectedProduct?.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedProduct(p);
                      setSelectedAddonIds([]);
                      setCouponCode("");
                      setCouponPreview(null);
                    }}
                    className={`w-full rounded-2xl border px-3.5 py-3.5 text-start transition ${
                      active
                        ? "border-[color:var(--store-primary)] bg-[color:var(--store-primary)]/10"
                        : "border-zinc-200 dark:border-zinc-800"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold">{p.name}</div>
                        <div className="text-xs text-zinc-500">
                          {formatQuotaLabel(p.traffic, p.durationDays, { locale: isFa ? "fa" : "en" })}
                        </div>
                      </div>
                      <div className="shrink-0 text-sm font-bold text-[color:var(--store-primary)]">
                        {p.priceToman ? formatToman(p.priceToman) : `$${p.priceUsd}`}
                      </div>
                    </div>
                    {active && p.description ? (
                      <p className="mt-2.5 whitespace-pre-line text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                        {p.description}
                      </p>
                    ) : null}
                  </button>
                );
              })}
              {!catalog.length ? (
                <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
                  {mode === "renew"
                    ? t(
                        "پلنی برای تمدید در این دسته‌بندی موجود نیست.",
                        "No renewal plans available in this category.",
                      )
                    : t("محصولی در این دسته موجود نیست.", "No products in this category.")}
                </div>
              ) : null}
            </div>
          ) : null}

          {current === "extras" ? (
            <div className="space-y-4">
              {mode === "buy" ? (
                <FieldBlock
                  title={t("نام کانفیگ", "Config name")}
                  hint={t("این نام روی سرویس شما نمایش داده می‌شود.", "Shown on your service list.")}
                  accent
                >
                  <input
                    className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3.5 outline-none dark:border-zinc-700 dark:bg-zinc-950"
                    style={{ fontSize: 16 }}
                    value={configName}
                    onChange={(e) => setConfigName(e.target.value)}
                    placeholder={t("مثلاً phone-1", "e.g. phone-1")}
                  />
                </FieldBlock>
              ) : null}
              <div>
                <div className="text-sm font-semibold">{t("افزونه‌ها", "Add-ons")}</div>
                <p className="mt-1 text-xs text-zinc-500">
                  {t(
                    "کاربر اضافه و زمان اضافه اختیاری است. مشخصات و قیمت همین‌جا به‌روز می‌شود.",
                    "Extra users and extra time are optional. Specs and price update here.",
                  )}
                </p>
              </div>
              <AddonPicker
                product={selectedProduct}
                selectedAddonIds={selectedAddonIds}
                onToggle={(id) => {
                  setSelectedAddonIds((cur) =>
                    cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
                  );
                  setCouponCode("");
                  setCouponPreview(null);
                }}
              />
              <CheckoutLiveSummary product={selectedProduct} selectedAddonIds={selectedAddonIds} />
            </div>
          ) : null}

          {current === "payment" ? (
            <>
              <div className="rounded-2xl border border-[color:var(--store-primary)]/30 bg-[color:var(--store-primary)]/5 px-4 py-4">
                <div className="text-xs font-semibold text-zinc-500">{t("مبلغ قابل پرداخت", "Amount due")}</div>
                <div className="mt-1 text-3xl font-black text-[color:var(--store-primary)]">
                  {money(preview.finalAmount)}
                </div>
                {preview.discountAmount > 0 ? (
                  <div className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">
                    {t("تخفیف", "Discount")}
                    {preview.couponCode ? ` (${preview.couponCode})` : ""}: −{money(preview.discountAmount)}
                  </div>
                ) : null}
              </div>
              <CheckoutLiveSummary
                product={selectedProduct}
                selectedAddonIds={selectedAddonIds}
                coupon={couponPreview}
              />
              <CheckoutCouponBox
                code={couponCode}
                onCodeChange={(value) => {
                  setCouponCode(value);
                  if (!value) setCouponPreview(null);
                }}
                offers={couponOffers}
                onApply={(code) => void applyCoupon(code)}
                onClear={() => {
                  setCouponPreview(null);
                  setCouponError("");
                }}
                busy={couponBusy}
                error={couponError}
                formatMoney={money}
              />
              <div className="space-y-1">
                <div className="text-sm font-bold">{t("پرداخت کارت به کارت", "Card-to-card payment")}</div>
                <p className="text-xs text-zinc-500">
                  {t("مبلغ بالا را واریز کنید و رسید را بفرستید.", "Transfer the amount above and send the receipt.")}
                </p>
              </div>
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
                <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-sm text-amber-800 dark:text-amber-200">
                  {t(
                    "اطلاعات کارت پرداخت هنوز تنظیم نشده. با پشتیبانی تماس بگیرید.",
                    "Payment card is not configured yet. Please contact support.",
                  )}
                </p>
              )}
              <FieldBlock
                title={t("یادداشت پرداخت", "Payment note")}
                hint={t("رسید یا یادداشت الزامی است", "Receipt or note is required")}
                accent
              >
                <textarea
                  rows={2}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 outline-none dark:border-zinc-700 dark:bg-zinc-950"
                  style={{ fontSize: 16 }}
                  value={receiptText}
                  onChange={(e) => setReceiptText(e.target.value)}
                />
              </FieldBlock>
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-[1.35rem] border border-dashed border-zinc-300 px-4 py-8 text-sm dark:border-zinc-700">
                <Upload size={18} />
                {receiptPreview ? t("رسید پیوست شد", "Receipt attached") : t("آپلود رسید", "Upload receipt")}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onReceiptFile(e.target.files?.[0])}
                />
                {receiptPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={receiptPreview} alt="" className="max-h-32 rounded-xl object-contain" />
                ) : null}
              </label>
            </>
          ) : null}

          {error ? (
            <p className="text-sm text-rose-500">
              {error?.response?.data?.message || error?.message || "Failed"}
            </p>
          ) : null}
        </div>

        <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
          <button
            type="button"
            disabled={nextDisabled}
            onClick={goNext}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-bold text-white disabled:opacity-50"
            style={{ background: primary }}
          >
            {submitting ? <LoaderCircle size={18} className="animate-spin" /> : null}
            {current === "payment" ? t("ثبت", "Submit") : t("بعدی", "Next")}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
