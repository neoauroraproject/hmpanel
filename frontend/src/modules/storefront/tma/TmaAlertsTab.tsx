"use client";

import { Bell } from "lucide-react";
import type { CustomerDashboard } from "../types";

type Notification = CustomerDashboard["notifications"][number];

export function TmaAlertsTab({
  items,
  t,
  onMarkRead,
  onMarkAllRead,
  markingAll,
}: {
  items: Notification[];
  t: (fa: string, en: string) => string;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  markingAll?: boolean;
}) {
  const unread = items.filter((n) => !n.isRead);

  return (
    <div className="animate-[fadeIn_0.28s_ease] space-y-3">
      <div className="flex items-center justify-between px-0.5">
        <h2 className="text-[22px] font-bold tracking-tight">{t("اعلان‌ها", "Alerts")}</h2>
        {unread.length ? (
          <button
            type="button"
            disabled={markingAll}
            onClick={onMarkAllRead}
            className="text-[12px] font-semibold disabled:opacity-50"
            style={{ color: "var(--tma-button)" }}
          >
            {t("خواندن همه", "Mark all read")}
          </button>
        ) : null}
      </div>

      <div className="space-y-2.5">
        {items.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => {
              if (!n.isRead) onMarkRead(n.id);
            }}
            className="w-full rounded-[1.35rem] border p-4 text-left transition active:scale-[0.99]"
            style={{
              background: n.isRead
                ? "var(--tma-card)"
                : "color-mix(in srgb, var(--tma-button) 8%, var(--tma-card))",
              borderColor: n.isRead
                ? "var(--tma-card-border)"
                : "color-mix(in srgb, var(--tma-button) 28%, var(--tma-card-border))",
            }}
          >
            <div className="flex items-start gap-3">
              <Bell
                size={16}
                className="mt-0.5 shrink-0"
                style={{ color: "var(--tma-button)" }}
              />
              <div className="min-w-0">
                <div className="font-semibold text-[14px]">{n.title}</div>
                {n.message ? (
                  <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "var(--tma-hint)" }}>
                    {n.message}
                  </p>
                ) : null}
                {n.createdAt ? (
                  <p className="mt-1.5 text-[11px]" style={{ color: "var(--tma-hint)" }}>
                    {new Date(n.createdAt).toLocaleString()}
                  </p>
                ) : null}
              </div>
            </div>
          </button>
        ))}
        {!items.length ? (
          <div
            className="rounded-[1.35rem] border border-dashed px-4 py-12 text-center text-[13px]"
            style={{ borderColor: "var(--tma-card-border)", color: "var(--tma-hint)" }}
          >
            {t("اعلانی نیست.", "No alerts.")}
          </div>
        ) : null}
      </div>
    </div>
  );
}
