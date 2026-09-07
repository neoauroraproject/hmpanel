"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileJson,
  Layers,
  Palette,
  Sparkles,
  Upload,
} from "lucide-react";
import { api } from "@/lib/api";
import { Card, Spinner, ErrorBox, Badge } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useT } from "@/i18n";
import { clsx } from "clsx";

type ThemeRow = {
  id: string;
  slug: string;
  name: string;
  status: string;
  authorName?: string | null;
  description?: string | null;
  settings?: { skin?: string; preview?: { accent?: string; bg?: string } } | null;
  updatedAt?: string;
};

type Starter = {
  key: string;
  slug: string;
  name: string;
  description: string;
  preview?: { accent?: string; bg?: string; label?: string };
};

type Assignment = {
  themeId: string | null;
  store: { id: string; slug: string; title: string } | null;
};

export default function ThemesPage() {
  const t = useT();
  const toast = useToast((s) => s.push);
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [docsOpen, setDocsOpen] = useState(true);
  const importRef = useRef<HTMLInputElement>(null);

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

  const { data: published = [] } = useQuery<ThemeRow[]>({
    queryKey: ["themes-published"],
    queryFn: async () => (await api.get("/themes/published")).data,
    retry: false,
  });

  const { data: assignment } = useQuery<Assignment>({
    queryKey: ["themes-storefront"],
    queryFn: async () => (await api.get("/themes/storefront")).data,
    retry: false,
  });

  const invalidateAll = () => {
    void qc.invalidateQueries({ queryKey: ["themes"] });
    void qc.invalidateQueries({ queryKey: ["themes-published"] });
    void qc.invalidateQueries({ queryKey: ["themes-storefront"] });
    void qc.invalidateQueries({ queryKey: ["themes-starters"] });
  };

  const create = useMutation({
    mutationFn: async () =>
      (await api.post("/themes", { name: name.trim() || "Untitled" })).data,
    onSuccess: () => {
      setName("");
      invalidateAll();
      toast(t("common.create"));
    },
    onError: (err: any) => {
      toast(err?.response?.data?.message || t("common.error"), "error");
    },
  });

  const installStarter = useMutation({
    mutationFn: async (key: string) =>
      (await api.post(`/themes/starters/${key}/install`)).data,
    onSuccess: () => {
      invalidateAll();
      toast(t("themes.starterInstalled"));
    },
    onError: (err: any) => {
      toast(err?.response?.data?.message || t("common.error"), "error");
    },
  });

  const assign = useMutation({
    mutationFn: async (themeId: string | null) =>
      (await api.post("/themes/storefront", { themeId })).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["themes-storefront"] });
      toast(t("themes.storefrontSaved"));
    },
    onError: (err: any) => {
      toast(err?.response?.data?.message || t("themes.storefrontNoStore"), "error");
    },
  });

  const act = useMutation({
    mutationFn: async (opts: {
      id: string;
      action: "publish" | "unpublish" | "clone" | "export" | "delete";
    }) => {
      if (opts.action === "delete") return (await api.delete(`/themes/${opts.id}`)).data;
      if (opts.action === "export") return (await api.get(`/themes/${opts.id}/export`)).data;
      return (await api.post(`/themes/${opts.id}/${opts.action}`)).data;
    },
    onSuccess: (result, vars) => {
      if (vars.action === "export") {
        const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${result.slug || "theme"}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
      invalidateAll();
    },
    onError: (err: any) => {
      toast(err?.response?.data?.message || t("common.error"), "error");
    },
  });

  const importJson = useMutation({
    mutationFn: async (doc: unknown) => (await api.post("/themes/import", doc)).data,
    onSuccess: () => {
      invalidateAll();
      toast(t("themes.imported"));
    },
    onError: (err: any) => {
      toast(err?.response?.data?.message || t("common.error"), "error");
    },
  });

  const installedSlugs = useMemo(
    () => new Set((data || []).map((th) => th.slug)),
    [data],
  );

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-3xl border border-zinc-200/80 bg-gradient-to-br from-slate-50 via-white to-teal-50/40 px-6 py-8 dark:border-zinc-800 dark:from-zinc-950 dark:via-zinc-950 dark:to-teal-950/20 sm:px-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -end-16 -top-20 h-56 w-56 rounded-full bg-teal-400/20 blur-3xl"
        />
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

      {/* Active assignment */}
      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
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
        ) : (
          <select
            className="w-full cursor-pointer rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-950"
            value={assignment.themeId || ""}
            disabled={assign.isPending}
            onChange={(e) => assign.mutate(e.target.value || null)}
          >
            <option value="">{t("themes.storefrontNone")}</option>
            {published.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.name}
              </option>
            ))}
          </select>
        )}
      </section>

      {/* Starter templates */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Layers size={18} className="text-zinc-500" />
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {t("themes.startersTitle")}
          </h2>
        </div>
        <p className="text-xs text-zinc-500">{t("themes.startersHint")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {starters.map((starter) => {
            const installed = installedSlugs.has(starter.slug);
            const accent = starter.preview?.accent || "#0D9488";
            const bg = starter.preview?.bg || "#F1F5F9";
            return (
              <article
                key={starter.key}
                className="overflow-hidden rounded-3xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div
                  className="relative h-28 px-5 py-4"
                  style={{
                    background: `linear-gradient(145deg, ${bg} 0%, color-mix(in srgb, ${accent} 35%, ${bg}) 100%)`,
                  }}
                >
                  <div
                    className="absolute inset-x-8 bottom-3 h-10 rounded-xl border border-white/30 bg-white/50 backdrop-blur-sm dark:bg-black/30"
                    style={{ boxShadow: `0 12px 40px -20px ${accent}` }}
                  />
                  <span className="relative text-xs font-bold uppercase tracking-wider text-white/90 mix-blend-difference">
                    {starter.name}
                  </span>
                </div>
                <div className="space-y-3 p-5">
                  <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                    {starter.description}
                  </p>
                  <button
                    type="button"
                    disabled={installStarter.isPending}
                    onClick={() => installStarter.mutate(starter.key)}
                    className={clsx(
                      "inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
                      installed
                        ? "border border-teal-500/30 bg-teal-500/10 text-teal-800 dark:text-teal-200"
                        : "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900",
                    )}
                  >
                    {installed ? <CheckCircle2 size={16} /> : <Download size={16} />}
                    {installed ? t("themes.starterRefresh") : t("themes.starterInstall")}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Create + import */}
      <Card className="p-5 sm:p-6">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <label className="min-w-[12rem] flex-1">
            <span className="mb-1 block text-xs text-zinc-500">{t("themes.name")}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>
          <button
            type="submit"
            disabled={create.isPending}
            className="cursor-pointer rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {t("themes.create")}
          </button>
          <button
            type="button"
            onClick={() => importRef.current?.click()}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold transition hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
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
                const text = await file.text();
                importJson.mutate(JSON.parse(text));
              } catch {
                toast(t("common.error"), "error");
              }
            }}
          />
        </form>
      </Card>

      {/* Library */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {t("themes.library")}
        </h2>
        {isLoading ? (
          <Spinner />
        ) : error ? (
          <ErrorBox message={t("premium.moduleMissing")} />
        ) : !data?.length ? (
          <Card>
            <p className="text-sm text-zinc-500">{t("themes.empty")}</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {data.map((theme) => {
              const accent = theme.settings?.preview?.accent;
              return (
                <Card
                  key={theme.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="h-10 w-10 shrink-0 rounded-xl border border-zinc-200 dark:border-zinc-700"
                      style={{
                        background: accent
                          ? `linear-gradient(135deg, ${accent}, color-mix(in srgb, ${accent} 40%, #0f172a))`
                          : "linear-gradient(135deg, #94a3b8, #334155)",
                      }}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-zinc-800 dark:text-zinc-100">
                          {theme.name}
                        </span>
                        <Badge
                          tone={theme.status === "published" ? "green" : "zinc"}
                        >
                          {theme.status === "published"
                            ? t("themes.statusPublished")
                            : theme.status === "unpublished"
                              ? t("themes.statusUnpublished")
                              : t("themes.statusDraft")}
                        </Badge>
                      </div>
                      <div className="truncate text-xs text-zinc-500">
                        {theme.slug}
                        {theme.description ? ` · ${theme.description}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold transition hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                      onClick={() => act.mutate({ id: theme.id, action: "clone" })}
                    >
                      <Copy size={12} />
                      {t("themes.clone")}
                    </button>
                    <button
                      type="button"
                      className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold transition hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                      onClick={() => act.mutate({ id: theme.id, action: "export" })}
                    >
                      <FileJson size={12} />
                      {t("themes.export")}
                    </button>
                    <button
                      type="button"
                      className="cursor-pointer rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold transition hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                      onClick={() =>
                        act.mutate({
                          id: theme.id,
                          action: theme.status === "published" ? "unpublish" : "publish",
                        })
                      }
                    >
                      {theme.status === "published"
                        ? t("themes.unpublish")
                        : t("themes.publish")}
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Documentation */}
      <section className="rounded-3xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <button
          type="button"
          onClick={() => setDocsOpen((v) => !v)}
          className="flex w-full cursor-pointer items-center gap-2 px-5 py-4 text-start sm:px-6"
        >
          <BookOpen size={18} className="text-zinc-500" />
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {t("themes.docsTitle")}
            </h2>
            <p className="text-xs text-zinc-500">{t("themes.docsSubtitle")}</p>
          </div>
          <span className="text-xs text-zinc-400">{docsOpen ? "−" : "+"}</span>
        </button>
        {docsOpen ? (
          <div className="space-y-4 border-t border-zinc-100 px-5 py-5 text-sm leading-relaxed text-zinc-600 dark:border-zinc-800 dark:text-zinc-400 sm:px-6">
            <p>{t("themes.docsIntro")}</p>
            <ol className="list-decimal space-y-2 ps-5">
              <li>{t("themes.docsStep1")}</li>
              <li>{t("themes.docsStep2")}</li>
              <li>{t("themes.docsStep3")}</li>
              <li>{t("themes.docsStep4")}</li>
            </ol>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 font-mono text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300" dir="ltr">
              {`{
  "format": 1,
  "slug": "my-skin",
  "name": "My Skin",
  "settings": { "skin": "atelier", "version": 1 },
  "version": "1.0.0",
  "payload": {}
}`}
            </div>
            <p>{t("themes.docsBranding")}</p>
            <p>{t("themes.docsSkins")}</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
