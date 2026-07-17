"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { publicApi, setCustomerSessionToken, getCustomerSessionToken } from "@/lib/api";
import {
  forceTelegramMiniApp,
  hasTelegramInitData,
  isTelegramUserAgent,
  loadTelegramScript,
  applyTelegramFullscreen,
} from "@/modules/storefront/tma/useTelegramWebApp";
import ShopPage from "./ShopPageClient";

/**
 * One storefront UI for web + Telegram.
 * Telegram only auto-signs-in and caches the session — no separate Mini App shell.
 */
function ShopRouter() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const forceTg = searchParams.get("tg") === "1";
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);

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
      if (wa) applyTelegramFullscreen(wa);

      // Already have a customer session — keep web UI
      if (getCustomerSessionToken()) {
        if (!cancelled) setReady(true);
        return;
      }

      let tries = 0;
      while (!cancelled && tries < 40) {
        if (hasTelegramInitData()) {
          const initData = window.Telegram?.WebApp?.initData || "";
          if (initData) {
            try {
              await silentLogin.mutateAsync({ slug, initData });
            } catch {
              /* show web shop anyway */
            }
          }
          break;
        }
        tries += 1;
        await new Promise((r) => window.setTimeout(r, 100));
      }

      if (!cancelled) setReady(true);
    };

    void boot();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, forceTg]);

  if (!ready) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <LoaderCircle className="animate-spin text-zinc-500" />
      </div>
    );
  }

  return <ShopPage />;
}

export default function ShopPageEntry() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center bg-zinc-50 dark:bg-zinc-950">
          <LoaderCircle className="animate-spin text-zinc-500" />
        </div>
      }
    >
      <ShopRouter />
    </Suspense>
  );
}
