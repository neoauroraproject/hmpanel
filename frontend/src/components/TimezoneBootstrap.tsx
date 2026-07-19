"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { setDisplayTimezone } from "@/lib/format";
import { DEFAULT_DISPLAY_TIMEZONE } from "@/lib/timezone";
import { useAuth } from "@/store/auth";

/** Loads display_timezone from settings once authenticated and applies it to format helpers. */
export function TimezoneBootstrap() {
  const token = useAuth((s) => s.token);

  const { data } = useQuery({
    queryKey: ["settings", "display_timezone"],
    queryFn: async () => (await api.get<Record<string, string>>("/settings")).data,
    enabled: !!token,
    staleTime: 60_000,
    retry: false,
  });

  useEffect(() => {
    if (!data) return;
    setDisplayTimezone(data.display_timezone || DEFAULT_DISPLAY_TIMEZONE);
  }, [data]);

  return null;
}
