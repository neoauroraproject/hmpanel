"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  publicApi,
  setCustomerSessionToken,
  getCustomerSessionToken,
} from "@/lib/api";
import type { CustomerDashboard } from "./types";

export function useCustomerSession() {
  const queryClient = useQueryClient();

  const sessionQuery = useQuery<CustomerDashboard>({
    queryKey: ["customer-session"],
    queryFn: async () => (await publicApi.get("/store/customer/session")).data,
    retry: false,
    enabled: typeof window !== "undefined" && !!getCustomerSessionToken(),
    refetchInterval: 20_000,
  });

  const login = useMutation({
    mutationFn: async (token: string) =>
      (await publicApi.post("/store/customer/session", { token })).data,
    onSuccess: async (data) => {
      setCustomerSessionToken(data.sessionToken);
      await queryClient.invalidateQueries({ queryKey: ["customer-session"] });
    },
  });

  const logout = useMutation({
    mutationFn: async () => (await publicApi.post("/store/customer/logout")).data,
    onSettled: async () => {
      setCustomerSessionToken(null);
      await queryClient.removeQueries({ queryKey: ["customer-session"] });
    },
  });

  const markNotificationRead = useMutation({
    mutationFn: async (notificationId: string) =>
      (await publicApi.post(`/store/customer/notifications/${notificationId}/read`)).data,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["customer-session"] });
    },
  });

  const markAllNotificationsRead = useMutation({
    mutationFn: async () =>
      (await publicApi.post(`/store/customer/notifications/read-all`)).data,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["customer-session"] });
    },
  });

  const cancelOrder = useMutation({
    mutationFn: async (orderId: string) =>
      (await publicApi.post(`/store/customer/orders/${orderId}/cancel`)).data,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["customer-session"] });
    },
  });

  const claimService = useMutation({
    mutationFn: async (subscriptionLink: string) =>
      (
        await publicApi.post("/store/customer/services/claim", {
          subscriptionLink,
        })
      ).data as { service: CustomerDashboard["services"][0]; dashboard: CustomerDashboard },
    onSuccess: async (data) => {
      queryClient.setQueryData(["customer-session"], data.dashboard);
      await queryClient.invalidateQueries({ queryKey: ["customer-session"] });
    },
  });

  const hideService = useMutation({
    mutationFn: async (clientId: string) =>
      (
        await publicApi.post(`/store/customer/services/${encodeURIComponent(clientId)}/hide`)
      ).data as { dashboard: CustomerDashboard },
    onSuccess: async (data) => {
      if (data?.dashboard) {
        queryClient.setQueryData(["customer-session"], data.dashboard);
      }
      await queryClient.invalidateQueries({ queryKey: ["customer-session"] });
    },
  });

  return {
    ...sessionQuery,
    login,
    logout,
    markNotificationRead,
    markAllNotificationsRead,
    cancelOrder,
    claimService,
    hideService,
  };
}
