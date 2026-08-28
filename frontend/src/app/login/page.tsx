"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import type { LoginResponse } from "@/lib/types";
import { useT, useLocale } from "@/i18n";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { PanelLogo } from "@/components/PanelLogo";
import { PANEL_BRAND } from "@/lib/panel-brand";

export default function LoginPage() {
  const t = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const setAuth = useAuth((s) => s.setAuth);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post<LoginResponse>("/auth/login", {
        username,
        password,
      });
      setAuth(data.accessToken, data.refreshToken, data.admin);
      router.replace("/dashboard");
    } catch (err: unknown) {
      const msg =
        (typeof err === "object" &&
          err &&
          "response" in err &&
          // @ts-expect-error narrow axios error shape
          err.response?.data?.message) ||
        t("login.failed");
      setError(Array.isArray(msg) ? msg.join(", ") : String(msg));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-20 w-20 items-center justify-center">
            <PanelLogo size={80} priority />
          </div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            {locale === "fa" ? PANEL_BRAND.nameFa : PANEL_BRAND.name}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {locale === "fa" ? PANEL_BRAND.descriptionFa : PANEL_BRAND.description}
          </p>
          <div className="mt-4">
            <LocaleSwitcher />
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-6"
        >
          <div>
            <label className="mb-1 block text-sm text-zinc-500 dark:text-zinc-400">{t("login.username")}</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t("login.usernamePlaceholder")}
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-500 dark:text-zinc-400">{t("login.password")}</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("login.passwordPlaceholder")}
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 pe-10 text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                tabIndex={-1}
                aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 py-2 font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
          >
            {loading ? t("login.signingIn") : t("login.submit")}
          </button>
        </form>
      </div>
    </div>
  );
}
