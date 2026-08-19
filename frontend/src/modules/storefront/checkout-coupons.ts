import { publicApi, getCustomerSessionToken } from "@/lib/api";

export type ApplicableCouponOffer = {
  code: string;
  description?: string | null;
  discountAmount?: number;
  finalAmount?: number;
};

export function pickAutoCouponCode(
  offers: ApplicableCouponOffer[],
  currentCode?: string,
) {
  const current = String(currentCode || "").trim().toUpperCase();
  if (current && offers.some((o) => String(o.code || "").toUpperCase() === current)) {
    return current;
  }
  return String(offers[0]?.code || "").trim();
}

export async function fetchApplicableCoupons(input: {
  slug?: string;
  productId: string;
  isRenewal?: boolean;
  selectedAddonIds?: string[];
  limitIp?: number;
  customerToken?: string;
}): Promise<ApplicableCouponOffer[]> {
  const body = {
    productId: input.productId,
    isRenewal: !!input.isRenewal,
    selectedAddonIds: input.selectedAddonIds,
    limitIp: input.limitIp,
  };
  const session = getCustomerSessionToken();
  if (session) {
    try {
      const { data } = await publicApi.post("/store/customer/coupons/applicable", body);
      if (Array.isArray(data?.offers)) return data.offers;
    } catch {
      /* fall through to public catalog */
    }
  }
  if (!input.slug) return [];
  const { data } = await publicApi.post(`/store/public/${input.slug}/coupons/applicable`, {
    ...body,
    customerToken: input.customerToken || undefined,
  });
  return Array.isArray(data?.offers) ? data.offers : [];
}
