"use client";

import { Bell, ClipboardList, Home, Package, ShoppingBag } from "lucide-react";
import { clsx } from "clsx";
import { useStorefrontLocale } from "../locale";

export type TmaTab = "home" | "services" | "shop" | "orders" | "alerts";

export function TmaBottomNav({
  tab,
  onChange,
  accent,
  unreadAlerts = 0,
}: {
  tab: TmaTab;
  onChange: (next: TmaTab) => void;
  accent?: string;
  unreadAlerts?: number;
}) {
  const { t } = useStorefrontLocale();
  const tabs: Array<{ id: TmaTab; label: string; icon: typeof ShoppingBag; badge?: number }> = [
    { id: "home", label: t("خانه", "Home"), icon: Home },
    { id: "services", label: t("سرویس", "Services"), icon: Package },
    { id: "shop", label: t("فروشگاه", "Shop"), icon: ShoppingBag },
    { id: "orders", label: t("سفارش", "Orders"), icon: ClipboardList },
    { id: "alerts", label: t("اعلان", "Alerts"), icon: Bell, badge: unreadAlerts },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 px-2 pb-[max(0.55rem,env(safe-area-inset-bottom))] pt-2"
      style={{
        background:
          "linear-gradient(to top, color-mix(in srgb, var(--tma-bg) 96%, transparent) 55%, transparent)",
      }}
    >
      <div
        className="mx-auto flex max-w-lg items-stretch justify-between gap-0.5 rounded-[1.6rem] border px-1 py-1.5 shadow-[0_-10px_32px_rgba(37,99,235,0.10)] backdrop-blur-xl"
        style={{
          background: "color-mix(in srgb, var(--tma-secondary-bg, var(--tma-bg)) 94%, transparent)",
          borderColor: "var(--tma-card-border, color-mix(in srgb, var(--tma-hint) 28%, transparent))",
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
                "relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-[1.2rem] px-1 py-2 text-[9px] font-semibold tracking-wide transition-transform active:scale-95",
                active ? "opacity-100" : "opacity-50",
              )}
              style={{
                color: active ? accent || "var(--tma-button)" : "var(--tma-hint)",
                background: active
                  ? "color-mix(in srgb, var(--tma-button) 14%, transparent)"
                  : "transparent",
              }}
            >
              <span className="relative">
                <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                {item.badge && item.badge > 0 ? (
                  <span
                    className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white"
                    style={{ background: "#ef4444" }}
                  >
                    {item.badge > 9 ? "9+" : item.badge}
                  </span>
                ) : null}
              </span>
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
