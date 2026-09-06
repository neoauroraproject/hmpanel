"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Copy, KeyRound, MessageCircle } from "lucide-react";
import { api } from "@/lib/api";
import { Card, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useT } from "@/i18n";
import { useLicenseActivation } from "@/hooks/useLicenseActivation";
import { usePremiumModules } from "@/hooks/usePremiumModules";

type ApiClientRow = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[] | unknown;
  enabled: boolean;
  rateLimitPerMin: number;
};

type FlagMap = Record<string, boolean>;

export function BotsApiSettings() {
  const t = useT();
  const toast = useToast((s) => s.push);
  const qc = useQueryClient();
  const { licenseQuery } = useLicenseActivation();
  const isPremium =
    licenseQuery.data?.edition === "PREMIUM" &&
    licenseQuery.data?.status !== "community" &&
    licenseQuery.data?.mode !== "disabled";
  const { data: modules = [] } = usePremiumModules({ enabled: isPremium });
  const storeOn = modules.some((m) => m.id === "store" && m.enabled);
  const [name, setName] = useState("Bot");
  const [plainKey, setPlainKey] = useState<string | null>(null);

  const { data: clients = [], isLoading } = useQuery<ApiClientRow[]>({
    queryKey: ["bot-api-clients"],
    queryFn: async () => (await api.get("/v1/api-clients")).data,
    retry: false,
  });

  const { data: flags } = useQuery<FlagMap>({
    queryKey: ["platform-flags"],
    queryFn: async () => (await api.get("/platform/architecture/flags")).data,
    retry: false,
  });

  const create = useMutation({
    mutationFn: async () =>
      (await api.post("/v1/api-clients", { name: name.trim() || "Bot", scopes: ["clients.read"] })).data,
    onSuccess: (row: { apiKey?: string }) => {
      setPlainKey(row.apiKey || null);
      qc.invalidateQueries({ queryKey: ["bot-api-clients"] });
      toast(t("settings.botKeyCreated"));
    },
    onError: () => toast(t("settings.botKeyFailed"), "error"),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/v1/api-clients/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bot-api-clients"] });
      toast(t("settings.botKeyRevoked"));
    },
  });

  const setFlags = useMutation({
    mutationFn: async (patch: FlagMap) => (await api.patch("/platform/architecture/flags", patch)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-flags"] });
      toast(t("settings.savedOk"));
    },
  });

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 items-start">
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-sky-500/10 text-sky-500">
            <KeyRound size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">{t("settings.botsApiTitle")}</h3>
            <p className="text-xs text-zinc-500 mt-1">{t("settings.botsApiHint")}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("settings.botKeyName")}
            className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => create.mutate()}
            disabled={create.isPending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {t("common.create")}
          </button>
        </div>
        {plainKey ? (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <code className="flex-1 break-all">{plainKey}</code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(plainKey);
                toast(t("common.copied") || "Copied");
              }}
              className="text-zinc-500 hover:text-zinc-800"
            >
              <Copy size={16} />
            </button>
          </div>
        ) : null}
        {isLoading ? (
          <Spinner />
        ) : (
          <ul className="space-y-2">
            {clients.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
              >
                <span>
                  {c.name}{" "}
                  <span className="text-xs text-zinc-500">{c.keyPrefix}…</span>
                  {!c.enabled ? (
                    <span className="ms-2 text-xs text-rose-500">{t("admins.statusDisabled")}</span>
                  ) : null}
                </span>
                {c.enabled ? (
                  <button
                    type="button"
                    onClick={() => revoke.mutate(c.id)}
                    className="text-xs text-rose-500 hover:underline"
                  >
                    {t("clients.disable")}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-sky-500/10 text-sky-500">
            <MessageCircle size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">{t("settings.telegramBotsTitle")}</h3>
            <p className="text-xs text-zinc-500 mt-1">{t("settings.telegramBotsHint")}</p>
          </div>
        </div>
        {isPremium && storeOn ? (
          <Link
            href="/premium/store"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
          >
            <Bot size={16} /> {t("settings.openStoreTelegram")}
          </Link>
        ) : (
          <p className="text-sm text-zinc-500">{t("settings.telegramNeedsStore")}</p>
        )}
      </Card>

      <Card className="p-6 space-y-4 lg:col-span-2">
        <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">{t("settings.featureFlagsTitle")}</h3>
        <p className="text-xs text-zinc-500">{t("settings.featureFlagsHint")}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(flags || {}).map(([key, on]) => (
            <label
              key={key}
              className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
            >
              <input
                type="checkbox"
                checked={!!on}
                onChange={(e) => setFlags.mutate({ [key]: e.target.checked })}
              />
              <span className="font-mono text-xs">{key}</span>
            </label>
          ))}
        </div>
      </Card>
    </div>
  );
}
