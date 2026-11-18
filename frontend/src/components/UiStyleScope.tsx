"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  FALLBACK_UI_NAV,
  FALLBACK_UI_STYLE,
  applyUiAttributes,
  clearUiAttributes,
  parseUiNav,
  parseUiStyle,
} from "@/lib/ui-style";
import { useAuth } from "@/store/auth";
import { useUiStyle, useUiStyleStore } from "@/store/uiStyle";

/**
 * Mount inside the admin shell. Keeps <html data-ui> in sync with the effective look and
 * removes it again on unmount, so storefront / portal / public pages never inherit it.
 */
export function UiStyleScope() {
  const token = useAuth((s) => s.token);
  const hydrate = useUiStyleStore((s) => s.hydrate);
  const setPanelDefault = useUiStyleStore((s) => s.setPanelDefault);
  const { style, nav, hydrated } = useUiStyle();

  useEffect(() => hydrate(), [hydrate]);

  const { data } = useQuery({
    queryKey: ["settings", "ui-preferences"],
    queryFn: async () =>
      (await api.get<{ style?: string; nav?: string }>("/settings/ui-preferences")).data,
    enabled: !!token,
    staleTime: 60_000,
    retry: false,
  });

  useEffect(() => {
    if (!data) return;
    setPanelDefault(
      parseUiStyle(data.style) ?? FALLBACK_UI_STYLE,
      parseUiNav(data.nav) ?? FALLBACK_UI_NAV,
    );
  }, [data, setPanelDefault]);

  useEffect(() => {
    if (!hydrated) return;
    applyUiAttributes(style, nav);
  }, [hydrated, style, nav]);

  useEffect(() => clearUiAttributes, []);

  return null;
}
