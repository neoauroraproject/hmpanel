"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Lock, User } from "lucide-react";
import { clsx } from "clsx";
import { api } from "@/lib/api";
import { subscribeAuthHydration, useAuth } from "@/store/auth";
import type { LoginResponse } from "@/lib/types";
import { useT, useLocale } from "@/i18n";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { PanelLogo } from "@/components/PanelLogo";
import { PANEL_BRAND } from "@/lib/panel-brand";
import { useAppBrand } from "@/hooks/useAppBrand";

/** Version baked into the image at build time (Dockerfile copies VERSION here). */
function usePanelVersion() {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/VERSION.txt", { cache: "no-store" })
      .then((r) => (r.ok ? r.text() : ""))
      .then((v) => {
        const clean = v.trim().replace(/^v/i, "");
        if (alive && /^\d+\.\d+/.test(clean)) setVersion(clean);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return version;
}

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
  const [hydrated, setHydrated] = useState(false);
  const { brand, ready: brandReady, displayName: brandName } = useAppBrand();
  const version = usePanelVersion();
  // HMPanel wording only for the stock brand; a reseller's own brand stays neutral.
  const stockBrand = brandReady && !brand.custom;

  useEffect(() => subscribeAuthHydration(() => setHydrated(true)), []);

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

  const field =
    "w-full rounded-xl border border-zinc-200 bg-white py-3 ps-10 pe-3 text-[15px] text-zinc-900 outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-zinc-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-600";

  return (
    <div className="pwa-safe-y pwa-fill relative flex min-h-dvh items-center justify-center overflow-hidden bg-zinc-50 px-4 py-8 dark:bg-zinc-950">
      <style>{`@keyframes hm-login-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
@keyframes hm-login-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}`}</style>
      <div className="pointer-events-none absolute -top-40 end-[-10%] h-[32rem] w-[32rem] rounded-full bg-blue-500/10 blur-[110px] dark:bg-blue-500/15" aria-hidden />
      <div className="pointer-events-none absolute -bottom-40 start-[-10%] h-[28rem] w-[28rem] rounded-full bg-cyan-400/10 blur-[110px]" aria-hidden />

      <div
        className={clsx(
          "relative grid w-full gap-6 motion-safe:animate-[hm-login-in_0.45s_ease-out]",
          "max-w-sm",
        )}
      >
        <div className="flex flex-col justify-center">
          <div className="mx-auto w-full max-w-sm">
            <div className="mb-7 flex flex-col items-center text-center">
              <div className="relative mb-4">
                <div className="absolute inset-0 rounded-full bg-blue-500/25 blur-2xl" aria-hidden />
                <PanelLogo size={72} priority />
              </div>
              <h1 className={clsx("text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50", !brandReady && "invisible")}>
                {brandName}
              </h1>
              {stockBrand ? (
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {locale === "fa" ? PANEL_BRAND.descriptionFa : PANEL_BRAND.description}
                </p>
              ) : null}
            </div>

            <form
              method="post"
              action="/login"
              autoComplete="on"
              onSubmit={onSubmit}
              className="space-y-4 rounded-3xl border border-zinc-200/80 bg-white/80 p-6 shadow-[0_24px_60px_-30px_rgb(15_23_42/0.35)] backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-900/60"
            >
              <div>
                <div className="text-[17px] font-bold text-zinc-900 dark:text-zinc-50">{t("login.welcome")}</div>
                <div className="mt-0.5 text-[13px] text-zinc-500 dark:text-zinc-400">{t("login.welcomeHint")}</div>
              </div>

              <div>
                <label htmlFor="login-username" className="mb-1.5 block text-[13px] font-medium text-zinc-600 dark:text-zinc-300">
                  {t("login.username")}
                </label>
                <div className="relative">
                  <User size={16} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden />
                  <input
                    id="login-username"
                    name="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t("login.usernamePlaceholder")}
                    className={field}
                    autoComplete="username"
                    required
                  />
                </div>
              </div>
              <div>
                <label htmlFor="login-password" className="mb-1.5 block text-[13px] font-medium text-zinc-600 dark:text-zinc-300">
                  {t("login.password")}
                </label>
                <div className="relative">
                  <Lock size={16} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden />
                  <input
                    id="login-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t("login.passwordPlaceholder")}
                    className={clsx(field, "pe-11")}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute end-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                    tabIndex={-1}
                    aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && (
                <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-600 dark:text-red-300">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !hydrated}
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-blue-500 to-blue-600 py-3 text-[15px] font-semibold text-white shadow-[0_10px_24px_-10px_rgb(37_99_235/0.8)] outline-none transition-[filter,transform] hover:brightness-110 focus-visible:ring-4 focus-visible:ring-blue-500/30 active:scale-[0.99] disabled:opacity-50"
              >
                {loading ? t("login.signingIn") : t("login.submit")}
                {!loading ? (
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" aria-hidden />
                ) : null}
              </button>
            </form>

            <div className="mt-5 flex items-center justify-between gap-3">
              <LocaleSwitcher />
              {stockBrand && version ? (
                <span className="text-[12px] tabular-nums text-zinc-400" dir="ltr">HMPanel v{version}</span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
