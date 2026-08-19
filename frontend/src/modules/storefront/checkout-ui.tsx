"use client";

import { LoaderCircle } from "lucide-react";
import { formatBytes } from "@/lib/format";
import { useStorefrontLocale } from "./locale";
import type { StorefrontCategory, StorefrontProduct } from "./types";
import { computeCheckoutPreview, productAddons, type CouponPreview } from "./checkout-preview";

export function CategoryFilterChips({
  categories,
  selectedId,
  onSelect,
}: {
  categories: StorefrontCategory[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const { t } = useStorefrontLocale();
  if (!categories.length) return null;
  const chips: Array<{ id: string; name: string; icon?: string | null }> = [
    { id: "", name: t("همه", "All") },
    ...categories,
  ];
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {chips.map((chip) => {
        const active = selectedId === chip.id;
        return (
          <button
            key={chip.id || "all"}
            type="button"
            onClick={() => onSelect(chip.id)}
            className={`shrink-0 rounded-full border px-3.5 py-2 text-sm font-semibold transition ${
              active
                ? "border-[color:var(--store-primary)] bg-[color:var(--store-primary)] text-white"
                : "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
            }`}
          >
            {chip.icon ? <span className="me-1">{chip.icon}</span> : null}
            {chip.name}
          </button>
        );
      })}
    </div>
  );
}

export function CategoryPicker({
  categories,
  selectedId,
  onSelect,
}: {
  categories: StorefrontCategory[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const { t } = useStorefrontLocale();
  if (!categories.length) {
    return (
      <p className="rounded-2xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
        {t("دسته‌بندی‌ای موجود نیست.", "No categories available.")}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {categories.map((category) => {
        const active = selectedId === category.id;
        return (
          <button
            key={category.id}
            type="button"
            onClick={() => onSelect(category.id)}
            className={`w-full rounded-2xl border px-3.5 py-3.5 text-start transition ${
              active
                ? "border-[color:var(--store-primary)] bg-[color:var(--store-primary)]/10"
                : "border-zinc-200 dark:border-zinc-800"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-lg dark:bg-zinc-900">
                {category.icon || "•"}
              </span>
              <div className="min-w-0">
                <div className="font-semibold">{category.name}</div>
                {category.description ? (
                  <p className="mt-0.5 text-xs text-zinc-500">{category.description}</p>
                ) : null}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function AddonPicker({
  product,
  selectedAddonIds,
  onToggle,
}: {
  product: StorefrontProduct | null;
  selectedAddonIds: string[];
  onToggle: (id: string) => void;
}) {
  const { t } = useStorefrontLocale();
  const addons = productAddons(product);
  if (!addons.length) {
    return (
      <p className="rounded-2xl border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
        {t("افزونه‌ای برای این پلن تعریف نشده.", "No add-ons for this plan.")}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {addons.map((addon) => {
        const checked = selectedAddonIds.includes(addon.id);
        return (
          <button
            key={addon.id}
            type="button"
            onClick={() => onToggle(addon.id)}
            className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-3.5 py-3 text-start ${
              checked
                ? "border-[color:var(--store-primary)] bg-[color:var(--store-primary)]/10"
                : "border-zinc-200 dark:border-zinc-800"
            }`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold ${
                  checked
                    ? "border-[color:var(--store-primary)] bg-[color:var(--store-primary)] text-white"
                    : "border-zinc-300 text-transparent dark:border-zinc-600"
                }`}
              >
                ✓
              </span>
              <span className="text-sm font-medium">{addon.label}</span>
            </span>
            <span className="shrink-0 text-xs text-zinc-500">
              {addon.priceExtra > 0 ? `+${addon.priceExtra}` : t("رایگان", "Free")}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function CheckoutLiveSummary({
  product,
  selectedAddonIds,
  coupon,
}: {
  product: StorefrontProduct | null;
  selectedAddonIds: string[];
  coupon?: CouponPreview | null;
}) {
  const { t, formatToman } = useStorefrontLocale();
  const preview = computeCheckoutPreview(product, selectedAddonIds, coupon);
  if (!product) return null;
  const money = (value: number) =>
    preview.hasToman
      ? formatToman(value)
      : `$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return (
    <div className="space-y-2 rounded-2xl border border-zinc-200 px-3.5 py-3 text-sm dark:border-zinc-800">
      <div className="flex justify-between gap-3">
        <span className="text-zinc-500">{t("ترافیک", "Traffic")}</span>
        <span className="font-medium">{formatBytes(preview.traffic)}</span>
      </div>
      <div className="flex justify-between gap-3">
        <span className="text-zinc-500">{t("مدت", "Duration")}</span>
        <span className="font-medium">
          {preview.finalDays} {t("روز", "days")}
          {preview.extraDays > 0 ? ` (+${preview.extraDays})` : ""}
        </span>
      </div>
      <div className="flex justify-between gap-3">
        <span className="text-zinc-500">{t("کاربر مجاز", "Allowed users")}</span>
        <span className="font-medium">
          {preview.finalUsers > 0 ? preview.finalUsers : t("نامحدود", "Unlimited")}
          {preview.extraUsers > 0 ? ` (+${preview.extraUsers})` : ""}
        </span>
      </div>
      <div className="flex justify-between gap-3">
        <span className="text-zinc-500">{t("قیمت محصول", "Base price")}</span>
        <span>{money(preview.basePrice)}</span>
      </div>
      {preview.addonTotal > 0 ? (
        <div className="flex justify-between gap-3">
          <span className="text-zinc-500">{t("جمع افزونه‌ها", "Add-ons total")}</span>
          <span>+{money(preview.addonTotal)}</span>
        </div>
      ) : null}
      {preview.discountAmount > 0 ? (
        <div className="flex justify-between gap-3 text-emerald-700 dark:text-emerald-300">
          <span>
            {t("تخفیف", "Discount")}
            {preview.couponCode ? ` (${preview.couponCode})` : ""}
          </span>
          <span>−{money(preview.discountAmount)}</span>
        </div>
      ) : null}
      <div className="flex justify-between gap-3 border-t border-zinc-200 pt-2 font-semibold dark:border-zinc-800">
        <span>{t("مبلغ نهایی", "Final payable")}</span>
        <span className="text-[color:var(--store-primary)]">{money(preview.finalAmount)}</span>
      </div>
    </div>
  );
}

export function CheckoutCouponBox({
  code,
  onCodeChange,
  offers,
  onApply,
  onClear,
  busy,
  error,
  formatMoney,
}: {
  code: string;
  onCodeChange: (value: string) => void;
  offers: Array<{
    code: string;
    description?: string | null;
    discountAmount?: number;
    finalAmount?: number;
  }>;
  onApply: (code?: string) => void;
  onClear?: () => void;
  busy: boolean;
  error?: string;
  formatMoney?: (value: number) => string;
}) {
  const { t } = useStorefrontLocale();
  return (
    <div className="space-y-2 rounded-2xl border border-zinc-200 bg-zinc-50/80 px-3.5 py-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="text-sm font-semibold">{t("کد تخفیف", "Discount code")}</div>
      <p className="text-xs text-zinc-500">
        {t(
          "کد مناسب این سفارش خودکار اعمال می‌شود. از لیست می‌توانید کد دیگری بزنید.",
          "A matching code is applied automatically. Tap another code in the list if you want.",
        )}
      </p>
      {offers.length ? (
        <div className="space-y-2">
          {offers.map((offer) => (
            <button
              key={offer.code}
              type="button"
              onClick={() => {
                onCodeChange(offer.code);
                onApply(offer.code);
              }}
              className={`w-full rounded-2xl border px-3.5 py-2.5 text-start text-sm ${
                code === offer.code
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
                  : "border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="font-mono font-bold">{offer.code}</div>
                {offer.finalAmount != null && formatMoney ? (
                  <div className="shrink-0 text-sm font-bold text-emerald-700 dark:text-emerald-300">
                    {formatMoney(Number(offer.finalAmount))}
                  </div>
                ) : null}
              </div>
              {offer.description ? (
                <div className="mt-0.5 text-xs text-zinc-500">{offer.description}</div>
              ) : null}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-zinc-500">
          {t("کد تخفیف قابل‌استفاده‌ای برای این سفارش نیست.", "No applicable discount codes for this order.")}
        </p>
      )}
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => onCodeChange(e.target.value.toUpperCase())}
          placeholder={t("کد دیگر", "Another code")}
          className="min-w-0 flex-1 rounded-2xl border border-zinc-200 bg-white px-4 py-3 font-mono text-sm outline-none dark:border-zinc-700 dark:bg-zinc-950"
        />
        <button
          type="button"
          disabled={busy || !code.trim()}
          onClick={() => onApply()}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
        >
          {busy ? <LoaderCircle size={14} className="animate-spin" /> : null}
          {t("اعمال", "Apply")}
        </button>
      </div>
      {code ? (
        <button
          type="button"
          className="text-xs font-semibold text-zinc-500 underline"
          onClick={() => {
            onCodeChange("");
            onClear?.();
          }}
        >
          {t("بدون کد تخفیف ادامه بده", "Continue without a code")}
        </button>
      ) : null}
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
    </div>
  );
}
