"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, ArrowRight, LoaderCircle } from "lucide-react";
import { useCustomerSession } from "@/modules/storefront/session";
import { StoreShell, PrimaryButton, SecondaryButton } from "@/modules/storefront/ui";

export default function PortalEntryPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const { data, login, isLoading } = useCustomerSession();

  useEffect(() => {
    const incomingToken =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("token")
        : null;
    if (incomingToken && !login.isPending && !data) {
      setToken(incomingToken.toUpperCase());
      login.mutate(incomingToken);
    }
  }, [data, login]);

  useEffect(() => {
    if (data) {
      router.replace("/portal/dashboard");
    }
  }, [data, router]);

  return (
    <StoreShell>
      <div className="flex min-h-screen items-center justify-center p-4 font-sans">
        <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-8 text-center">
            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[color:var(--store-primary)]/10 text-[color:var(--store-primary)]">
            <KeyRound size={32} />
          </div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Login with Token</h1>
            <p className="mt-2 text-sm text-zinc-500">
              Enter your permanent customer token. No password is required.
            </p>
          </div>
          <div className="space-y-4">
            <input
              value={token}
              onChange={(e) => setToken(e.target.value.toUpperCase())}
              placeholder="HM-XXXX-XXXX-XXXX"
              dir="ltr"
              className="w-full rounded-2xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-center font-mono tracking-wider outline-none dark:border-zinc-700 dark:bg-zinc-950"
            />
            <PrimaryButton
              onClick={() => token.trim() && login.mutate(token.trim())}
              disabled={!token.trim() || login.isPending || isLoading}
            >
              {login.isPending ? (
                <span className="inline-flex items-center gap-2">
                  <LoaderCircle size={16} className="animate-spin" />
                  Signing in
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  Continue <ArrowRight size={18} />
                </span>
              )}
            </PrimaryButton>
            <SecondaryButton onClick={() => router.push("/")}>Back</SecondaryButton>
            {login.error ? (
              <p className="text-center text-sm text-red-500">
                Token not found. Check it and try again.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </StoreShell>
  );
}
