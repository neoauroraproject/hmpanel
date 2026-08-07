"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { publicApi, setCustomerSessionToken, getCustomerSessionToken } from "@/lib/api";
import { slugFromPathname } from "@/modules/storefront/store-slug";
import {
  applyTelegramFullscreen,
  applyTelegramSafeArea,
  forceTelegramMiniApp,
  isTelegramUserAgent,
  loadTelegramScript,
  waitForTelegramInitData,
} from "./useTelegramWebApp";

/**
 * Silent Telegram login for portal routes.
 * Resolves store slug from path/query/domain, then creates session from initData.
 */
export function usePortalTelegramGate(opts?: { redirectSlug?: string | null }) {
  const queryClient = useQueryClient();
  const booted = useRef(false);
  const [phase, setPhase] = useState<"idle" | "checking" | "authing" | "done" | "skip" | "error">(
    "checking",
  );
  const [error, setError] = useState<string | null>(null);
  const [resolvedSlug, setResolvedSlug] = useState<string | null>(opts?.redirectSlug || null);

  const silentLogin = useMutation({
    mutationFn: async (payload: { slug: string; initData: string }) =>
      (await publicApi.post("/store/telegram/session", payload)).data as {
        sessionToken: string;
        store?: { slug?: string };
      },
    onSuccess: async (data) => {
      setCustomerSessionToken(data.sessionToken);
      await queryClient.invalidateQueries({ queryKey: ["customer-session"] });
      if (data.store?.slug) setResolvedSlug(data.store.slug);
      setPhase("done");
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message || err?.message || "Telegram sign-in failed");
      setPhase("error");
    },
  });

  useEffect(() => {
    let cancelled = false;

    const resolveSlug = async (): Promise<string> => {
      const params = new URLSearchParams(window.location.search);
      let slug =
        opts?.redirectSlug ||
        params.get("slug") ||
        slugFromPathname(window.location.pathname) ||
        "";

      if (!slug) {
        try {
          const host = window.location.host;
          const res = await publicApi.get("/store/public/by-domain", {
            params: { domain: host },
          });
          slug = res.data?.store?.slug || "";
        } catch {
          /* ignore */
        }
      }
      return slug;
    };

    const run = async () => {
      if (typeof window === "undefined") return;
      setPhase("checking");

      const forced = forceTelegramMiniApp();
      const maybeTg = forced || isTelegramUserAgent();

      // Load SDK BEFORE deciding skip — initData is only available after the script runs.
      if (maybeTg) {
        try {
          await loadTelegramScript();
        } catch {
          /* continue — may already be injected by layout */
        }
        if (cancelled) return;
        applyTelegramFullscreen(window.Telegram?.WebApp);
        applyTelegramSafeArea(window.Telegram?.WebApp);
        window.setTimeout(() => {
          if (!cancelled) applyTelegramSafeArea(window.Telegram?.WebApp);
        }, 300);
        window.setTimeout(() => {
          if (!cancelled) applyTelegramSafeArea(window.Telegram?.WebApp);
        }, 1000);
      }

      let initData = window.Telegram?.WebApp?.initData || "";
      if (maybeTg && !initData) {
        try {
          initData = await waitForTelegramInitData({
            timeoutMs: forced ? 5500 : 2500,
            isCancelled: () => cancelled,
          });
        } catch {
          initData = window.Telegram?.WebApp?.initData || "";
        }
      }
      if (cancelled) return;

      const inTg = forced || Boolean(initData);

      // Prefer fresh Telegram session whenever we have signed initData.
      if (inTg && initData) {
        const slug = await resolveSlug();
        if (cancelled) return;
        if (!slug) {
          setError("Open the Mini App from the store bot (Open button).");
          setPhase("error");
          return;
        }
        setResolvedSlug(slug);
        if (booted.current) return;
        booted.current = true;
        setPhase("authing");
        silentLogin.mutate({ slug, initData });
        return;
      }

      // Already signed in on web (or TG without initData yet)
      if (getCustomerSessionToken()) {
        const slug = await resolveSlug();
        if (!cancelled && slug) setResolvedSlug(slug);
        setPhase(inTg ? "done" : "skip");
        return;
      }

      // Browser / web portal — show token form
      if (!inTg) {
        const slug = await resolveSlug();
        if (!cancelled && slug) setResolvedSlug(slug);
        setPhase("skip");
        return;
      }

      // Forced Mini App but initData never arrived
      setError("Open the Mini App from the store bot inside Telegram.");
      setPhase("error");
    };

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    phase,
    error,
    slug: resolvedSlug,
    inTelegram: phase !== "skip" && phase !== "idle",
    isBusy: phase === "checking" || phase === "authing",
  };
}
