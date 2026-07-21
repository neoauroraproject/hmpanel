"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { KeyRound, ArrowRight, LoaderCircle, ShoppingBag } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { publicApi } from "@/lib/api";
import { useCustomerSession } from "@/modules/storefront/session";
import { StoreShell, PrimaryButton, SecondaryButton, CategoryGrid } from "@/modules/storefront/ui";
import { usePortalTelegramGate } from "@/modules/storefront/tma/usePortalTelegramGate";
import { StorefrontLocaleProvider, useStorefrontLocale } from "@/modules/storefront/locale";
import { fadeUp, fadeUpTransition, Surface } from "@/modules/storefront/design";
import {
  rememberStoreSlug,
  portalPathForSlug,
  resolveStoreSlug,
  shopPathForSlug,
} from "@/modules/storefront/store-slug";
import type { StorefrontCategory, StorefrontStore } from "@/modules/storefront/types";

function PortalLoginForm({
  store,
  categories,
}: {
  store?: StorefrontStore | null;
  categories?: StorefrontCategory[];
}) {
  const router = useRouter();
  const { t, isFa } = useStorefrontLocale();
  const [token, setToken] = useState("");
  const { data, login, isLoading } = useCustomerSession();
  const visibleCategories = (categories || []).filter((c) => c?.id && c?.name);

  useEffect(() => {
    const incomingToken =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("token")
        : null;
    if (incomingToken && !login.isPending && !data) {
      setToken(incomingToken.toUpperCase());
      login.mutate(incomingToken);
    }
  }, [data, login]);

  useEffect(() => {
    if (data) {
      if (data.store?.slug) rememberStoreSlug(data.store.slug);
      router.replace(portalPathForSlug(data.store?.slug || resolveStoreSlug(), "dashboard"));
    }
  }, [data, router]);

  const goShop = (categoryId?: string) => {
    const slug = store?.slug || resolveStoreSlug();
    const base = shopPathForSlug(slug);
    if (categoryId) {
      router.push(`${base}?flow=buy&categoryId=${encodeURIComponent(categoryId)}`);
      return;
    }
    router.push(base);
  };

  return (
    <motion.div
      {...fadeUp}
      transition={fadeUpTransition}
      className={`flex min-h-[72dvh] items-center justify-center py-6 sm:py-12 ${
        isFa ? "font-[Vazirmatn,Tahoma,sans-serif]" : ""
      }`}
    >
      <Surface className="w-full max-w-md" padding="lg">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-[1.5rem] bg-[color:var(--store-primary)] text-white shadow-[0_16px_36px_-16px_var(--store-primary)]">
            <KeyRound size={28} />
          </div>
          <h1 className="text-[1.65rem] font-black tracking-tight text-zinc-900 dark:text-zinc-50">
            {t("ورود به پورتال", "Portal login")}
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-zinc-500">
            {t(
              "توکن وب مشتری را وارد کنید. داخل تلگرام مینی‌اپ خودکار وارد می‌شود.",
              "Enter your web customer token. Inside Telegram the Mini App signs you in automatically.",
            )}
          </p>
        </div>
        <div className="space-y-3.5">
          <input
            value={token}
            onChange={(e) => setToken(e.target.value.toUpperCase())}
            placeholder="HM-XXXX-XXXX-XXXX"
            dir="ltr"
            className="h-14 w-full rounded-2xl border border-black/[0.06] bg-[#F5F5F7] px-4 text-center font-mono text-[15px] tracking-wider outline-none transition focus:border-[color:var(--store-primary)] focus:ring-4 focus:ring-[color:var(--store-primary)]/15 dark:border-white/10 dark:bg-zinc-950"
            aria-label={t("توکن", "Token")}
          />
          <PrimaryButton
            onClick={() => token.trim() && login.mutate(token.trim())}
            disabled={!token.trim() || login.isPending || isLoading}
          >
            {login.isPending ? (
              <span className="inline-flex items-center gap-2">
                <LoaderCircle size={16} className="animate-spin" />
                {t("در حال ورود…", "Signing in…")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                {t("ادامه", "Continue")}{" "}
                <ArrowRight size={18} className={isFa ? "rotate-180" : ""} />
              </span>
            )}
          </PrimaryButton>
          <SecondaryButton onClick={() => goShop()}>
            <span className="inline-flex items-center justify-center gap-2">
              <ShoppingBag size={16} />
              {t("بازگشت به فروشگاه", "Back to store")}
            </span>
          </SecondaryButton>
          {login.error ? (
            <p className="text-center text-sm text-rose-500">
              {t("توکن پیدا نشد. دوباره بررسی کنید.", "Token not found. Check it and try again.")}
            </p>
          ) : null}
        </div>
        {visibleCategories.length ? (
          <div className="mt-8 border-t border-black/[0.05] pt-6 text-start dark:border-white/10">
            <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
              {t("دسته‌بندی‌ها", "Categories")}
            </div>
            <p className="mt-1 text-sm text-zinc-500">
              {t("بدون ورود هم می‌توانید سفارش دهید.", "You can order without logging in.")}
            </p>
            <div className="mt-3">
              <CategoryGrid
                categories={visibleCategories}
                onSelect={(category) => goShop(category.id)}
              />
            </div>
          </div>
        ) : null}
      </Surface>
    </motion.div>
  );
}

function PortalLoginBody() {
  const [slug, setSlug] = useState(() => resolveStoreSlug());

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const known = resolveStoreSlug();
      if (known) {
        setSlug(known);
        return;
      }
      try {
        const host = window.location.host;
        const res = await publicApi.get("/store/public/by-domain", {
          params: { domain: host },
        });
        const found = res.data?.store?.slug || "";
        if (!cancelled && found) {
          rememberStoreSlug(found);
          setSlug(found);
        }
      } catch {
        /* ignore */
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const { data: publicStore } = useQuery({
    queryKey: ["portal-login-store", slug],
    queryFn: async () => (await publicApi.get(`/store/public/${slug}`)).data,
    enabled: !!slug,
    retry: false,
  });

  const store = (publicStore?.store || (slug ? { slug, title: slug } : null)) as
    | StorefrontStore
    | null
    | undefined;
  const categories = (publicStore?.categories || []) as StorefrontCategory[];

  return (
    <StoreShell store={store || undefined} topBar={slug || undefined}>
      <PortalLoginForm store={store} categories={categories} />
    </StoreShell>
  );
}

export default function PortalEntryPage() {
  const router = useRouter();
  const gate = usePortalTelegramGate();

  useEffect(() => {
    if (gate.phase === "done") {
      if (gate.slug) rememberStoreSlug(gate.slug);
      router.replace(portalPathForSlug(gate.slug || resolveStoreSlug(), "dashboard"));
    }
  }, [gate.phase, gate.slug, router]);

  if (gate.isBusy || gate.phase === "checking" || gate.phase === "authing") {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-[#F5F5F7] dark:bg-[#0B0B0F]">
        <LoaderCircle className="animate-spin text-zinc-400" />
        <p className="text-sm text-zinc-500">ورود با تلگرام…</p>
      </div>
    );
  }

  if (gate.phase === "error") {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-[#F5F5F7] px-6 text-center dark:bg-[#0B0B0F]">
        <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-300">
          {gate.error || "Open the Mini App from the store bot (Open button)."}
        </p>
        <p className="text-xs text-zinc-400">
          مینی‌اپ را از دکمه Open داخل ربات فروشگاه باز کنید — فرم توکن فقط برای وب است.
        </p>
      </div>
    );
  }

  return (
    <StorefrontLocaleProvider>
      <PortalLoginBody />
    </StorefrontLocaleProvider>
  );
}
