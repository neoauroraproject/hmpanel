"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { setDisplayTimezone, applyDisplayCalendar } from "@/lib/format";
import {
  DEFAULT_DISPLAY_TIMEZONE,
  DEFAULT_DISPLAY_CALENDAR,
} from "@/lib/timezone";
import { useAuth } from "@/store/auth";

/**
 * Loads display timezone + calendar for any authenticated user
 * (GET /settings/display-timezone — not SUPER_ADMIN-only).
 */
export function TimezoneBootstrap() {
  const token = useAuth((s) => s.token);

  const { data } = useQuery({
    queryKey: ["settings", "display-timezone"],
    queryFn: async () =>
      (
        await api.get<{ timezone?: string; calendar?: string }>(
          "/settings/display-timezone",
        )
      ).data,
    enabled: !!token,
    staleTime: 60_000,
    retry: false,
  });

  useEffect(() => {
    if (!data) return;
    setDisplayTimezone(data.timezone || DEFAULT_DISPLAY_TIMEZONE);
    applyDisplayCalendar(data.calendar || DEFAULT_DISPLAY_CALENDAR);
  }, [data]);

  return null;
}
