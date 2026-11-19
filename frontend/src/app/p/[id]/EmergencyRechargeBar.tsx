"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, LoaderCircle, Zap } from "lucide-react";
import { API_BASE } from "@/lib/api";

type EmergencyPortalStatus = {
  available: boolean;
  eligible?: boolean;
  reason?: string | null;
  addBytes?: number;
  addDays?: number;
  usesLeft?: number;
  mode?: "FREE" | "DEDUCT_NEXT" | "WALLET";
  price?: number;
  currency?: string | null;
};

const TEXT = {
  fa: {
    title: "سرویس شما تمام شده است",
    body: "بدون نیاز به تلگرام، با یک دکمه همین الان دوباره وصل شوید.",
    btn: "⚡ شارژ اضطراری",
    confirm: "برای تأیید دوباره بزنید",
    free: "رایگان",
    deduct: "از حجم تمدید بعدی کم می‌شود",
    paid: "از کیف پول",
    done: "شارژ اضطراری فعال شد. اپ را یک بار قطع و وصل کنید.",
    fail: "انجام نشد. دوباره تلاش کنید یا با پشتیبانی تماس بگیرید.",
    wallet: "موجودی کیف پول کافی نیست.",
    limit: "از شارژ اضطراری این دوره استفاده کرده‌اید؛ لطفاً سرویس را تمدید کنید.",
    gb: "گیگ",
    day: "روز",
    toman: "تومان",
  },
  en: {
    title: "Your service has run out",
    body: "No Telegram needed: get connected again with one tap.",
    btn: "⚡ Emergency top-up",
    confirm: "Tap again to confirm",
    free: "free",
    deduct: "taken from your next renewal",
    paid: "from wallet",
    done: "Emergency top-up added. Reconnect your app once.",
    fail: "Failed. Try again or contact support.",
    wallet: "Not enough wallet balance.",
    limit: "You already used this period's emergency top-up. Please renew.",
    gb: "GB",
    day: "day(s)",
    toman: "Toman",
  },
};

/**
 * Emergency top-up card for the subscription page (/p/:id). It renders only when the
 * admin enabled it for the sub page and the service has really run out (traffic or time).
 * Every portal theme places it in its own layout.
 */
export function EmergencyRechargeCard({
  id,
  isFa = true,
  className = "",
}: {
  id: string;
  isFa?: boolean;
  className?: string;
}) {
  const lang = isFa ? "fa" : "en";
  const T = TEXT[lang];
  const qc = useQueryClient();
  const [armed, setArmed] = useState(false);
  const [result, setResult] = useState<"ok" | string | null>(null);

  const { data } = useQuery<EmergencyPortalStatus | null>({
    queryKey: ["emergency-portal", id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/store/emergency/${encodeURIComponent(id)}`);
      if (!res.ok) return null;
      return res.json();
    },
    retry: false,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 6000);
    return () => clearTimeout(timer);
  }, [armed]);

  const take = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/store/emergency/${encodeURIComponent(id)}`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(json?.message || "EMERGENCY_FAILED"));
      return json;
    },
    onSuccess: () => {
      setResult("ok");
      void qc.invalidateQueries({ queryKey: ["subscription", id] });
      void qc.invalidateQueries({ queryKey: ["emergency-portal", id] });
    },
    onError: (err: Error) =>
      setResult(/WALLET/.test(err.message) ? T.wallet : /LIMIT/.test(err.message) ? T.limit : T.fail),
  });

  const shell = `rounded-2xl p-4 ${className}`;
  if (result === "ok") {
    return (
      <div className={`${shell} bg-emerald-600 text-white`} dir={isFa ? "rtl" : "ltr"}>
        <p className="flex items-center gap-2 text-sm font-medium">
          <Check size={18} /> {T.done}
        </p>
      </div>
    );
  }
  // Only for a finished service: hidden while traffic and time remain.
  if (!data?.available || !data.eligible) return null;

  const fmt = (n: number) =>
    new Intl.NumberFormat(isFa ? "fa-IR" : "en-US", { maximumFractionDigits: 2 }).format(n);
  const adds = [
    data.addBytes ? `+${fmt(data.addBytes / 1024 ** 3)} ${T.gb}` : "",
    data.addDays ? `+${fmt(data.addDays)} ${T.day}` : "",
  ]
    .filter(Boolean)
    .join(" / ");
  const usd = String(data.currency || "").toUpperCase() === "USD";
  const cost =
    data.mode === "FREE"
      ? T.free
      : data.mode === "DEDUCT_NEXT"
        ? T.deduct
        : `${T.paid}: ${usd ? `$${fmt(data.price || 0)}` : `${fmt(data.price || 0)} ${T.toman}`}`;

  return (
    <div
      className={`${shell} border border-amber-400/50 bg-gradient-to-br from-amber-500/15 to-orange-500/10`}
      dir={isFa ? "rtl" : "ltr"}
    >
      <p className="font-semibold">{T.title}</p>
      <p className="mt-0.5 text-sm opacity-75">{T.body}</p>
      <button
        type="button"
        disabled={take.isPending}
        onClick={() => {
          if (!armed) {
            setArmed(true);
            setResult(null);
            return;
          }
          setArmed(false);
          take.mutate();
        }}
        className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-bold text-white transition ${
          armed ? "bg-red-600" : "bg-amber-500"
        }`}
      >
        {take.isPending ? <LoaderCircle size={18} className="animate-spin" /> : <Zap size={18} />}
        {armed ? T.confirm : `${T.btn} ${adds}`}
      </button>
      <p className="mt-2 text-center text-xs opacity-70">{result && result !== "ok" ? result : cost}</p>
    </div>
  );
}
