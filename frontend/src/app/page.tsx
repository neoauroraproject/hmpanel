"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/store/auth";
import { Spinner } from "@/components/ui";

/**
 * Logged-in → /dashboard.
 * Guest on premium apex (or unresolved) → /shop/{slug} when store exists, else /login.
 * Custom domains are redirected in middleware before this page loads.
 */
export default function Home() {
  const router = useRouter();
  const token = useAuth((s) => s.token);

  useEffect(() => {
    let cancelled = false;

    async function go() {
      if (token) {
        router.replace("/dashboard");
        return;
      }

      try {
        const host = window.location.host;
        const res = await fetch(
          `/api/public/domains/resolve?host=${encodeURIComponent(host)}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const data = await res.json();
          if (data?.matched && data?.storefrontPath) {
            if (!cancelled) router.replace(data.storefrontPath);
            return;
          }
        }
      } catch {
        /* ignore */
      }

      if (!cancelled) router.replace("/login");
    }

    void go();
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  return <Spinner />;
}
