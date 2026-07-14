"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import TmaAppShell from "@/modules/storefront/tma/TmaAppShell";
import {
  forceTelegramMiniApp,
  hasTelegramInitData,
  isTelegramUserAgent,
  loadTelegramScript,
  applyTelegramFullscreen,
} from "@/modules/storefront/tma/useTelegramWebApp";
import ShopPage from "./ShopPageClient";

function ShopRouter() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const forceTg = searchParams.get("tg") === "1";
  const [mode, setMode] = useState<"checking" | "tma" | "web">("checking");

  useEffect(() => {
    let cancelled = false;

    const pickTma = () => {
      if (cancelled) return;
      const wa = window.Telegram?.WebApp;
      if (wa) applyTelegramFullscreen(wa);
      setMode("tma");
    };

    const pickWeb = () => {
      if (!cancelled) setMode("web");
    };

    const run = async () => {
      // Regular browser (no ?tg=1): always web storefront with token checkout
      if (!forceTg && !forceTelegramMiniApp() && !isTelegramUserAgent()) {
        pickWeb();
        return;
      }

      // Mini App path: bot Open (?tg=1) or Telegram in-app browser
      try {
        await loadTelegramScript();
      } catch {
        /* continue */
      }
      if (cancelled) return;

      if (hasTelegramInitData()) {
        pickTma();
        return;
      }

      // Wait briefly for initData — never fall back to blocking Retry forever in browser
      let tries = 0;
      const t = window.setInterval(() => {
        if (cancelled) {
          window.clearInterval(t);
          return;
        }
        tries += 1;
        if (hasTelegramInitData()) {
          window.clearInterval(t);
          pickTma();
          return;
        }
        if (forceTg) {
          // Still in Mini App intent — keep TMA shell (shows Retry with initData help)
          if (tries >= 40) {
            window.clearInterval(t);
            pickTma();
          }
          return;
        }
        // Telegram UA but no initData → open web storefront (token flow)
        if (tries >= 25) {
          window.clearInterval(t);
          pickWeb();
        }
      }, 100);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [searchParams, forceTg]);

  if (mode === "checking") {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <LoaderCircle className="animate-spin text-zinc-500" />
      </div>
    );
  }

  if (mode === "tma") {
    return <TmaAppShell slug={slug} />;
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
