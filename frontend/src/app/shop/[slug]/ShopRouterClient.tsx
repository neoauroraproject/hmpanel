"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { publicApi, setCustomerSessionToken, getCustomerSessionToken } from "@/lib/api";
import {
  forceTelegramMiniApp,
  isTelegramUserAgent,
  loadTelegramScript,
  applyTelegramFullscreen,
  applyTelegramSafeArea,
  waitForTelegramInitData,
  withTgQuery,
} from "@/modules/storefront/tma/useTelegramWebApp";
import { portalPathForSlug } from "@/modules/storefront/store-slug";
import ShopPage from "./ShopPageClient";

/**
 * One storefront UI for web + Telegram.
 * Telegram only auto-signs-in and applies safe-area — no separate Mini App shell.
 */
function ShopRouter() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const forceTg = searchParams.get("tg") === "1";
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  const silentLogin = useMutation({
    mutationFn: async (payload: { slug: string; initData: string }) =>
      (await publicApi.post("/store/telegram/session", payload)).data as {
        sessionToken: string;
      },
    onSuccess: async (data) => {
      setCustomerSessionToken(data.sessionToken);
      await queryClient.invalidateQueries({ queryKey: ["customer-session"] });
    },
  });

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      const wantTg = forceTg || forceTelegramMiniApp() || isTelegramUserAgent();
      if (!wantTg) {
        if (!cancelled) setReady(true);
        return;
      }

      try {
        await loadTelegramScript();
      } catch {
        /* continue */
      }
      if (cancelled) return;

      const wa = window.Telegram?.WebApp;
      if (wa) {
        applyTelegramFullscreen(wa);
        applyTelegramSafeArea(wa);
        window.setTimeout(() => {
          if (!cancelled) applyTelegramSafeArea(wa);
        }, 300);
        window.setTimeout(() => {
          if (!cancelled) applyTelegramSafeArea(wa);
        }, 1000);
      }

      // Always refresh TG session when we can — signed initData string is required.
      let initData = "";
      try {
        initData = await waitForTelegramInitData({
          timeoutMs: forceTg ? 5500 : 2500,
          isCancelled: () => cancelled,
        });
      } catch {
        initData = window.Telegram?.WebApp?.initData || "";
      }
      if (cancelled) return;

      if (initData) {
        try {
          await silentLogin.mutateAsync({ slug, initData });
        } catch (err: any) {
          if (forceTg && !getCustomerSessionToken()) {
            if (!cancelled) {
              setBootError(
                err?.response?.data?.message ||
                  err?.message ||
                  "Telegram sign-in failed. Close and reopen from the bot menu.",
              );
            }
            return;
          }
        }
      } else if (forceTg && !getCustomerSessionToken()) {
        if (!cancelled) {
          setBootError("Open this Mini App from the store bot inside Telegram.");
        }
        return;
      }

      // Same destination as web: customer portal dashboard when session exists
      if (!cancelled && getCustomerSessionToken()) {
        router.replace(withTgQuery(portalPathForSlug(slug, "dashboard")));
        return;
      }

      if (!cancelled) setReady(true);
    };

    void boot();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, forceTg]);

  if (bootError) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-[#F5F5F7] px-6 text-center dark:bg-[#0B0B0F]">
        <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-300">{bootError}</p>
        <p className="text-xs text-zinc-400">
          مینی‌اپ را از دکمه منوی ربات فروشگاه دوباره باز کنید.
        </p>
        <button
          type="button"
          className="mt-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
          onClick={() => {
            setBootError(null);
            setReady(false);
            window.location.href = withTgQuery(`/shop/${encodeURIComponent(slug)}`);
          }}
        >
          تلاش مجدد
        </button>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-[#F5F5F7] dark:bg-[#0B0B0F]">
        <LoaderCircle className="animate-spin text-zinc-500" />
        <p className="text-sm text-zinc-500">ورود با تلگرام…</p>
      </div>
    );
  }

  return <ShopPage />;
}

export default function ShopPageEntry() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-[#F5F5F7] dark:bg-[#0B0B0F]">
          <LoaderCircle className="animate-spin text-zinc-500" />
          <p className="text-sm text-zinc-500">ورود با تلگرام…</p>
        </div>
      }
    >
      <ShopRouter />
    </Suspense>
  );
}
