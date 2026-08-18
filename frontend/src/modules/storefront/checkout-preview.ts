import type { StorefrontProduct } from "./types";

export type StorefrontAddon = NonNullable<StorefrontProduct["productAddons"]>[number];

export type CouponPreview = {
  amount: number;
  discountAmount: number;
  finalAmount: number;
  currency: string;
  code: string | null;
};

export function productAddons(product?: StorefrontProduct | null): StorefrontAddon[] {
  return Array.isArray(product?.productAddons) ? product.productAddons : [];
}

export function computeCheckoutPreview(
  product: StorefrontProduct | null | undefined,
  selectedAddonIds: string[],
  coupon?: CouponPreview | null,
) {
  const addons = productAddons(product);
  const selected = addons.filter((a) => selectedAddonIds.includes(a.id));
  const extraUsers = selected
    .filter((a) => a.type === "IP_LIMIT")
    .reduce((sum, a) => sum + Number(a.limitIp || 0), 0);
  const extraDays = selected
    .filter((a) => a.type === "EXTRA_DAYS")
    .reduce((sum, a) => sum + Number(a.days || 0), 0);
  const addonTotal = selected.reduce((sum, a) => sum + Number(a.priceExtra || 0), 0);
  const baseUsers = Math.max(0, Number(product?.baseLimitIp || 0));
  const baseDays = Math.max(0, Number(product?.durationDays || 0));
  const hasToman = Number(product?.priceToman || 0) > 0;
  const basePrice = hasToman ? Number(product?.priceToman || 0) : Number(product?.priceUsd || 0);
  const subtotal = basePrice + addonTotal;
  const discountAmount = coupon ? Number(coupon.discountAmount || 0) : 0;
  const finalAmount = coupon ? Number(coupon.finalAmount || subtotal) : subtotal;
  return {
    addons,
    selected,
    extraUsers,
    extraDays,
    addonTotal,
    baseUsers,
    baseDays,
    finalUsers: baseUsers + extraUsers,
    finalDays: baseDays + extraDays,
    traffic: product?.traffic ?? "",
    hasToman,
    basePrice,
    subtotal,
    discountAmount,
    finalAmount,
    couponCode: coupon?.code || null,
  };
}
