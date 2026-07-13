"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import TmaAppShell from "@/modules/storefront/tma/TmaAppShell";
import {
  forceTelegramMiniApp,
  isTelegramContext,
  isTelegramUserAgent,
  isTelegramWebAppPresent,
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

    const run = async () => {
      // Never show web token checkout when opened as Mini App
      if (forceTg || forceTelegramMiniApp() || isTelegramContext() || isTelegramWebAppPresent()) {
        pickTma();
        try {
          await loadTelegramScript();
          if (!cancelled) applyTelegramFullscreen(window.Telegram?.WebApp);
        } catch {
          /* ignore */
        }
        return;
      }

      try {
        await loadTelegramScript();
      } catch {
        /* ignore */
      }
      if (cancelled) return;

      if (isTelegramContext() || isTelegramWebAppPresent() || isTelegramUserAgent()) {
        pickTma();
        return;
      }

      let tries = 0;
      const t = window.setInterval(() => {
        if (cancelled) {
          window.clearInterval(t);
          return;
        }
        tries += 1;
        if (isTelegramContext() || isTelegramWebAppPresent() || isTelegramUserAgent()) {
          window.clearInterval(t);
          pickTma();
          return;
        }
        // If URL forced Mini App, never fall back to web token UI
        if (forceTg) {
          if (tries >= 60) {
            window.clearInterval(t);
            pickTma();
          }
          return;
        }
        if (tries >= 50) {
          window.clearInterval(t);
          setMode("web");
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
