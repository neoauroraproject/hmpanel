"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * HTTPS bridge for VPN app deep links (v2box://, streisand://, happ://).
 * Telegram inline buttons only accept http(s)/tg links, so we route through this page.
 */
function AppImportInner() {
  const params = useSearchParams();
  const target = params.get("to") || "";
  const [status, setStatus] = useState<"ok" | "bad" | "waiting">("waiting");

  const safe = useMemo(() => {
    if (!target) return "";
    try {
      const u = new URL(target);
      const scheme = u.protocol.replace(":", "").toLowerCase();
      if (["v2box", "streisand", "happ", "v2rayng", "v2rayn", "hiddify", "shadowrocket"].includes(scheme)) {
        return target;
      }
    } catch {
      /* ignore */
    }
    return "";
  }, [target]);

  useEffect(() => {
    if (!safe) {
      setStatus("bad");
      return;
    }
    setStatus("ok");
    const t = window.setTimeout(() => {
      window.location.href = safe;
    }, 400);
    return () => window.clearTimeout(t);
  }, [safe]);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[#0B0B0F] px-6 text-center text-zinc-100">
      {status === "bad" ? (
        <p className="text-sm text-zinc-400">Invalid import link.</p>
      ) : (
        <>
          <p className="text-base font-semibold">Opening app…</p>
          <p className="max-w-sm text-sm text-zinc-400">
            اگر برنامه باز نشد، دکمه زیر را بزنید.
          </p>
          {safe ? (
            <a
              href={safe}
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-sky-500 px-6 text-sm font-bold text-white"
            >
              Open app
            </a>
          ) : null}
        </>
      )}
    </div>
  );
}

export default function AppImportPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center bg-[#0B0B0F] text-zinc-400">
          Loading…
        </div>
      }
    >
      <AppImportInner />
    </Suspense>
  );
}
