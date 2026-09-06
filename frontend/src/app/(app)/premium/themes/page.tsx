"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, PageHeader, Spinner, ErrorBox } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useT } from "@/i18n";
import { PluginSlot } from "@/components/PluginSlot";

type ThemeRow = {
  id: string;
  slug: string;
  name: string;
  status: string;
  authorName?: string | null;
  updatedAt?: string;
};

export default function ThemesPage() {
  const t = useT();
  const toast = useToast((s) => s.push);
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const { data, isLoading, error } = useQuery<ThemeRow[]>({
    queryKey: ["themes"],
    queryFn: async () => (await api.get("/themes")).data,
    retry: false,
  });

  const create = useMutation({
    mutationFn: async () =>
      (await api.post("/themes", { name: name.trim() || "Untitled" })).data,
    onSuccess: () => {
      setName("");
      qc.invalidateQueries({ queryKey: ["themes"] });
      toast(t("common.create"));
    },
    onError: (err: any) => {
      toast(err?.response?.data?.message || t("common.error"), "error");
    },
  });

  const act = useMutation({
    mutationFn: async (opts: { id: string; action: "publish" | "unpublish" | "clone" | "export" | "delete" }) => {
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
      qc.invalidateQueries({ queryKey: ["themes"] });
    },
    onError: (err: any) => {
      toast(err?.response?.data?.message || t("common.error"), "error");
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader title={t("themes.title")} subtitle={t("themes.subtitle")} />
      <PluginSlot name="themes.page.builder" />
      <Card>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <label className="flex-1 min-w-[12rem]">
            <span className="mb-1 block text-xs text-zinc-500">{t("themes.name")}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>
          <button
            type="submit"
            disabled={create.isPending}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            {t("themes.create")}
          </button>
        </form>
      </Card>
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
          {data.map((theme) => (
            <Card key={theme.id} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-medium text-zinc-800 dark:text-zinc-100">{theme.name}</div>
                <div className="text-xs text-zinc-500">
                  {theme.slug} · {theme.status}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs dark:border-zinc-700"
                  onClick={() => act.mutate({ id: theme.id, action: "clone" })}
                >
                  {t("themes.clone")}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs dark:border-zinc-700"
                  onClick={() => act.mutate({ id: theme.id, action: "export" })}
                >
                  {t("themes.export")}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs dark:border-zinc-700"
                  onClick={() =>
                    act.mutate({
                      id: theme.id,
                      action: theme.status === "published" ? "unpublish" : "publish",
                    })
                  }
                >
                  {theme.status === "published" ? t("themes.unpublish") : t("themes.publish")}
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
