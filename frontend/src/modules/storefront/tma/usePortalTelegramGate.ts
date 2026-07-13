"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { publicApi, setCustomerSessionToken, getCustomerSessionToken } from "@/lib/api";
import {
  applyTelegramFullscreen,
  forceTelegramMiniApp,
  isTelegramContext,
  loadTelegramScript,
} from "./useTelegramWebApp";

/**
 * Silent Telegram login for portal routes.
 * Resolves store slug from query, then by-domain, then creates session from initData.
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

    const run = async () => {
      if (typeof window === "undefined") return;

      const inTg = forceTelegramMiniApp() || isTelegramContext();

      // Already signed in (web or prior TG session)
      if (getCustomerSessionToken()) {
        if (inTg) {
          setPhase("done");
        } else {
          setPhase("skip");
        }
        return;
      }

      // Browser / web portal — show token form
      if (!inTg) {
        setPhase("skip");
        return;
      }

      setPhase("checking");
      try {
        await loadTelegramScript();
      } catch {
        /* continue */
      }
      if (cancelled) return;
      applyTelegramFullscreen(window.Telegram?.WebApp);

      // Resolve slug
      const params = new URLSearchParams(window.location.search);
      let slug = opts?.redirectSlug || params.get("slug") || "";

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

      if (!slug) {
        // Wait for initData a bit then fail clearly — never show token form in TG
        setError("Open the Mini App from the store bot (Open button).");
        setPhase("error");
        return;
      }

      setResolvedSlug(slug);

      // Wait for initData
      let ticks = 0;
      const waitInit = (): Promise<string> =>
        new Promise((resolve, reject) => {
          const tick = () => {
            if (cancelled) return;
            const data = window.Telegram?.WebApp?.initData || "";
            if (data) {
              resolve(data);
              return;
            }
            ticks += 1;
            if (ticks >= 50) {
              reject(new Error("Open this Mini App from the store bot inside Telegram."));
              return;
            }
            window.setTimeout(tick, 100);
          };
          tick();
        });

      try {
        const initData = await waitInit();
        if (cancelled || booted.current) return;
        booted.current = true;
        setPhase("authing");
        silentLogin.mutate({ slug, initData });
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || "Telegram sign-in failed");
        setPhase("error");
      }
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
