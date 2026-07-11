"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { useCustomerSession } from "@/modules/storefront/session";
import { StoreShell } from "@/modules/storefront/ui";

export default function CustomerPortalPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const { data, login } = useCustomerSession();

  useEffect(() => {
    if (!data && !login.isPending) {
      login.mutate(token);
    }
    if (data) {
      router.replace("/portal/dashboard");
    }
  }, [data, login, router, token]);

  return (
    <StoreShell>
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <LoaderCircle className="mx-auto animate-spin text-zinc-500" />
          <h1 className="mt-4 text-xl font-bold">Migrating your portal link</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Signing you in with your permanent token and opening the new dashboard.
          </p>
        </div>
      </div>
    </StoreShell>
  );
}
