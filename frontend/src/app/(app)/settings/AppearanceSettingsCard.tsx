"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PanelLeft, PanelTop, Save, SwatchBook } from "lucide-react";
import { api } from "@/lib/api";
import { Card, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useT } from "@/i18n";
import { AppearanceControls, Segmented } from "@/components/AppearanceMenu";
import {
  FALLBACK_UI_NAV,
  FALLBACK_UI_STYLE,
  UI_NAV_SETTING_KEY,
  UI_STYLE_SETTING_KEY,
  parseUiNav,
  parseUiStyle,
  type UiNav,
  type UiStyle,
} from "@/lib/ui-style";
import { useUiStyleStore } from "@/store/uiStyle";

/** Super-admin card: your own look for this browser, plus the default everyone else gets. */
export function AppearanceSettingsCard({ settings }: { settings: Record<string, unknown> | undefined }) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);
  const setPanelDefault = useUiStyleStore((s) => s.setPanelDefault);

  const savedStyle = parseUiStyle(settings?.[UI_STYLE_SETTING_KEY]) ?? FALLBACK_UI_STYLE;
  const savedNav = parseUiNav(settings?.[UI_NAV_SETTING_KEY]) ?? FALLBACK_UI_NAV;
  // A draft only counts while it was made against the currently saved value, so a fresh
  // save (or another admin's change) resets the controls without a syncing effect.
  const savedKey = `${savedStyle}|${savedNav}`;
  const [draft, setDraft] = useState<{ key: string; style: UiStyle; nav: UiNav } | null>(null);
  const live = draft && draft.key === savedKey ? draft : null;
  const style = live?.style ?? savedStyle;
  const nav = live?.nav ?? savedNav;
  const setStyle = (next: UiStyle) => setDraft({ key: savedKey, style: next, nav });
  const setNav = (next: UiNav) => setDraft({ key: savedKey, style, nav: next });

  const save = useMutation({
    mutationFn: async () =>
      (await api.post("/settings", { [UI_STYLE_SETTING_KEY]: style, [UI_NAV_SETTING_KEY]: nav })).data,
    onSuccess: () => {
      setPanelDefault(style, nav);
      toast(t("appearance.defaultSaved"));
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: () => toast(t("settings.saveFailed"), "error"),
  });

  const dirty = style !== savedStyle || nav !== savedNav;

  return (
    <Card className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-lg bg-blue-500/10 p-2 text-blue-500">
          <SwatchBook size={20} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">{t("appearance.title")}</h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{t("appearance.cardHint")}</p>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <section>
          <h4 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100">{t("appearance.mineTitle")}</h4>
          <AppearanceControls />
          <p className="mt-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{t("appearance.personalHint")}</p>
        </section>

        <section className="sm:border-s sm:border-zinc-200 sm:ps-6 dark:sm:border-zinc-800">
          <h4 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100">{t("appearance.defaultTitle")}</h4>
          <div className="space-y-3">
            <Segmented<UiStyle>
              label={t("appearance.styleLabel")}
              value={style}
              onChange={setStyle}
              options={[
                { id: "classic", label: t("appearance.classic") },
                { id: "modern", label: t("appearance.modern") },
              ]}
            />
            {style === "modern" ? (
              <Segmented<UiNav>
                label={t("appearance.navLabel")}
                value={nav}
                onChange={setNav}
                options={[
                  { id: "top", label: t("appearance.navTop"), icon: PanelTop },
                  { id: "side", label: t("appearance.navSide"), icon: PanelLeft },
                ]}
              />
            ) : null}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{t("appearance.defaultHint")}</p>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => save.mutate()}
              disabled={!dirty || save.isPending}
              className="flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {save.isPending ? <Spinner className="h-4 w-4" /> : <Save size={16} />}
              {t("appearance.saveDefault")}
            </button>
          </div>
        </section>
      </div>
    </Card>
  );
}
