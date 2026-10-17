"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Copy, KeyRound } from "lucide-react";
import { api } from "@/lib/api";
import { Card, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useAuth } from "@/store/auth";
import { ApiDocs } from "@/components/ApiDocs";
import { useT } from "@/i18n";

type KeyRow = {
  id: string;
  name: string;
  adminId: string;
  keyPrefix: string;
  scopes: string[];
  enabled: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  admin?: { username: string; role: string };
};

type AdminOption = { id: string; username: string };

const FULL = "*";

/** i18n keys cannot contain dots, so `clients.read` is stored as `scope_clients_read`. */
const scopeKey = (s: string) => `apiKeys.scope_${s.replace(".", "_")}`;

/** Key management + docs; rendered in Settings → API and on /api-keys. */
export function ApiKeysPanel() {
  const t = useT();
  const toast = useToast((s) => s.push);
  const qc = useQueryClient();
  const me = useAuth((s) => s.admin);
  const isSuper = me?.role === "SUPER_ADMIN";

  const [name, setName] = useState("");
  const [mode, setMode] = useState<"full" | "custom">("full");
  const [picked, setPicked] = useState<string[]>(["clients.read"]);
  const [ownerId, setOwnerId] = useState("");
  const [plainKey, setPlainKey] = useState<string | null>(null);

  const { data: keys = [], isLoading } = useQuery<KeyRow[]>({
    queryKey: ["api-keys"],
    queryFn: async () => (await api.get("/v1/keys")).data,
  });

  const { data: scopeInfo } = useQuery<{ scopes: string[]; premiumScopes?: string[]; premiumAvailable?: boolean }>({
    queryKey: ["api-key-scopes"],
    queryFn: async () => (await api.get("/v1/keys/scopes")).data,
  });

  const { data: admins = [] } = useQuery<AdminOption[]>({
    queryKey: ["api-key-admins"],
    enabled: isSuper,
    queryFn: async () => {
      const res = (await api.get("/admins")).data;
      const list = Array.isArray(res) ? res : res?.data ?? [];
      return list.map((a: AdminOption) => ({ id: a.id, username: a.username }));
    },
  });

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post("/v1/keys", {
          name: name.trim() || "API key",
          scopes: mode === "full" ? [FULL] : picked,
          ...(isSuper && ownerId ? { adminId: ownerId } : {}),
        })
      ).data as { apiKey: string },
    onSuccess: (row) => {
      setPlainKey(row.apiKey);
      setName("");
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      toast(t("apiKeys.created"));
    },
    onError: () => toast(t("apiKeys.failed"), "error"),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/v1/keys/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      toast(t("apiKeys.revoked"));
    },
  });

  const scopes = scopeInfo?.scopes ?? [];
  const premiumAvailable = !!scopeInfo?.premiumAvailable;
  const premiumScopes = premiumAvailable ? scopeInfo?.premiumScopes ?? [] : [];

  const scopeBox = (s: string) => (
    <label
      key={s}
      className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
    >
      <input
        type="checkbox"
        checked={picked.includes(s)}
        onChange={(e) => setPicked((p) => (e.target.checked ? [...p, s] : p.filter((x) => x !== s)))}
      />
      {t(scopeKey(s))}
    </label>
  );

  return (
    <div className="space-y-6">

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Card className="space-y-5 p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-sky-500/10 p-2 text-sky-500">
              <KeyRound size={20} />
            </div>
            <h2 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">{t("apiKeys.create")}</h2>
          </div>

          <div>
            <label htmlFor="key-name" className="mb-1.5 block text-sm font-medium text-zinc-600 dark:text-zinc-300">
              {t("apiKeys.name")}
            </label>
            <input
              id="key-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("apiKeys.namePlaceholder")}
              className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </div>

          {isSuper && (
            <div>
              <label htmlFor="key-owner" className="mb-1.5 block text-sm font-medium text-zinc-600 dark:text-zinc-300">
                {t("apiKeys.owner")}
              </label>
              <select
                id="key-owner"
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">{t("apiKeys.ownerSelf")}</option>
                {admins
                  .filter((a) => a.id !== me?.id)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.username}
                    </option>
                  ))}
              </select>
            </div>
          )}

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-300">{t("apiKeys.access")}</legend>
            <div className="space-y-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name="mode" checked={mode === "full"} onChange={() => setMode("full")} />
                {t("apiKeys.full")}
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="mode" checked={mode === "custom"} onChange={() => setMode("custom")} />
                {t("apiKeys.custom")}
              </label>
            </div>
            {mode === "custom" && (
              <div className="mt-3 space-y-3">
                <div className="grid gap-2 sm:grid-cols-2">{scopes.map(scopeBox)}</div>
                {premiumScopes.length > 0 && (
                  <>
                    <p className="text-xs font-medium text-zinc-500">{t("apiKeys.premiumScopes")}</p>
                    <div className="grid gap-2 sm:grid-cols-2">{premiumScopes.map(scopeBox)}</div>
                  </>
                )}
              </div>
            )}
          </fieldset>

          <button
            type="button"
            onClick={() => create.mutate()}
            disabled={create.isPending || (mode === "custom" && picked.length === 0)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {t("apiKeys.create")}
          </button>

          {plainKey && (
            <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
              <p className="text-amber-700 dark:text-amber-300">{t("apiKeys.copyOnce")}</p>
              <div className="flex items-center gap-2">
                <code dir="ltr" className="flex-1 break-all">
                  {plainKey}
                </code>
                <button
                  type="button"
                  aria-label={t("apiKeys.copy")}
                  onClick={() => {
                    void navigator.clipboard.writeText(plainKey);
                    toast(t("apiKeys.copied"));
                  }}
                  className="rounded-md p-1.5 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-100"
                >
                  <Copy size={16} />
                </button>
              </div>
            </div>
          )}
        </Card>

        <Card className="space-y-3 p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-500">
              <BookOpen size={20} />
            </div>
            <h2 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">{t("apiKeys.docs")}</h2>
          </div>
          <p className="text-sm text-zinc-500">{t("apiKeys.docsHint")}</p>
          <pre dir="ltr" className="overflow-x-auto rounded-lg bg-zinc-950 p-3 text-xs leading-6 text-zinc-100">
{`curl -s ${typeof window === "undefined" ? "" : window.location.origin}/api/v1/account \\
  -H "Authorization: Bearer hmp_…"`}
          </pre>
          <p className="text-sm text-zinc-500">{t("apiKeys.docsReference")}</p>
          <ul className="space-y-1.5 text-sm">
            <li>
              <a href="/api/api" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                {t("apiKeys.swagger")}
              </a>
            </li>
            <li>
              <a href="/api/v1/openapi.json" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                {t("apiKeys.jsonV1")}
              </a>{" "}
              <code dir="ltr" className="text-xs text-zinc-500">/api/v1/openapi.json</code>
            </li>
            <li>
              <a href="/api/api-json" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                {t("apiKeys.jsonFull")}
              </a>{" "}
              <code dir="ltr" className="text-xs text-zinc-500">/api/api-json</code>
            </li>
            <li>
              <a
                href="https://github.com/neoauroraproject/hmpanel/blob/main/docs/admin-api.md"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline"
              >
                {t("apiKeys.guide")}
              </a>
            </li>
          </ul>
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="mb-4 text-lg font-bold text-zinc-800 dark:text-zinc-100">{t("apiKeys.keys")}</h2>
        {isLoading ? (
          <Spinner />
        ) : keys.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("apiKeys.empty")}</p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {keys.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-zinc-800 dark:text-zinc-100">
                    {k.name}{" "}
                    <code dir="ltr" className="text-xs text-zinc-500">
                      {k.keyPrefix}…
                    </code>
                  </p>
                  <p className="text-xs text-zinc-500">
                    {isSuper && k.admin ? `${k.admin.username} · ` : ""}
                    {(k.scopes ?? []).includes(FULL) ? t("apiKeys.full") : (k.scopes ?? []).map((s) => t(scopeKey(s))).join("، ")}
                    {" · "}
                    {t("apiKeys.lastUsed")}: {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : t("apiKeys.never")}
                  </p>
                </div>
                {k.enabled ? (
                  <button
                    type="button"
                    onClick={() => revoke.mutate(k.id)}
                    className="rounded-lg px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-500/10"
                  >
                    {t("apiKeys.revoke")}
                  </button>
                ) : (
                  <span className="text-xs text-zinc-400">{t("apiKeys.disabled")}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ApiDocs premiumAvailable={premiumAvailable} />
    </div>
  );
}
