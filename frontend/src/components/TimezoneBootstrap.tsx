"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { setDisplayTimezone } from "@/lib/format";
import { DEFAULT_DISPLAY_TIMEZONE } from "@/lib/timezone";
import { useAuth } from "@/store/auth";

/** Loads panel display_timezone into format helpers for the session. */
export function TimezoneBootstrap() {
  const token = useAuth((s) => s.token);
  const { data } = useQuery({
    queryKey: ["display-timezone"],
    queryFn: async () => {
      try {
        const res = await api.get<{ timezone?: string }>("/settings/display-timezone");
        return res.data?.timezone || DEFAULT_DISPLAY_TIMEZONE;
      } catch {
        try {
          const all = await api.get<Record<string, unknown>>("/settings");
          const tz = all.data?.display_timezone;
          return typeof tz === "string" && tz ? tz : DEFAULT_DISPLAY_TIMEZONE;
        } catch {
          return DEFAULT_DISPLAY_TIMEZONE;
        }
      }
    },
    enabled: !!token,
    staleTime: 60_000,
    retry: false,
  });

  useEffect(() => {
    if (data) setDisplayTimezone(data);
  }, [data]);

  return null;
}
