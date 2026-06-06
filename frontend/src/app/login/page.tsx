"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import type { LoginResponse } from "@/lib/types";

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuth((s) => s.setAuth);
  const [username, setUsername] = useState("superadmin");
  const [password, setPassword] = useState("admin123");
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
        "Login failed";
      setError(Array.isArray(msg) ? msg.join(", ") : String(msg));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400">
            <ShieldCheck size={26} />
          </div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Panel Login</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            3x-ui Reseller Management
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-6"
        >
          <div>
            <label className="mb-1 block text-sm text-zinc-500 dark:text-zinc-400">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-500 dark:text-zinc-400">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500"
              autoComplete="current-password"
            />
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
            {loading ? "Signing in…" : "Sign in"}
          </button>

          <div className="rounded-lg bg-zinc-50 dark:bg-zinc-950/60 p-3 text-xs text-zinc-500">
            <div className="mb-1 font-medium text-zinc-500 dark:text-zinc-400">Demo accounts</div>
            <div>superadmin / admin123 — full access</div>
            <div>reseller1 / reseller123 — scoped (allocation)</div>
            <div>reseller2 / reseller123 — scoped (usage)</div>
          </div>
        </form>
      </div>
    </div>
  );
}
