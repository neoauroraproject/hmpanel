"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, LoaderCircle, Upload } from "lucide-react";
import { publicApi, getCustomerSessionToken } from "@/lib/api";
import type { CustomerProfile, StorefrontProduct, StorefrontStore } from "@/modules/storefront/types";
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

type Step = 0 | 1 | 2 | 3 | 4;

export default function ShopPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const slug = params.slug as string;

  const flow = (searchParams.get("flow") || "").toLowerCase();
  const renewClientId = searchParams.get("clientId") || "";
  const serviceName = searchParams.get("serviceName") || "";
  const isRenewFlow = flow === "renew" && !!renewClientId;
  const isBuyFromPortal = flow === "buy";

  const [step, setStep] = useState<Step>(flow === "buy" || flow === "renew" ? 1 : 0);
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
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["storefront", slug],
    queryFn: async () => (await publicApi.get(`/store/public/${slug}`)).data,
    retry: false,
  });

  const store = data?.store as StorefrontStore | undefined;
  const products = (data?.products || []) as StorefrontProduct[];
  const catalog = useMemo(() => {
    if (!isRenewFlow) return products;
    return products.filter((p) => p && (p as any).renewable !== false);
  }, [isRenewFlow, products]);

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
          setForm((current) => ({
            ...current,
            customerToken: me.token,
            name: me.profile?.name || current.name,
            telegram: me.profile?.telegram || current.telegram,
            whatsapp: me.profile?.whatsapp || current.whatsapp,
            email: me.profile?.email || current.email,
          }));
        }
      } catch {
        /* guest checkout still works */
      }
    };
    void boot();
  }, [isBuyFromPortal, isRenewFlow]);

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
    mutationFn: async () =>
      (
        await publicApi.post(`/store/public/${slug}/order`, {
          productId: selectedProduct?.id,
          configName: isRenewFlow ? undefined : form.configName,
          name: form.name,
          telegram: form.telegram,
          whatsapp: form.whatsapp,
          email: form.email,
          receiptText: form.receiptText || undefined,
          receiptImage: form.receiptImage || undefined,
          customerToken: haveToken ? form.customerToken : undefined,
          haveToken,
          isRenewal: isRenewFlow,
          renewClientId: isRenewFlow ? renewClientId : undefined,
        })
      ).data,
    onSuccess: (response) => setResult(response),
  });

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

