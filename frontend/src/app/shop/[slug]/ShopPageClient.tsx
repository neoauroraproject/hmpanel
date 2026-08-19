"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, LoaderCircle, Upload } from "lucide-react";
import { publicApi, getCustomerSessionToken } from "@/lib/api";
import type {
  CustomerProfile,
  StorefrontCategory,
  StorefrontProduct,
  StorefrontStore,
} from "@/modules/storefront/types";
import { useStorefrontLocale } from "@/modules/storefront/locale";
import { compressReceiptImage } from "@/modules/storefront/receipt-image";
import {
  PendingOrderCard,
  PrimaryButton,
  ProductCard,
  SecondaryButton,
  Stepper,
  StoreShell,
  WelcomeHero,
} from "@/modules/storefront/ui";
import { FieldBlock } from "@/modules/storefront/design";
import { BankCardVisual, resolvePaymentCards } from "@/modules/storefront/BankCardVisual";
import { rememberStoreSlug, portalPathForSlug } from "@/modules/storefront/store-slug";
import { computeCheckoutPreview, type CouponPreview } from "@/modules/storefront/checkout-preview";
import {
  AddonPicker,
  CategoryPicker,
  CheckoutCouponBox,
  CheckoutLiveSummary,
} from "@/modules/storefront/checkout-ui";

type ShopStep =
  | "welcome"
  | "category"
  | "product"
  | "extras"
  | "profile"
  | "payment"
  | "confirm";

const BUY_STEPS: ShopStep[] = [
  "welcome",
  "category",
  "product",
  "extras",
  "profile",
  "payment",
  "confirm",
];
const RENEW_STEPS: ShopStep[] = [
  "welcome",
  "product",
  "extras",
  "profile",
  "payment",
  "confirm",
];

