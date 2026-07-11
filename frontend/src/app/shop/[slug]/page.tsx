"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, LoaderCircle, Upload } from "lucide-react";
import { publicApi } from "@/lib/api";
import type { CustomerProfile, StorefrontProduct, StorefrontStore } from "@/modules/storefront/types";
import {
  PendingOrderCard,
  PrimaryButton,
  ProductCard,
  SecondaryButton,
  Stepper,
  StoreShell,
  WelcomeHero,
} from "@/modules/storefront/ui";

type Step = 0 | 1 | 2 | 3;

export default function ShopPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const [step, setStep] = useState<Step>(0);
  const [selectedProduct, setSelectedProduct] = useState<StorefrontProduct | null>(null);
  const [haveToken, setHaveToken] = useState(false);
  const [lookupError, setLookupError] = useState("");
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
          configName: form.configName,
          name: form.name,
          telegram: form.telegram,
          whatsapp: form.whatsapp,
          email: form.email,
          receiptText: form.receiptText || undefined,
          receiptImage: form.receiptImage || undefined,
          customerToken: haveToken ? form.customerToken : undefined,
          haveToken,
        })
      ).data,
    onSuccess: (response) => setResult(response),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <LoaderCircle className="animate-spin text-zinc-500" />
      </div>
    );
  }

  if (error || !data || !store) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 p-4 dark:bg-zinc-950">
        <AlertCircle size={44} className="mb-4 text-red-500" />
        <h1 className="text-2xl font-black">Store not found</h1>
        <p className="mt-2 text-sm text-zinc-500">This storefront is unavailable right now.</p>
      </div>
    );
  }

  if (result) {
    return (
      <StoreShell store={store}>
        <div className="px-4 py-10 sm:py-16">
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

  const canContinueProfile =
    !!selectedProduct &&
    !!form.configName.trim() &&
    (haveToken ? !!form.customerToken.trim() : !!form.name.trim());

  return (
    <StoreShell store={store}>
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
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                onClick={() => setShowTrack(false)}
              >
                <motion.div
                  initial={{ scale: 0.95, y: 12 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.95, y: 12 }}
                  className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3 className="text-lg font-bold">Track order</h3>
                  <p className="mt-1 text-sm text-zinc-500">Enter your tracking code</p>
                  <input
                    value={trackCode}
                    onChange={(e) => setTrackCode(e.target.value.toUpperCase())}
                    placeholder="TRACKING CODE"
                    className="mt-4 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 font-mono outline-none dark:border-zinc-800 dark:bg-zinc-950"
                  />
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <SecondaryButton onClick={() => setShowTrack(false)}>Cancel</SecondaryButton>
                    <PrimaryButton
                      disabled={!trackCode.trim()}
                      onClick={() => router.push(`/track/${encodeURIComponent(trackCode.trim())}`)}
                    >
                      Track
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
          className="mx-auto max-w-2xl px-4 py-10"
        >
          <Stepper step={step} />
          <div className="rounded-[2rem] border border-zinc-200 bg-white/90 p-6 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90 sm:p-8">
            {selectedProduct ? (
              <motion.div
                layout
                className="mb-6 rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-950"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-bold">{selectedProduct.name}</div>
                  {selectedProduct.featured ? (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400">
                      Featured
                    </span>
                  ) : null}
                  {selectedProduct.badge ? (
                    <span className="rounded-full bg-[color:var(--store-primary)]/10 px-2 py-0.5 text-[10px] font-semibold text-[color:var(--store-primary)]">
                      {selectedProduct.badge}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-sm text-zinc-500">
                  <span>{selectedProduct.durationDays} days</span>
                  {Number(selectedProduct.priceToman) > 0 ? (
                    <span className="font-semibold text-[color:var(--store-primary)]">
                      {Number(selectedProduct.priceToman).toLocaleString()} تومان
                    </span>
                  ) : null}
                  {Number(selectedProduct.priceUsd) > 0 ? (
                    <span className="font-semibold">${Number(selectedProduct.priceUsd)}</span>
                  ) : null}
                </div>
              </motion.div>
            ) : null}

            {step === 1 ? (
              <div className="space-y-5">
                {!selectedProduct ? (
                  <div className="space-y-3">
                    <div className="text-lg font-bold">Choose Product</div>
                    {!products.length ? (
                      <p className="rounded-2xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
                        No products are available right now.
                      </p>
                    ) : (
                      <div className="grid gap-3">
                        {products.map((product, index) => (
                          <motion.div
                            key={product.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.04, duration: 0.25 }}
                          >
                            <ProductCard
                              product={product}
                              onSelect={() => setSelectedProduct(product)}
                            />
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div>
                      <div className="text-lg font-bold">Customer Information</div>
                      <p className="mt-1 text-sm text-zinc-500">
                        New customers create a permanent profile. Returning customers can reuse their token.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <button
                        onClick={() => setHaveToken(true)}
                        className={`rounded-2xl border px-4 py-3 text-left ${haveToken ? "border-[color:var(--store-primary)] bg-[color:var(--store-primary)]/5" : "border-zinc-200 dark:border-zinc-800"}`}
                      >
                        <div className="font-semibold">Have Token</div>
                        <div className="mt-1 text-xs text-zinc-500">Load your customer profile</div>
                      </button>
                      <button
                        onClick={() => setHaveToken(false)}
                        className={`rounded-2xl border px-4 py-3 text-left ${!haveToken ? "border-[color:var(--store-primary)] bg-[color:var(--store-primary)]/5" : "border-zinc-200 dark:border-zinc-800"}`}
                      >
                        <div className="font-semibold">First Purchase</div>
                        <div className="mt-1 text-xs text-zinc-500">Create a new customer profile</div>
                      </button>
                    </div>
                    <label className="block text-sm font-medium">
                      Config Name
                      <input
                        value={form.configName}
                        onChange={(event) => setForm((current) => ({ ...current, configName: event.target.value }))}
                        className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 outline-none dark:border-zinc-800 dark:bg-zinc-950"
                      />
                    </label>
                    {haveToken ? (
                      <div className="space-y-3">
                        <div className="flex gap-2">
                          <input
                            value={form.customerToken}
                            onChange={(event) => setForm((current) => ({ ...current, customerToken: event.target.value.toUpperCase() }))}
                            placeholder="HM-XXXX-XXXX-XXXX"
                            className="flex-1 rounded-2xl border border-zinc-200 bg-white px-4 py-3 font-mono outline-none dark:border-zinc-800 dark:bg-zinc-950"
                          />
                          <PrimaryButton
                            className="w-auto px-5"
                            onClick={() => lookupCustomer.mutate(form.customerToken.trim())}
                            disabled={!form.customerToken.trim() || lookupCustomer.isPending}
                          >
                            Load
                          </PrimaryButton>
                        </div>
                        {lookupError ? <p className="text-sm text-red-500">{lookupError}</p> : null}
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Input label="Display Name" value={form.name} disabled />
                          <Input label="Telegram" value={form.telegram} disabled />
                          <Input label="WhatsApp" value={form.whatsapp} disabled />
                          <Input label="Email" value={form.email} disabled />
                        </div>
                      </div>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Input label="Display Name" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} />
                        <Input label="Telegram" value={form.telegram} onChange={(value) => setForm((current) => ({ ...current, telegram: value }))} />
                        <Input label="WhatsApp" value={form.whatsapp} onChange={(value) => setForm((current) => ({ ...current, whatsapp: value }))} />
                        <Input label="Email" value={form.email} onChange={(value) => setForm((current) => ({ ...current, email: value }))} />
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-4">
                <div>
                  <div className="text-lg font-bold">Payment</div>
                  <p className="mt-1 text-sm text-zinc-500">
                    Submit transaction ID, receipt image, or both.
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
                  <div
                    key={card.id}
                    className="rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-950"
                  >
                    <div className="text-sm font-semibold">
                      {card.bankName || "Card to Card"}
                    </div>
                    {card.cardNumber ? (
                      <div className="mt-2 font-mono text-lg tracking-wide">{card.cardNumber}</div>
                    ) : null}
                    {card.cardHolder ? (
                      <div className="mt-1 text-sm text-zinc-500">{card.cardHolder}</div>
                    ) : null}
                    {card.iban ? (
                      <div className="mt-1 font-mono text-xs text-zinc-500">{card.iban}</div>
                    ) : null}
                    {card.instructions ? (
                      <p className="mt-3 whitespace-pre-line text-sm text-zinc-500">
                        {card.instructions}
                      </p>
                    ) : null}
                  </div>
                ))}
                {!store.payment?.cards?.length &&
                !store.payment?.cardNumber &&
                !store.payment?.bankName ? (
                  <div className="rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-500 dark:bg-zinc-950">
                    Payment details are not configured yet.
                  </div>
                ) : null}
                <textarea
                  rows={3}
                  value={form.receiptText}
                  onChange={(event) => setForm((current) => ({ ...current, receiptText: event.target.value }))}
                  placeholder="Transaction ID or payment note"
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 outline-none dark:border-zinc-800 dark:bg-zinc-950"
                />
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-300 px-4 py-6 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
                  <Upload size={16} />
                  Upload receipt image
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        const resultValue = String(reader.result || "");
                        setForm((current) => ({ ...current, receiptImage: resultValue }));
                        setReceiptPreview(resultValue);
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
                {receiptPreview ? (
                  <img src={receiptPreview} alt="Receipt preview" className="max-h-48 rounded-2xl border border-zinc-200 object-cover dark:border-zinc-800" />
                ) : null}
              </div>
            ) : null}

            {step === 3 ? (
              <div className="space-y-3 text-sm">
                <SummaryRow label="Product" value={selectedProduct?.name || "-"} />
                <SummaryRow label="Customer" value={form.name || "Existing profile"} />
                <SummaryRow label="Config Name" value={form.configName} />
                <SummaryRow label="Transaction ID" value={form.receiptText || "Uploaded receipt only"} />
              </div>
            ) : null}

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <SecondaryButton
                onClick={() => {
                  if (step === 1) {
                    setStep(0);
                    setSelectedProduct(null);
                    return;
                  }
                  setStep((current) => Math.max(0, current - 1) as Step);
                }}
              >
                Back
              </SecondaryButton>
              {step < 3 ? (
                <PrimaryButton
                  onClick={() => setStep((current) => (current + 1) as Step)}
                  disabled={
                    (step === 1 && !canContinueProfile) ||
                    (step === 2 && !form.receiptText.trim() && !form.receiptImage)
                  }
                >
                  Continue
                </PrimaryButton>
              ) : (
                <PrimaryButton onClick={() => createOrder.mutate()} disabled={createOrder.isPending}>
                  {createOrder.isPending ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <LoaderCircle size={16} className="animate-spin" />
                      Submitting...
                    </span>
                  ) : (
                    "Submit Order"
                  )}
                </PrimaryButton>
              )}
            </div>
          </div>
        </motion.div>
      )}
      </AnimatePresence>
    </StoreShell>
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
    <div className="flex items-center justify-between rounded-2xl bg-zinc-50 px-4 py-3 dark:bg-zinc-950">
      <span className="text-zinc-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
