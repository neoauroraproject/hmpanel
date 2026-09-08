"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Check,
  ExternalLink,
  Palette,
  Save,
  Sparkles,
  Upload,
} from "lucide-react";
import { api } from "@/lib/api";
import { Spinner, ErrorBox } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useT } from "@/i18n";
import { clsx } from "clsx";

type ThemeRow = {
  id: string;
  slug: string;
  name: string;
  status: string;
  description?: string | null;
  settings?: {
    skin?: string;
    layout?: string;
    customCss?: string;
    preview?: { accent?: string; bg?: string; label?: string };
  } | null;
};

type Starter = {
  key: string;
  slug: string;
  name: string;
  description: string;
  preview?: { accent?: string; bg?: string; label?: string };
  settings?: { skin?: string; layout?: string };
};

type Assignment = {
  themeId: string | null;
  store: { id: string; slug: string; title: string } | null;
};

const SAMPLE_JSON = `{
  "skin": "atelier",
  "layout": "classic",
  "cssVars": { "--store-radius": "0.75rem" },
  "copy": { "headline": { "en": "Pick a plan", "fa": "یک پلن انتخاب کنید" } }
}`;

export default function ThemesPage() {
  const t = useT();
  const toast = useToast((s) => s.push);
  const qc = useQueryClient();
  const importRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [customCss, setCustomCss] = useState("");
  const [customJson, setCustomJson] = useState(SAMPLE_JSON);
  const [initialized, setInitialized] = useState(false);

  const { data, isLoading, error } = useQuery<ThemeRow[]>({
    queryKey: ["themes"],
    queryFn: async () => (await api.get("/themes")).data,
    retry: false,
  });

  const { data: starters = [] } = useQuery<Starter[]>({
    queryKey: ["themes-starters"],
    queryFn: async () => (await api.get("/themes/starters")).data,
    retry: false,
  });

  const { data: assignment } = useQuery<Assignment>({
    queryKey: ["themes-storefront"],
    queryFn: async () => (await api.get("/themes/storefront")).data,
    retry: false,
  });

  useEffect(() => {
    if (initialized || !assignment) return;
    setPicked(assignment.themeId);
    setInitialized(true);
    const custom = (data || []).find((row) => row.slug.startsWith("custom-"));
    if (custom?.settings?.customCss) setCustomCss(String(custom.settings.customCss));
  }, [assignment, data, initialized]);

  const installedBySlug = useMemo(() => {
    const map = new Map<string, ThemeRow>();
    for (const row of data || []) map.set(row.slug, row);
    const noir = map.get("starter-noir");
    if (noir && !map.has("starter-pulse")) map.set("starter-pulse", noir);
    const harbor = map.get("starter-harbor");
    if (harbor && !map.has("starter-lumen")) map.set("starter-lumen", harbor);
    return map;
  }, [data]);

  const invalidateAll = () => {
    void qc.invalidateQueries({ queryKey: ["themes"] });
    void qc.invalidateQueries({ queryKey: ["themes-published"] });
    void qc.invalidateQueries({ queryKey: ["themes-storefront"] });
    void qc.invalidateQueries({ queryKey: ["themes-starters"] });
  };

  const assign = useMutation({
    mutationFn: async (themeId: string | null) =>
      (await api.post("/themes/storefront", { themeId })).data,
    onSuccess: () => {
      invalidateAll();
      toast(t("themes.storefrontSaved"));
    },
    onError: (err: any) => {
      toast(err?.response?.data?.message || t("themes.storefrontNoStore"), "error");
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!picked) return assign.mutateAsync(null);
      const starter = starters.find((s) => s.key === picked || installedBySlug.get(s.slug)?.id === picked);
      if (starter) {
        const installed = (await api.post(`/themes/starters/${starter.key}/install`)).data;
        return api.post("/themes/storefront", { themeId: installed.id }).then((r) => r.data);
      }
      return assign.mutateAsync(picked);
    },
    onSuccess: () => {
      invalidateAll();
      toast(t("themes.storefrontSaved"));
    },
    onError: (err: any) => {
      toast(err?.response?.data?.message || t("common.error"), "error");
    },
  });

  const saveCustom = useMutation({
    mutationFn: async () => {
      let settings: Record<string, unknown> = {};
      try {
        settings = JSON.parse(customJson || "{}");
      } catch {
        throw new Error(t("themes.customJsonInvalid"));
      }
      const row = (
        await api.post("/themes/custom", {
          customCss,
          settings,
        })
      ).data;
      setPicked(row.id);
      return row;
    },
    onSuccess: () => {
      invalidateAll();
      toast(t("themes.customSaved"));
    },
    onError: (err: any) => {
      toast(err?.message || err?.response?.data?.message || t("common.error"), "error");
    },
  });

  const importJson = useMutation({
    mutationFn: async (doc: unknown) => (await api.post("/themes/import", doc)).data,
    onSuccess: (row) => {
      if (row?.id) setPicked(row.id);
      invalidateAll();
      toast(t("themes.imported"));
    },
    onError: (err: any) => {
      toast(err?.response?.data?.message || t("common.error"), "error");
    },
  });

  const packs: Array<{
    id: string;
    name: string;
    description: string;
    layout: string;
    accent: string;
    bg: string;
  }> = [
    ...starters.map((starter) => ({
      id: installedBySlug.get(starter.slug)?.id || starter.key,
      name: starter.name,
      description: starter.description,
      layout: starter.settings?.layout || starter.preview?.label || starter.key,
      accent: starter.preview?.accent || "#0D9488",
      bg: starter.preview?.bg || "#F1F5F9",
    })),
    ...(data || [])
      .filter((row) => {
        const starterSlugs = new Set([
          ...starters.map((s) => s.slug),
          "starter-noir",
          "starter-harbor",
        ]);
        return !starterSlugs.has(row.slug) && row.status === "published";
      })
      .map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description || t("themes.customPack"),
        layout: row.settings?.layout || "custom",
        accent: row.settings?.preview?.accent || "#64748B",
        bg: row.settings?.preview?.bg || "#E2E8F0",
      })),
  ];

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-3xl border border-zinc-200/80 bg-gradient-to-br from-slate-50 via-white to-teal-50/40 px-6 py-8 dark:border-zinc-800 dark:from-zinc-950 dark:via-zinc-950 dark:to-teal-950/20 sm:px-8">
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-xl space-y-2">
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-teal-700 dark:text-teal-300">
              <Sparkles size={14} />
              Theme Studio
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
              {t("themes.title")}
            </h1>
            <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {t("themes.subtitle")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/premium/themes/docs"
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-zinc-200 bg-white/80 px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-white dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-200"
            >
              <BookOpen size={14} />
              {t("themes.docsLink")}
            </Link>
            {assignment?.store ? (
              <a
                href={`/shop/${assignment.store.slug}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-zinc-200 bg-white/80 px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-white dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-200"
              >
                <ExternalLink size={14} />
                {assignment.store.title || assignment.store.slug}
              </a>
            ) : null}
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Palette size={18} className="text-teal-600 dark:text-teal-400" />
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {t("themes.storefrontAssign")}
            </h2>
            <p className="text-xs text-zinc-500">{t("themes.storefrontAssignHint")}</p>
          </div>
        </div>
        {!assignment?.store ? (
          <p className="text-sm text-zinc-500">{t("themes.storefrontNoStore")}</p>
        ) : isLoading ? (
          <Spinner />
        ) : error ? (
          <ErrorBox message={t("premium.moduleMissing")} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <label className="cursor-pointer rounded-3xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
              <input
                type="radio"
                name="theme-pack"
                className="sr-only"
                checked={!picked}
                onChange={() => setPicked(null)}
              />
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{t("themes.storefrontNone")}</span>
                {!picked ? <Check size={16} className="text-teal-600" /> : null}
              </div>
            </label>
            {packs.map((pack) => {
              const active = picked === pack.id;
              return (
                <label
                  key={pack.id}
                  className={clsx(
                    "cursor-pointer overflow-hidden rounded-3xl border transition",
                    active
                      ? "border-teal-500 ring-2 ring-teal-500/20"
                      : "border-zinc-200 dark:border-zinc-800",
                  )}
                >
                  <input
                    type="radio"
                    name="theme-pack"
                    className="sr-only"
                    checked={active}
                    onChange={() => setPicked(pack.id)}
                  />
                  <div className="h-24 px-4 py-3" style={{ background: pack.bg }}>
                    <LayoutSketch layout={pack.layout} accent={pack.accent} />
                  </div>
                  <div className="space-y-1 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-zinc-900 dark:text-zinc-50">{pack.name}</span>
                      {active ? <Check size={16} className="text-teal-600" /> : null}
                    </div>
                    <p className="text-xs leading-relaxed text-zinc-500">{pack.description}</p>
                  </div>
                </label>
              );
            })}
          </div>
        )}
        <button
          type="button"
          disabled={!assignment?.store || save.isPending}
          onClick={() => save.mutate()}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          <Save size={16} />
          {t("themes.saveAssign")}
        </button>
      </section>

      <section className="space-y-3 rounded-3xl border border-zinc-200 p-5 dark:border-zinc-800 sm:p-6">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{t("themes.customTitle")}</h2>
        <p className="text-xs text-zinc-500">{t("themes.customHint")}</p>
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-500">{t("themes.customCss")}</span>
          <textarea
            value={customCss}
            onChange={(e) => setCustomCss(e.target.value)}
            rows={8}
            dir="ltr"
            className="w-full rounded-xl border border-zinc-300 bg-white p-3 font-mono text-xs outline-none dark:border-zinc-700 dark:bg-zinc-950"
            placeholder={".store-skin-atelier .hero { letter-spacing: 0.04em; }"}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-500">{t("themes.customJson")}</span>
          <textarea
            value={customJson}
            onChange={(e) => setCustomJson(e.target.value)}
            rows={8}
            dir="ltr"
            className="w-full rounded-xl border border-zinc-300 bg-white p-3 font-mono text-xs outline-none dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saveCustom.isPending}
            onClick={() => saveCustom.mutate()}
            className="cursor-pointer rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            {t("themes.customSave")}
          </button>
          <button
            type="button"
            onClick={() => importRef.current?.click()}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold dark:border-zinc-700"
          >
            <Upload size={14} />
            {t("themes.import")}
          </button>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                importJson.mutate(JSON.parse(await file.text()));
              } catch {
                toast(t("common.error"), "error");
              }
            }}
          />
        </div>
      </section>
    </div>
  );
}

function LayoutSketch({ layout, accent }: { layout: string; accent: string }) {
  const kind = layout.toLowerCase();
  if (kind.includes("market") || kind.includes("desk")) {
    return (
      <div className="flex h-full flex-col justify-end gap-1.5">
        <div className="flex gap-1">
          <div className="h-4 flex-1 rounded-sm" style={{ background: accent }} />
          <div className="h-4 flex-1 rounded-sm bg-black/20" />
        </div>
        <div className="h-2 rounded-sm bg-black/15" />
        <div className="h-8 rounded-sm border border-white/10 bg-black/20" />
        <div className="h-3 rounded-sm" style={{ background: accent }} />
      </div>
    );
  }
  if (kind.includes("split") || kind.includes("minimal")) {
    return (
      <div className="flex h-full gap-2">
        <div className="w-1/4 rounded-md bg-black/10" />
        <div className="grid flex-1 grid-cols-2 gap-1">
          <div className="rounded-sm border border-black/10 bg-white/70" />
          <div className="rounded-sm border" style={{ borderColor: accent, background: `${accent}22` }} />
          <div className="rounded-sm border border-black/10 bg-white/70" />
          <div className="rounded-sm border border-black/10 bg-white/70" />
        </div>
      </div>
    );
  }
  if (kind.includes("funnel")) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1.5 px-3">
        <div className="flex w-full gap-1">
          <div className="h-1.5 flex-1 rounded-full" style={{ background: accent }} />
          <div className="h-1.5 flex-1 rounded-full bg-white/35" />
          <div className="h-1.5 flex-1 rounded-full bg-white/20" />
        </div>
        <div className="w-[72%] flex-1 rounded-md bg-white/85" />
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5">
      <div className="h-4 w-4 rounded-full" style={{ background: accent }} />
      <div className="h-2 w-16 rounded-sm bg-black/20" />
      <div className="grid w-full grid-cols-3 gap-1">
        <div className="h-6 rounded-sm bg-white/50" />
        <div className="h-6 rounded-sm bg-white/50" />
        <div className="h-6 rounded-sm bg-white/50" />
      </div>
    </div>
  );
}