export default function ShopPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const slug = params.slug as string;

  useEffect(() => {
    rememberStoreSlug(slug);
  }, [slug]);

  const flow = (searchParams.get("flow") || "").toLowerCase();
  const renewClientId = searchParams.get("clientId") || "";
  const serviceName = searchParams.get("serviceName") || "";
  const isRenewFlow = flow === "renew" && !!renewClientId;
  const isBuyFromPortal = flow === "buy";

  const [step, setStep] = useState<ShopStep>(
    flow === "renew" ? "product" : flow === "buy" ? "category" : "welcome",
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    () => searchParams.get("categoryId") || "",
  );
  const [selectedProduct, setSelectedProduct] = useState<StorefrontProduct | null>(null);
  const [haveToken, setHaveToken] = useState(isRenewFlow || isBuyFromPortal);
  const [lookupError, setLookupError] = useState("");
  const [receiptError, setReceiptError] = useState("");
  const [receiptPreview, setReceiptPreview] = useState("");
  const [result, setResult] = useState<any>(null);
  const [trackCode, setTrackCode] = useState("");
  const [showTrack, setShowTrack] = useState(false);
  const [form, setForm] = useState({
    customerToken: "",
    configName: "",
    name: "",
    telegram: "",
    whatsapp: "",
    email: "",
    receiptText: "",
    receiptImage: "",
    couponCode: "",
    paymentMethod: "MANUAL_BANK" as "MANUAL_BANK" | "WALLET",
    limitIp: undefined as number | undefined,
    selectedAddonIds: [] as string[],
  });
  const [hasCustomerSession, setHasCustomerSession] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["storefront", slug],
    queryFn: async () => (await publicApi.get(`/store/public/${slug}`)).data,
    retry: false,
  });

  const store = data?.store as StorefrontStore | undefined;
  const products = (data?.products || []) as StorefrontProduct[];
  const categories = (data?.categories || []) as StorefrontCategory[];
  const catalog = useMemo(() => {
    const catRank = new Map(categories.map((c, i) => [c.id, c.sortOrder ?? i]));
    const ranked = [...products].sort((a, b) => {
      const ra = catRank.get(a.categoryId) ?? 9999;
      const rb = catRank.get(b.categoryId) ?? 9999;
      if (ra !== rb) return ra - rb;
      const so = Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0);
      if (so) return so;
      return (a.name || "").localeCompare(b.name || "");
    });
    const pool = isRenewFlow ? ranked.filter((p) => p && p.renewable !== false) : ranked;
    if (selectedCategoryId) return pool.filter((p) => p.categoryId === selectedCategoryId);
    return pool;
  }, [isRenewFlow, products, selectedCategoryId, categories]);

  useEffect(() => {
    document.title = store?.title || store?.branding?.name || "Store";
    const icon =
      store?.logoUrl ||
      store?.logoDarkUrl ||
      store?.branding?.logo ||
      store?.branding?.logoDark;
    if (!icon) return;
    let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = icon;
  }, [store]);

  // Prefill customer token from portal session when coming from buy/renew
  useEffect(() => {
    if (!(isBuyFromPortal || isRenewFlow)) return;
    const boot = async () => {
      try {
        const session = getCustomerSessionToken();
        if (!session) return;
        const me = (await publicApi.get("/store/customer/session")).data;
        if (me?.token) {
          setHaveToken(true);
          setHasCustomerSession(true);
          setForm((current) => ({
            ...current,
            customerToken: me.token,
            name: me.profile?.name || current.name,
            telegram: me.profile?.telegram || current.telegram,
            whatsapp: me.profile?.whatsapp || current.whatsapp,
            email: me.profile?.email || current.email,
          }));
          if (isRenewFlow && renewClientId) {
            const svc = (me.services || []).find((s: any) => s.id === renewClientId);
            if (svc?.categoryId) setSelectedCategoryId(svc.categoryId);
          }
        }
      } catch {
        /* guest checkout still works */
      }
    };
    void boot();
  }, [isBuyFromPortal, isRenewFlow, renewClientId]);

  const lookupCustomer = useMutation({
    mutationFn: async (token: string) =>
      (await publicApi.post(`/store/public/${slug}/customer`, { token })).data as CustomerProfile,
    onSuccess: (profile) => {
      setLookupError("");
      setForm((current) => ({
        ...current,
        customerToken: profile.token || current.customerToken,
        name: profile.name || "",
        telegram: profile.telegram || "",
        whatsapp: profile.whatsapp || "",
        email: profile.email || "",
      }));
    },
    onError: () => setLookupError("Customer token was not found for this store."),
  });

  const createOrder = useMutation({
    mutationFn: async () => {
      const product = selectedProduct;
      const hasToman = Number(product?.priceToman || 0) > 0;
      const hasUsd = Number(product?.priceUsd || 0) > 0;
      const storeCur = (store?.defaultCurrency || "").toUpperCase();
      const preferToman =
        hasToman &&
        (!hasUsd || ["IRT", "IRR", "TOMAN", "TMN"].includes(storeCur));
      return (
        await publicApi.post(`/store/public/${slug}/order`, {
          productId: product?.id,
          configName: isRenewFlow ? undefined : form.configName,
          name: form.name,
          telegram: form.telegram,
          whatsapp: form.whatsapp,
          email: form.email,
          receiptText: form.paymentMethod === "WALLET" ? undefined : form.receiptText || undefined,
          receiptImage: form.paymentMethod === "WALLET" ? undefined : form.receiptImage || undefined,
          customerToken: haveToken ? form.customerToken : undefined,
          haveToken,
          isRenewal: isRenewFlow,
          renewClientId: isRenewFlow ? renewClientId : undefined,
          couponCode: form.couponCode || undefined,
          paymentMethod: form.paymentMethod,
          limitIp: form.limitIp,
          selectedAddonIds: form.selectedAddonIds,
          ...(preferToman ? { currency: "TOMAN" } : {}),
        })
      ).data;
    },
    onSuccess: (response) => setResult(response),
  });

  const orderError =
    (createOrder.error as any)?.response?.data?.message ||
    (createOrder.error as Error | null)?.message ||
    "";

  if (isLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <LoaderCircle className="animate-spin text-zinc-500" />
      </div>
    );
  }

  if (error || !data || !store) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-zinc-50 p-4 dark:bg-zinc-950">
        <AlertCircle size={44} className="mb-4 text-red-500" />
        <h1 className="text-2xl font-black">Store not found</h1>
        <p className="mt-2 text-sm text-zinc-500">This storefront is unavailable right now.</p>
      </div>
    );
  }

  if (result) {
    return (
      <StoreShell store={store} topBar={<span className="truncate text-sm font-semibold">{store.title}</span>}>
        <div className="px-4 py-8 sm:py-12">
          <PendingOrderCard
            trackingCode={result.trackingCode}
            customerToken={result.customerToken}
            orderStatus={result.status}
            onTrack={() => router.push(`/track/${result.trackingCode}`)}
          />
        </div>
      </StoreShell>
    );
  }

  return (
    <StoreShell store={store} topBar={<span className="truncate text-sm font-semibold">{store.title}</span>}>
      <ShopBody
        store={store}
        catalog={catalog}
        products={products}
        categories={categories}
        selectedCategoryId={selectedCategoryId}
        setSelectedCategoryId={setSelectedCategoryId}
        step={step}
        setStep={setStep}
        selectedProduct={selectedProduct}
        setSelectedProduct={setSelectedProduct}
        haveToken={haveToken}
        setHaveToken={setHaveToken}
        form={form}
        setForm={setForm}
        lookupCustomer={lookupCustomer}
        lookupError={lookupError}
        receiptError={receiptError}
        setReceiptError={setReceiptError}
        receiptPreview={receiptPreview}
        setReceiptPreview={setReceiptPreview}
        createOrder={createOrder}
        orderError={typeof orderError === "string" ? orderError : Array.isArray(orderError) ? orderError.join(", ") : ""}
        hasCustomerSession={hasCustomerSession}
        showTrack={showTrack}
        setShowTrack={setShowTrack}
        trackCode={trackCode}
        setTrackCode={setTrackCode}
        router={router}
        isRenewFlow={isRenewFlow}
        isBuyFromPortal={isBuyFromPortal}
        serviceName={serviceName}
      />
    </StoreShell>
  );
}

