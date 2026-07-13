"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { publicApi, setCustomerSessionToken } from "@/lib/api";
import type { CustomerDashboard } from "../types";
import { useTelegramWebApp } from "./useTelegramWebApp";

export function useTelegramSession(slug: string) {
  const queryClient = useQueryClient();
  const { ready, initData, user, haptic, webApp } = useTelegramWebApp();
  const booted = useRef(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [waitTicks, setWaitTicks] = useState(0);

  const silentLogin = useMutation({
    mutationFn: async (payload: { slug: string; initData: string }) =>
      (await publicApi.post("/store/telegram/session", payload)).data as {
        sessionToken: string;
        dashboard: CustomerDashboard;
      },
    onSuccess: async (data) => {
      setCustomerSessionToken(data.sessionToken);
      setSessionReady(true);
      queryClient.setQueryData(["customer-session", "tma", slug], data.dashboard);
      await queryClient.invalidateQueries({ queryKey: ["customer-session"] });
      haptic("success");
    },
  });

  const sessionQuery = useQuery<CustomerDashboard>({
    queryKey: ["customer-session", "tma", slug],
    queryFn: async () => (await publicApi.get("/store/customer/session")).data,
    retry: false,
    enabled: sessionReady,
    refetchInterval: 20_000,
  });

  // Wait for initData — Telegram sometimes populates it after ready()
  useEffect(() => {
    if (!ready || initData || booted.current) return;
    if (waitTicks >= 40) return;
    const t = window.setTimeout(() => setWaitTicks((n) => n + 1), 100);
    return () => window.clearTimeout(t);
  }, [ready, initData, waitTicks]);

  useEffect(() => {
    if (!ready || !slug || booted.current || silentLogin.isPending) return;
    const data = initData || webApp?.initData || "";
    if (!data) return;
    booted.current = true;
    silentLogin.mutate({ slug, initData: data });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, slug, initData, waitTicks, webApp]);

  const markNotificationRead = useMutation({
    mutationFn: async (notificationId: string) =>
      (await publicApi.post(`/store/customer/notifications/${notificationId}/read`)).data,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["customer-session", "tma", slug] });
    },
  });

  const cancelOrder = useMutation({
    mutationFn: async (orderId: string) =>
      (await publicApi.post(`/store/customer/orders/${orderId}/cancel`)).data,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["customer-session", "tma", slug] });
    },
  });

  const stillWaitingInit = ready && !initData && !webApp?.initData && waitTicks < 40;
  const waitingForInit =
    ready &&
    !initData &&
    !webApp?.initData &&
    waitTicks >= 40 &&
    !silentLogin.data &&
    !silentLogin.isPending &&
    !silentLogin.isSuccess;

  const authenticating =
    (!ready || stillWaitingInit || silentLogin.isPending) &&
    !waitingForInit &&
    !silentLogin.isError;

  return {
    ...sessionQuery,
    data: sessionQuery.data || silentLogin.data?.dashboard,
    silentLogin,
    markNotificationRead,
    cancelOrder,
    user,
    haptic,
    authenticating,
    authError:
      silentLogin.error ||
      (waitingForInit
        ? new Error("Open this Mini App from the store bot inside Telegram (Open button).")
        : null),
  };
}
