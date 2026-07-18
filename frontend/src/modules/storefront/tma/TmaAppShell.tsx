"use client";

/**
 * Legacy Mini App shell — kept only as a thin adapter.
 * Always shows the same responsive web storefront; Telegram only auto-logs in.
 */
import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { publicApi, setCustomerSessionToken, getCustomerSessionToken } from "@/lib/api";
import {
  applyTelegramFullscreen,
  applyTelegramSafeArea,
  loadTelegramScript,
} from "./useTelegramWebApp";
import { portalPathForSlug } from "../store-slug";
import ShopPage from "../../../app/shop/[slug]/ShopPageClient";

export default function TmaAppShell({ slug }: { slug: string }) {
  const router = useRouter();
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

      if (!getCustomerSessionToken()) {
        let tries = 0;
        while (!cancelled && tries < 40) {
          const initData = window.Telegram?.WebApp?.initData || "";
          if (initData) {
            try {
              await silentLogin.mutateAsync({ slug, initData });
            } catch {
              /* show storefront anyway */
            }
            break;
          }
          tries += 1;
          await new Promise((r) => window.setTimeout(r, 100));
        }
      }

      // After silent login, land on the same portal dashboard as the web responsive app
      if (!cancelled && getCustomerSessionToken()) {
        router.replace(portalPathForSlug(slug, "dashboard"));
        return;
      }

      if (!cancelled) setReady(true);
    };

    void boot();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (!ready) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <LoaderCircle className="animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center bg-zinc-50 dark:bg-zinc-950">
          <LoaderCircle className="animate-spin text-zinc-500" />
        </div>
      }
    >
      <ShopPage />
    </Suspense>
  );
}