function skippableShopStep(
  step: ShopStep,
  ctx: { isRenew: boolean },
) {
  if (step === "category" && ctx.isRenew) return true;
  return false;
}

function nextShopStep(
  current: ShopStep,
  ctx: { isRenew: boolean },
): ShopStep {
  const order = ctx.isRenew ? RENEW_STEPS : BUY_STEPS;
  const i = order.indexOf(current);
  for (let j = i + 1; j < order.length; j++) {
    if (!skippableShopStep(order[j], ctx)) return order[j];
  }
  return current;
}

function prevShopStep(
  current: ShopStep,
  ctx: { isRenew: boolean },
): ShopStep {
  const order = ctx.isRenew ? RENEW_STEPS : BUY_STEPS;
  const i = order.indexOf(current);
  for (let j = i - 1; j >= 0; j--) {
    if (!skippableShopStep(order[j], ctx)) return order[j];
  }
  return current;
}

function ShopBody(props: {
  store: StorefrontStore;
  catalog: StorefrontProduct[];
  products: StorefrontProduct[];
  categories: StorefrontCategory[];
  selectedCategoryId: string;
  setSelectedCategoryId: (id: string) => void;
  step: ShopStep;
  setStep: (s: ShopStep | ((c: ShopStep) => ShopStep)) => void;
  selectedProduct: StorefrontProduct | null;
  setSelectedProduct: (p: StorefrontProduct | null) => void;
  haveToken: boolean;
  setHaveToken: (v: boolean) => void;
  form: any;
  setForm: any;
  lookupCustomer: any;
  lookupError: string;
  receiptError: string;
  setReceiptError: (v: string) => void;
  receiptPreview: string;
  setReceiptPreview: (v: string) => void;
  createOrder: any;
  orderError?: string;
  hasCustomerSession?: boolean;
  showTrack: boolean;
  setShowTrack: (v: boolean) => void;
  trackCode: string;
  setTrackCode: (v: string) => void;
  router: ReturnType<typeof useRouter>;
  isRenewFlow: boolean;
  isBuyFromPortal: boolean;
  serviceName: string;
}) {
  const {
    store,
    catalog,
    products,
    categories,
    selectedCategoryId,
    setSelectedCategoryId,
    step,
    setStep,
    selectedProduct,
    setSelectedProduct,
    haveToken,
    setHaveToken,
    form,
    setForm,
    lookupCustomer,
    lookupError,
    receiptError,
    setReceiptError,
    receiptPreview,
    setReceiptPreview,
    createOrder,
    orderError = "",
    hasCustomerSession = false,
    showTrack,
    setShowTrack,
    trackCode,
    setTrackCode,
    router,
    isRenewFlow,
    isBuyFromPortal,
    serviceName,
  } = props;
  const { t, formatToman } = useStorefrontLocale();
  const paymentCards = useMemo(
    () => resolvePaymentCards(store?.payment),
    [store?.payment],
  );
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponOffers, setCouponOffers] = useState<
    Array<{
      code: string;
      description?: string | null;
      discountAmount: number;
      finalAmount: number;
      amount: number;
      currency: string;
    }>
  >([]);
  const [couponPreview, setCouponPreview] = useState<CouponPreview | null>(null);
  const [couponError, setCouponError] = useState("");
  const slug = store.slug;
  const chipCategories = useMemo(() => {
    const pool = isRenewFlow ? products.filter((p) => p && p.renewable !== false) : products;
    const ids = new Set(pool.map((p) => p.categoryId).filter(Boolean));
    return categories.filter((c) => ids.has(c.id));
  }, [isRenewFlow, products, categories]);
  const productGroups = useMemo(() => {
    if (selectedCategoryId || !chipCategories.length) {
      return [{ id: selectedCategoryId || "all", title: "", items: catalog }];
    }
    return [
      ...chipCategories
        .map((cat) => ({
          id: cat.id,
          title: `${cat.icon ? `${cat.icon} ` : ""}${cat.name}`,
          items: catalog.filter((p) => p.categoryId === cat.id),
        }))
        .filter((g) => g.items.length),
      ...(() => {
        const known = new Set(chipCategories.map((c) => c.id));
        const leftovers = catalog.filter((p) => !p.categoryId || !known.has(p.categoryId));
        return leftovers.length ? [{ id: "other", title: "", items: leftovers }] : [];
      })(),
    ];
  }, [selectedCategoryId, chipCategories, catalog]);
  const stepCtx = {
    isRenew: isRenewFlow,
  };
  const checkoutLabels = (isRenewFlow ? RENEW_STEPS : BUY_STEPS)
    .filter((s) => s !== "welcome" && !skippableShopStep(s, stepCtx))
    .map((s) => {
      if (s === "category") return t("دسته", "Category");
      if (s === "product") return t("پلن", "Plan");
      if (s === "extras") return t("جزئیات", "Details");
      if (s === "profile") return t("پروفایل", "Profile");
      if (s === "payment") return t("پرداخت", "Payment");
      return t("تأیید", "Confirm");
    });
  const activeCheckoutIndex = Math.max(
    0,
    (isRenewFlow ? RENEW_STEPS : BUY_STEPS)
      .filter((s) => s !== "welcome" && !skippableShopStep(s, stepCtx))
      .indexOf(step),
  );

  useEffect(() => {
    if (step !== "payment" || !selectedProduct?.id) return;
    let cancelled = false;
    const load = async () => {
      setCouponError("");
      setCouponOffers([]);
      try {
        const session = getCustomerSessionToken();
        const { data } = session
          ? await publicApi.post("/store/customer/coupons/applicable", {
              productId: selectedProduct.id,
              isRenewal: isRenewFlow,
              limitIp: form.limitIp,
              selectedAddonIds: form.selectedAddonIds,
            })
          : await publicApi.post(`/store/public/${slug}/coupons/applicable`, {
              productId: selectedProduct.id,
              customerToken: form.customerToken || undefined,
              isRenewal: isRenewFlow,
              limitIp: form.limitIp,
              selectedAddonIds: form.selectedAddonIds,
            });
        if (cancelled) return;
        const offers = Array.isArray(data?.offers) ? data.offers : [];
        setCouponOffers(offers);
      } catch {
        if (cancelled) return;
        setCouponOffers([]);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedProduct?.id, isRenewFlow, form.limitIp, form.selectedAddonIds, form.customerToken, slug]);

  const applyShopCoupon = async (codeOverride?: string) => {
    const code = String(codeOverride || form.couponCode || "").trim();
    if (!code) {
      setCouponPreview(null);
      setForm((c: any) => ({ ...c, couponCode: "" }));
      return;
    }
    if (!selectedProduct?.id) {
      setCouponError(t("کد تخفیف را وارد کنید", "Enter a discount code"));
      return;
    }
    setCouponBusy(true);
    setCouponError("");
    try {
      const session = getCustomerSessionToken();
      const { data } = session
        ? await publicApi.post("/store/customer/coupon/validate", {
            productId: selectedProduct.id,
            couponCode: code,
            isRenewal: isRenewFlow,
            limitIp: form.limitIp,
            selectedAddonIds: form.selectedAddonIds,
          })
        : await publicApi.post(`/store/public/${slug}/coupon/validate`, {
            productId: selectedProduct.id,
            couponCode: code,
            customerToken: form.customerToken || undefined,
            isRenewal: isRenewFlow,
            limitIp: form.limitIp,
            selectedAddonIds: form.selectedAddonIds,
          });
      setCouponPreview({
        amount: Number(data.amount || 0),
        discountAmount: Number(data.discountAmount || 0),
        finalAmount: Number(data.finalAmount || 0),
        currency: String(data.currency || ""),
        code: data.code || code.toUpperCase(),
      });
      setForm((c: any) => ({ ...c, couponCode: data.code || code.toUpperCase() }));
    } catch (err: any) {
      setCouponError(
        err?.response?.data?.message ||
          err?.message ||
          t("کد تخفیف نامعتبر است", "Invalid discount code"),
      );
    } finally {
      setCouponBusy(false);
    }
  };

  const canContinueConfig = isRenewFlow || !!form.configName.trim();
  const canContinueProfile =
    !!selectedProduct &&
    (haveToken ? !!form.customerToken.trim() : !!form.name.trim());

  const contextBanner =
    isRenewFlow || isBuyFromPortal ? (
      <div className="mx-4 mt-4 rounded-2xl border border-[color:var(--store-primary)]/25 bg-[color:var(--store-primary)]/5 px-4 py-3 text-sm">
        <div className="font-bold text-[color:var(--store-primary)]">
          {isRenewFlow ? t("تمدید سرویس", "Renewing a service") : t("خرید سرویس جدید", "Buying a new service")}
        </div>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          {isRenewFlow
            ? t(
                `در حال تمدید سرویس «${serviceName || "—"}» هستید. پلن را انتخاب و پرداخت را ثبت کنید.`,
                `You are renewing “${serviceName || "—"}”. Pick a plan and submit payment.`,
              )
            : t(
                "سفارش جدید از پورتال مشتری — پلن را انتخاب کنید و مراحل را ادامه دهید.",
                "New order from your customer portal — pick a plan and continue.",
              )}
        </p>
      </div>
    ) : null;

  return (
    <AnimatePresence mode="wait">
      {step === "welcome" ? (
        <motion.div
          key="welcome"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <WelcomeHero
            store={store}
            onBuy={() => setStep(nextShopStep("welcome", stepCtx))}
            onLogin={() => router.push(portalPathForSlug(store.slug, "login"))}
            onTrack={() => setShowTrack(true)}
          />
          <AnimatePresence>
            {showTrack ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
                onClick={() => setShowTrack(false)}
              >
                <motion.div
                  initial={{ y: 40, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 40, opacity: 0 }}
                  className="w-full max-w-md rounded-t-3xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 sm:rounded-3xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3 className="text-lg font-bold">{t("پیگیری سفارش", "Track order")}</h3>
                  <p className="mt-1 text-sm text-zinc-500">{t("کد پیگیری را وارد کنید", "Enter your tracking code")}</p>
                  <input
                    value={trackCode}
                    onChange={(e) => setTrackCode(e.target.value.toUpperCase())}
                    placeholder="TRACKING CODE"
                    className="mt-4 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 font-mono outline-none dark:border-zinc-800 dark:bg-zinc-950"
                  />
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <SecondaryButton onClick={() => setShowTrack(false)}>{t("انصراف", "Cancel")}</SecondaryButton>
                    <PrimaryButton
                      disabled={!trackCode.trim()}
                      onClick={() => router.push(`/track/${encodeURIComponent(trackCode.trim())}`)}
                    >
                      {t("پیگیری", "Track")}
                    </PrimaryButton>
                  </div>
                </motion.div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.div>
      ) : (
        <motion.div
          key={`checkout-${step}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="px-4 py-6 sm:py-10"
        >
          {contextBanner}
          <div className="mt-4">
            <Stepper labels={checkoutLabels} activeIndex={activeCheckoutIndex} />
          </div>
          <div className="rounded-[1.75rem] border border-zinc-200 bg-white/95 p-4 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95 sm:rounded-[2rem] sm:p-8">
            {selectedProduct && step !== "product" && step !== "category" ? (
              <div className="mb-5 rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-950">
                <div className="font-bold">{selectedProduct.name}</div>
                {selectedProduct.description ? (
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-zinc-500">
                    {selectedProduct.description}
                  </p>
                ) : null}
              </div>
            ) : null}

            {step === "category" ? (
              <div className="space-y-4">
                <div>
                  <div className="text-lg font-bold">{t("انتخاب دسته", "Choose category")}</div>
                  <p className="mt-1 text-sm text-zinc-500">
                    {t("اول دسته را انتخاب کنید، بعد پلن‌های همان دسته.", "Pick a category first, then its plans.")}
                  </p>
                </div>
                <CategoryPicker
                  categories={chipCategories}
                  selectedId={selectedCategoryId}
                  onSelect={(id) => {
                    setSelectedCategoryId(id);
                    setSelectedProduct(null);
                    setForm((c: any) => ({ ...c, selectedAddonIds: [], couponCode: "" }));
                    setCouponPreview(null);
                  }}
                />
              </div>
            ) : null}

            {step === "product" ? (
              <div className="space-y-4">
                <div>
                  <div className="text-lg font-bold">{t("انتخاب پلن", "Choose Product")}</div>
                  <p className="mt-1 text-sm text-zinc-500">
                    {t("پلن‌های این دسته، به ترتیب فروشگاه.", "Plans in this category, in store order.")}
                  </p>
                </div>
                {!catalog.length ? (
                  <p className="rounded-2xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
                    {isRenewFlow
                      ? t(
                          "پلنی برای تمدید در این دسته‌بندی موجود نیست. اگر دسته‌بندی سرویس مشخص نیست، از پورتال آن را ثبت کنید.",
                          "No renewal plans in this category. If the service has no category, set it in the portal first.",
                        )
                      : t("محصولی در این دسته موجود نیست.", "No products in this category.")}
                  </p>
                ) : (
                  <div className="grid gap-3">
                    {catalog.map((product, index) => (
                      <motion.div
                        key={product.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.03, duration: 0.25 }}
                      >
                        <ProductCard
                          product={product}
                          selected={selectedProduct?.id === product.id}
                          onSelect={() => {
                            setSelectedProduct(product);
                            setForm((c: any) => ({
                              ...c,
                              limitIp: undefined,
                              selectedAddonIds: [],
                              couponCode: "",
                            }));
                            setCouponPreview(null);
                          }}
                        />
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {step === "extras" ? (
              <div className="space-y-5">
                {!isRenewFlow ? (
                  <FieldBlock
                    title={t("نام کانفیگ", "Config name")}
                    hint={t("مثلاً phone-1 یا laptop", "e.g. phone-1 or laptop")}
                    accent
                  >
                    <input
                      value={form.configName}
                      onChange={(event) =>
                        setForm((current: any) => ({ ...current, configName: event.target.value }))
                      }
                      placeholder={t("مثلاً phone-1", "e.g. phone-1")}
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3.5 outline-none dark:border-zinc-700 dark:bg-zinc-950"
                      style={{ fontSize: 16 }}
                    />
                  </FieldBlock>
                ) : (
                  <p className="rounded-2xl bg-zinc-50 px-4 py-3 text-sm text-zinc-500 dark:bg-zinc-950">
                    {t("برای تمدید نام کانفیگ لازم نیست.", "Config name is not required for renewal.")}
                  </p>
                )}
                <div>
                  <div className="text-lg font-bold">{t("افزونه‌ها", "Add-ons")}</div>
                  <p className="mt-1 text-sm text-zinc-500">
                    {t(
                      "کاربر اضافه و زمان اضافه اختیاری است. مشخصات و قیمت همین‌جا به‌روز می‌شود.",
                      "Extra users and extra time are optional. Specs and price update here.",
                    )}
                  </p>
                </div>
                <AddonPicker
                  product={selectedProduct}
                  selectedAddonIds={form.selectedAddonIds}
                  onToggle={(id) => {
                    setForm((c: any) => ({
                      ...c,
                      selectedAddonIds: c.selectedAddonIds.includes(id)
                        ? c.selectedAddonIds.filter((x: string) => x !== id)
                        : [...c.selectedAddonIds, id],
                      couponCode: "",
                    }));
                    setCouponPreview(null);
                  }}
                />
                <CheckoutLiveSummary
                  product={selectedProduct}
                  selectedAddonIds={form.selectedAddonIds}
                />
              </div>
            ) : null}

            {step === "profile" ? (
              <div className="space-y-5">
                <div>
                  <div className="text-lg font-bold">{t("اطلاعات تماس و پروفایل", "Contact & profile")}</div>
                  <p className="mt-1 text-sm text-zinc-500">
                    {isRenewFlow
                      ? t("تمدید با پروفایل مشتری شما انجام می‌شود.", "Renewal uses your customer profile.")
                      : t(
                          "مشتری جدید پروفایل می‌سازد؛ مشتری قبلی می‌تواند توکن وب بزند.",
                          "New customers create a profile. Returning customers can use a web token.",
                        )}
                  </p>
                </div>
                {!isRenewFlow ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setHaveToken(true)}
                      className={`rounded-2xl border px-4 py-3 text-start ${haveToken ? "border-[color:var(--store-primary)] bg-[color:var(--store-primary)]/5" : "border-zinc-200 dark:border-zinc-800"}`}
                    >
                      <div className="font-semibold">{t("توکن وب دارم", "Have web token")}</div>
                      <div className="mt-1 text-xs text-zinc-500">{t("بارگذاری پروفایل", "Load your customer profile")}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setHaveToken(false)}
                      className={`rounded-2xl border px-4 py-3 text-start ${!haveToken ? "border-[color:var(--store-primary)] bg-[color:var(--store-primary)]/5" : "border-zinc-200 dark:border-zinc-800"}`}
                    >
                      <div className="font-semibold">{t("خرید اول", "First Purchase")}</div>
                      <div className="mt-1 text-xs text-zinc-500">{t("ساخت پروفایل جدید", "Create a new customer profile")}</div>
                    </button>
                  </div>
                ) : null}
                <FieldBlock title={t("اطلاعات تماس", "Contact details")} hint={t("نام و راه‌های ارتباطی", "Name and contact channels")}>
                  {haveToken ? (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <input
                          value={form.customerToken}
                          onChange={(event) =>
                            setForm((current: any) => ({
                              ...current,
                              customerToken: event.target.value.toUpperCase(),
                            }))
                          }
                          placeholder="HM-XXXX-XXXX-XXXX"
                          className="flex-1 rounded-2xl border border-zinc-200 bg-white px-4 py-3 font-mono outline-none dark:border-zinc-800 dark:bg-zinc-950"
                        />
                        <PrimaryButton
                          className="w-auto px-5"
                          onClick={() => lookupCustomer.mutate(form.customerToken.trim())}
                          disabled={!form.customerToken.trim() || lookupCustomer.isPending}
                        >
                          {t("بارگذاری", "Load")}
                        </PrimaryButton>
                      </div>
                      {lookupError ? <p className="text-sm text-red-500">{lookupError}</p> : null}
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Input label={t("نام", "Display Name")} value={form.name} disabled />
                        <Input label="Telegram" value={form.telegram} disabled />
                        <Input label="WhatsApp" value={form.whatsapp} disabled />
                        <Input label="Email" value={form.email} disabled />
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input
                        label={t("نام", "Display Name")}
                        value={form.name}
                        onChange={(value) => setForm((current: any) => ({ ...current, name: value }))}
                      />
                      <Input
                        label="Telegram"
                        value={form.telegram}
                        onChange={(value) => setForm((current: any) => ({ ...current, telegram: value }))}
                      />
                      <Input
                        label="WhatsApp"
                        value={form.whatsapp}
                        onChange={(value) => setForm((current: any) => ({ ...current, whatsapp: value }))}
                      />
                      <Input
                        label="Email"
                        value={form.email}
                        onChange={(value) => setForm((current: any) => ({ ...current, email: value }))}
                      />
                    </div>
                  )}
                </FieldBlock>
              </div>
            ) : null}

            {step === "payment" ? (
              <div className="space-y-4">
                <div>
                  <div className="text-lg font-bold">{t("پرداخت", "Payment")}</div>
                  <p className="mt-1 text-sm text-zinc-500">
                    {t(
                      "مبلغ نهایی را ببینید، کد تخفیف را انتخاب کنید، سپس رسید را بفرستید.",
                      "See the final amount, pick a discount code, then send the receipt.",
                    )}
                  </p>
                </div>
                <div className="rounded-2xl border border-[color:var(--store-primary)]/30 bg-[color:var(--store-primary)]/5 px-4 py-4">
                  <div className="text-xs font-semibold text-zinc-500">{t("مبلغ قابل پرداخت", "Amount due")}</div>
                  <div className="mt-1 text-3xl font-black text-[color:var(--store-primary)]">
                    {(() => {
                      const preview = computeCheckoutPreview(
                        selectedProduct,
                        form.selectedAddonIds,
                        couponPreview,
                      );
                      return preview.hasToman
                        ? formatToman(preview.finalAmount)
                        : `$${Number(preview.finalAmount).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
                    })()}
                  </div>
                </div>
                <CheckoutLiveSummary
                  product={selectedProduct}
                  selectedAddonIds={form.selectedAddonIds}
                  coupon={couponPreview}
                />
                <CheckoutCouponBox
                  code={form.couponCode}
                  onCodeChange={(value) => {
                    setForm((c: any) => ({ ...c, couponCode: value }));
                    if (!value) setCouponPreview(null);
                  }}
                  offers={couponOffers}
                  onApply={(code) => void applyShopCoupon(code)}
                  onClear={() => {
                    setCouponPreview(null);
                    setCouponError("");
                  }}
                  busy={couponBusy}
                  error={couponError}
                />
                {hasCustomerSession || (haveToken && form.customerToken) ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setForm((c: any) => ({ ...c, paymentMethod: "MANUAL_BANK" }))}
                      className={`rounded-xl px-3 py-2 text-sm font-medium ${
                        form.paymentMethod !== "WALLET"
                          ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                          : "border border-zinc-200 dark:border-zinc-800"
                      }`}
                    >
                      {t("کارت + رسید", "Card + receipt")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm((c: any) => ({ ...c, paymentMethod: "WALLET" }))}
                      className={`rounded-xl px-3 py-2 text-sm font-medium ${
                        form.paymentMethod === "WALLET"
                          ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                          : "border border-zinc-200 dark:border-zinc-800"
                      }`}
                    >
                      {t("کیف پول", "Pay with wallet")}
                    </button>
                  </div>
                ) : null}
                {form.paymentMethod === "WALLET" ? (
                  <p className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-3 text-sm text-emerald-800 dark:text-emerald-200">
                    {t(
                      "مبلغ از موجودی کیف پول کسر می‌شود.",
                      "Amount will be deducted from your wallet balance.",
                    )}
                  </p>
                ) : null}
                {form.paymentMethod !== "WALLET" ? paymentCards.map((card) => (
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
                )) : null}
                {form.paymentMethod !== "WALLET" && !paymentCards.length ? (
                  <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-sm text-amber-800 dark:text-amber-200">
                    {t(
                      "اطلاعات کارت پرداخت هنوز تنظیم نشده.",
                      "Payment card is not configured yet.",
                    )}
                  </p>
                ) : null}
                {form.paymentMethod !== "WALLET" ? (
                <textarea
                  rows={3}
                  value={form.receiptText}
                  onChange={(event) => setForm((current: any) => ({ ...current, receiptText: event.target.value }))}
                  placeholder={t("شناسه تراکنش یا یادداشت پرداخت", "Transaction ID or payment note")}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 outline-none dark:border-zinc-800 dark:bg-zinc-950"
                />
                ) : null}
                {form.paymentMethod !== "WALLET" ? (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-300 px-4 py-6 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
                  <Upload size={16} />
                  {t("آپلود تصویر رسید", "Upload receipt image")}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      setReceiptError("");
                      try {
                        const dataUrl = await compressReceiptImage(file);
                        setForm((current: any) => ({ ...current, receiptImage: dataUrl }));
                        setReceiptPreview(dataUrl);
                      } catch (err: any) {
                        setReceiptError(
                          err?.message ||
                            t("آپلود تصویر ناموفق بود", "Could not process receipt image"),
                        );
                      }
                    }}
                  />
                </label>
                ) : null}
                {receiptError ? <p className="text-sm text-red-500">{receiptError}</p> : null}
                {orderError ? <p className="text-sm text-red-500">{orderError}</p> : null}
                {receiptPreview && form.paymentMethod !== "WALLET" ? (
                  <img
                    src={receiptPreview}
                    alt="Receipt preview"
                    className="max-h-48 rounded-2xl border border-zinc-200 object-cover dark:border-zinc-800"
                  />
                ) : null}
              </div>
            ) : null}

            {step === "confirm" ? (
              <div className="space-y-3 text-sm">
                {isRenewFlow ? (
                  <SummaryRow label={t("سرویس", "Service")} value={serviceName || "—"} />
                ) : null}
                <SummaryRow label={t("محصول", "Product")} value={selectedProduct?.name || "-"} />
                <SummaryRow label={t("مشتری", "Customer")} value={form.name || t("پروفایل موجود", "Existing profile")} />
                {!isRenewFlow ? <SummaryRow label={t("نام کانفیگ", "Config Name")} value={form.configName} /> : null}
                <CheckoutLiveSummary
                  product={selectedProduct}
                  selectedAddonIds={form.selectedAddonIds}
                  coupon={couponPreview}
                />
                <SummaryRow
                  label={t("تراکنش", "Transaction ID")}
                  value={form.receiptText || t("فقط تصویر رسید", "Uploaded receipt only")}
                />
              </div>
            ) : null}

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <SecondaryButton
                onClick={() => {
                  const prev = prevShopStep(step, stepCtx);
                  if (prev === "welcome") {
                    if (isBuyFromPortal || isRenewFlow) {
                      router.push(portalPathForSlug(store.slug, "dashboard"));
                      return;
                    }
                    setSelectedProduct(null);
                    setStep("welcome");
                    return;
                  }
                  setStep(prev);
                }}
              >
                {t("بازگشت", "Back")}
              </SecondaryButton>
              {step !== "confirm" ? (
                <PrimaryButton
                  onClick={() => setStep(nextShopStep(step, stepCtx))}
                  disabled={
                    (step === "category" && !selectedCategoryId) ||
                    (step === "product" && !selectedProduct) ||
                    (step === "extras" && !canContinueConfig) ||
                    (step === "profile" && !canContinueProfile) ||
                    (step === "payment" &&
                      form.paymentMethod !== "WALLET" &&
                      !form.receiptText.trim() &&
                      !form.receiptImage)
                  }
                >
                  {t("ادامه", "Continue")}
                </PrimaryButton>
              ) : (
                <PrimaryButton onClick={() => createOrder.mutate()} disabled={createOrder.isPending}>
                  {createOrder.isPending ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <LoaderCircle size={16} className="animate-spin" />
                      {t("در حال ارسال...", "Submitting...")}
                    </span>
                  ) : (
                    t("ثبت سفارش", "Submit Order")
                  )}
                </PrimaryButton>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Input({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        value={value}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 outline-none disabled:cursor-not-allowed disabled:opacity-70 dark:border-zinc-800 dark:bg-zinc-950"
      />
    </label>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-zinc-50 px-4 py-3 dark:bg-zinc-950">
      <span className="text-zinc-500">{label}</span>
      <span className="font-medium text-end">{value}</span>
    </div>
  );
}