function ShopBody(props: {
  store: StorefrontStore;
  catalog: StorefrontProduct[];
  step: Step;
  setStep: (s: Step | ((c: Step) => Step)) => void;
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

  const canContinueProfile =
    !!selectedProduct &&
    (isRenewFlow
      ? haveToken
        ? !!form.customerToken.trim()
        : !!form.name.trim()
      : !!form.configName.trim() && (haveToken ? !!form.customerToken.trim() : !!form.name.trim()));

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
      {step === 0 ? (
        <motion.div
          key="welcome"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <WelcomeHero
            store={store}
            onBuy={() => setStep(1)}
            onLogin={() => router.push("/portal")}
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
            <Stepper step={step} />
          </div>
          <div className="rounded-[1.75rem] border border-zinc-200 bg-white/95 p-4 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95 sm:rounded-[2rem] sm:p-8">
            {selectedProduct && step > 1 ? (
              <div className="mb-5 rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-950">
                <div className="font-bold">{selectedProduct.name}</div>
                <div className="mt-2 flex flex-wrap gap-3 text-sm text-zinc-500">
                  <span>
                    {selectedProduct.durationDays} {t("روز", "days")}
                  </span>
                  {Number(selectedProduct.priceToman) > 0 ? (
                    <span className="font-semibold text-[color:var(--store-primary)]">
                      {formatToman(selectedProduct.priceToman)}
                    </span>
                  ) : null}
                  {Number(selectedProduct.priceUsd) > 0 ? (
                    <span className="font-semibold">${Number(selectedProduct.priceUsd)}</span>
                  ) : null}
                </div>
              </div>
            ) : null}

            {step === 1 ? (
              <div className="space-y-4">
                <div>
                  <div className="text-lg font-bold">{t("انتخاب پلن", "Choose Product")}</div>
                  <p className="mt-1 text-sm text-zinc-500">
                    {t("اول پلن را انتخاب کنید، بعد ادامه دهید.", "Select a plan first, then continue.")}
                  </p>
                </div>
                {!catalog.length ? (
                  <p className="rounded-2xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
                    {t("محصولی موجود نیست.", "No products are available right now.")}
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
                          onSelect={() => setSelectedProduct(product)}
                        />
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-5">
                <div>
                  <div className="text-lg font-bold">{t("اطلاعات مشتری", "Customer Information")}</div>
                  <p className="mt-1 text-sm text-zinc-500">
                    {isRenewFlow
                      ? t("تمدید با پروفایل مشتری شما انجام می‌شود.", "Renewal uses your customer profile.")
                      : t(
                          "مشتری جدید پروفایل می‌سازد؛ مشتری قبلی می‌تواند توکن بزند.",
                          "New customers create a profile. Returning customers can reuse their token.",
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
                      <div className="font-semibold">{t("توکن دارم", "Have Token")}</div>
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
                {!isRenewFlow ? (
                  <label className="block text-sm font-medium">
                    {t("نام کانفیگ", "Config Name")}
                    <input
                      value={form.configName}
                      onChange={(event) => setForm((current: any) => ({ ...current, configName: event.target.value }))}
                      className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 outline-none dark:border-zinc-800 dark:bg-zinc-950"
                    />
                  </label>
                ) : null}
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
              </div>
            ) : null}

            {step === 3 ? (
              <div className="space-y-4">
                <div>
                  <div className="text-lg font-bold">{t("پرداخت", "Payment")}</div>
                  <p className="mt-1 text-sm text-zinc-500">
                    {t("کد پیگیری تراکنش، تصویر رسید، یا هر دو را بفرستید.", "Submit transaction ID, receipt image, or both.")}
                  </p>
                </div>
                {(store.payment?.cards?.length
                  ? store.payment.cards
                  : store.payment?.cardNumber || store.payment?.bankName
                    ? [
                        {
                          id: "legacy",
                          bankName: store.payment.bankName || undefined,
                          cardNumber: store.payment.cardNumber || undefined,
                          cardHolder: store.payment.cardHolder || undefined,
                          iban: store.payment.iban || undefined,
                          instructions: store.payment.instructions || undefined,
                        },
                      ]
                    : []
                ).map((card) => (
                  <div key={card.id} className="rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-950">
                    <div className="text-sm font-semibold">{card.bankName || t("کارت به کارت", "Card to Card")}</div>
                    {card.cardNumber ? (
                      <div className="mt-2 font-mono text-lg tracking-wide">{card.cardNumber}</div>
                    ) : null}
                    {card.cardHolder ? <div className="mt-1 text-sm text-zinc-500">{card.cardHolder}</div> : null}
                    {card.iban ? <div className="mt-1 font-mono text-xs text-zinc-500">{card.iban}</div> : null}
                    {card.instructions ? (
                      <p className="mt-3 whitespace-pre-line text-sm text-zinc-500">{card.instructions}</p>
                    ) : null}
                  </div>
                ))}
                <textarea
                  rows={3}
                  value={form.receiptText}
                  onChange={(event) => setForm((current: any) => ({ ...current, receiptText: event.target.value }))}
                  placeholder={t("شناسه تراکنش یا یادداشت پرداخت", "Transaction ID or payment note")}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 outline-none dark:border-zinc-800 dark:bg-zinc-950"
                />
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
                {receiptError ? <p className="text-sm text-red-500">{receiptError}</p> : null}
                {receiptPreview ? (
                  <img
                    src={receiptPreview}
                    alt="Receipt preview"
                    className="max-h-48 rounded-2xl border border-zinc-200 object-cover dark:border-zinc-800"
                  />
                ) : null}
              </div>
            ) : null}

            {step === 4 ? (
              <div className="space-y-3 text-sm">
                {isRenewFlow ? (
                  <SummaryRow label={t("سرویس", "Service")} value={serviceName || "—"} />
                ) : null}
                <SummaryRow label={t("محصول", "Product")} value={selectedProduct?.name || "-"} />
                <SummaryRow label={t("مشتری", "Customer")} value={form.name || t("پروفایل موجود", "Existing profile")} />
                {!isRenewFlow ? <SummaryRow label={t("نام کانفیگ", "Config Name")} value={form.configName} /> : null}
                <SummaryRow
                  label={t("تراکنش", "Transaction ID")}
                  value={form.receiptText || t("فقط تصویر رسید", "Uploaded receipt only")}
                />
                {Number(selectedProduct?.priceToman) > 0 ? (
                  <SummaryRow label={t("مبلغ", "Amount")} value={formatToman(selectedProduct?.priceToman)} />
                ) : null}
                {Number(selectedProduct?.priceUsd) > 0 ? (
                  <SummaryRow label="USD" value={`$${Number(selectedProduct?.priceUsd)}`} />
                ) : null}
              </div>
            ) : null}

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <SecondaryButton
                onClick={() => {
                  if (step === 1) {
                    if (isBuyFromPortal || isRenewFlow) {
                      router.push("/portal/dashboard");
                      return;
                    }
                    setStep(0);
                    setSelectedProduct(null);
                    return;
                  }
                  setStep((current) => Math.max(1, current - 1) as Step);
                }}
              >
                {t("بازگشت", "Back")}
              </SecondaryButton>
              {step < 4 ? (
                <PrimaryButton
                  onClick={() => setStep((current) => (current + 1) as Step)}
                  disabled={
                    (step === 1 && !selectedProduct) ||
                    (step === 2 && !canContinueProfile) ||
                    (step === 3 && !form.receiptText.trim() && !form.receiptImage)
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
