"use client";

import { ShoppingBag, Package, ClipboardList, UserRound } from "lucide-react";
import { clsx } from "clsx";
import { useStorefrontLocale } from "../locale";

export type TmaTab = "shop" | "services" | "orders" | "profile";

export function TmaBottomNav({
  tab,
  onChange,
  accent,
}: {
  tab: TmaTab;
  onChange: (next: TmaTab) => void;
  accent?: string;
}) {
  const { t } = useStorefrontLocale();
  const tabs: Array<{ id: TmaTab; label: string; icon: typeof ShoppingBag }> = [
    { id: "shop", label: t("فروشگاه", "Shop"), icon: ShoppingBag },
    { id: "services", label: t("سرویس", "Services"), icon: Package },
    { id: "orders", label: t("سفارش", "Orders"), icon: ClipboardList },
    { id: "profile", label: t("پروفایل", "Profile"), icon: UserRound },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.55rem,env(safe-area-inset-bottom))] pt-2"
      style={{
        background:
          "linear-gradient(to top, color-mix(in srgb, var(--tma-bg) 96%, transparent) 55%, transparent)",
      }}
    >
      <div
        className="mx-auto flex max-w-lg items-stretch justify-between gap-1 rounded-[1.35rem] border px-1.5 py-1.5 shadow-[0_-8px_30px_rgba(0,0,0,0.18)] backdrop-blur-xl"
        style={{
          background: "color-mix(in srgb, var(--tma-secondary-bg, var(--tma-bg)) 92%, transparent)",
          borderColor: "color-mix(in srgb, var(--tma-hint) 28%, transparent)",
        }}
      >
        {tabs.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={clsx(
                "relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-[1.05rem] px-2 py-2 text-[10px] font-semibold tracking-wide transition-transform active:scale-95",
                active ? "opacity-100" : "opacity-55",
              )}
              style={{
                color: active ? accent || "var(--tma-button)" : "var(--tma-hint)",
                background: active
                  ? "color-mix(in srgb, var(--tma-button) 16%, transparent)"
                  : "transparent",
              }}
            >
              <Icon size={21} strokeWidth={active ? 2.5 : 2} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
