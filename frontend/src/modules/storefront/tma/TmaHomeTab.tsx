"use client";

import { AlertTriangle, ArrowUpRight, Link2, Package, Plus } from "lucide-react";
import type { CustomerOrder, CustomerService } from "../types";
import {
  formatServiceExpiry,
  isExpiringSoon,
  serviceDaysLeft,
  trafficPercent,
} from "./tma-service-utils";

function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      className="rounded-[1.2rem] border p-3.5"
      style={{
        background: accent
          ? "color-mix(in srgb, var(--tma-button) 10%, var(--tma-card))"
          : "var(--tma-card)",
        borderColor: "var(--tma-card-border)",
      }}
    >
      <div className="text-[11px] font-medium" style={{ color: "var(--tma-hint)" }}>
        {label}
      </div>
      <div className="mt-1 text-[22px] font-bold tracking-tight">{value}</div>
      {hint ? (
        <div className="mt-0.5 text-[11px]" style={{ color: "var(--tma-hint)" }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

export function TmaHomeTab({
  services,
  activeServices,
  orders,
  unreadAlerts,
  t,
  onOpenServices,
  onOpenAlerts,
  onOpenShop,
  onLinkSub,
  onRenewService,
}: {
  services: CustomerService[];
  activeServices: CustomerService[];
  orders: CustomerOrder[];
  unreadAlerts: number;
  t: (fa: string, en: string) => string;
  onOpenServices: () => void;
  onOpenAlerts: () => void;
  onOpenShop: () => void;
  onLinkSub: () => void;
  onRenewService: (s: CustomerService) => void;
}) {
  const expiring = activeServices.filter((s) => isExpiringSoon(s));
  const pendingOrders = orders.filter((o) =>
    ["PENDING_PAYMENT", "PAYMENT_SUBMITTED", "UNDER_REVIEW", "APPROVED", "PROVISIONING"].includes(
      o.status,
    ),
  );

  return (
    <div className="animate-[fadeIn_0.28s_ease] space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        <StatCard label={t("سرویس فعال", "Active services")} value={activeServices.length} />
        <StatCard
          label={t("در صف", "In queue")}
          value={pendingOrders.length}
          hint={unreadAlerts ? t(`${unreadAlerts} اعلان`, `${unreadAlerts} alerts`) : undefined}
          accent={!!unreadAlerts}
        />
      </div>

      {expiring.length ? (
        <div
          className="rounded-[1.35rem] border p-4"
          style={{
            borderColor: "color-mix(in srgb, #f59e0b 35%, var(--tma-card-border))",
            background: "color-mix(in srgb, #f59e0b 8%, var(--tma-card))",
          }}
        >
          <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-amber-700 dark:text-amber-300">
            <AlertTriangle size={16} />
            {t("به زودی منقضی می‌شود", "Expiring soon")}
          </div>
          <ul className="space-y-2">
            {expiring.slice(0, 3).map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onRenewService(s)}
                  className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-left active:scale-[0.98]"
                  style={{ background: "color-mix(in srgb, var(--tma-bg) 60%, transparent)" }}
                >
                  <span className="min-w-0 truncate text-[13px] font-medium">
                    {s.remark || s.email}
                  </span>
                  <span className="shrink-0 text-[12px] font-bold text-amber-600">
                    {formatServiceExpiry(s, t)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={onOpenShop}
          className="flex h-[3.2rem] items-center justify-center gap-2 rounded-[1.15rem] text-[14px] font-semibold text-white active:scale-[0.98]"
          style={{
            background: "var(--tma-button)",
            boxShadow: "0 8px 20px color-mix(in srgb, var(--tma-button) 28%, transparent)",
          }}
        >
          <Plus size={17} />
          {t("خرید جدید", "New purchase")}
        </button>
        <button
          type="button"
          onClick={onLinkSub}
          className="flex h-[3.2rem] items-center justify-center gap-2 rounded-[1.15rem] border text-[14px] font-semibold active:scale-[0.98]"
          style={{
            background: "var(--tma-secondary-bg)",
            borderColor: "var(--tma-card-border)",
          }}
        >
          <Link2 size={17} />
          {t("لینک ساب", "Sub link")}
        </button>
      </div>

      {activeServices.length ? (
        <div>
          <div className="mb-2 flex items-center justify-between px-0.5">
            <span className="text-[13px] font-semibold">{t("سرویس‌های شما", "Your services")}</span>
            <button
              type="button"
              onClick={onOpenServices}
              className="inline-flex items-center gap-1 text-[12px] font-semibold"
              style={{ color: "var(--tma-button)" }}
            >
              {t("همه", "All")}
              <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="space-y-2">
            {activeServices.slice(0, 3).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={onOpenServices}
                className="w-full rounded-[1.2rem] border p-3.5 text-left active:scale-[0.99]"
                style={{
                  background: "var(--tma-card)",
                  borderColor: "var(--tma-card-border)",
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 truncate text-[14px] font-semibold">
                    {s.remark || s.email}
                  </div>
                  <Package size={16} style={{ color: "var(--tma-button)" }} />
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${trafficPercent(s)}%`,
                      background: "var(--tma-button)",
                    }}
                  />
                </div>
                <div className="mt-1.5 flex justify-between text-[11px]" style={{ color: "var(--tma-hint)" }}>
                  <span>{formatServiceExpiry(s, t)}</span>
                  {serviceDaysLeft(s) != null ? (
                    <span>{trafficPercent(s)}% {t("مصرف", "used")}</span>
                  ) : (
                    <span>{t("نامحدود", "Unlimited")}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div
          className="rounded-[1.35rem] border border-dashed px-4 py-8 text-center text-[13px]"
          style={{ borderColor: "var(--tma-card-border)", color: "var(--tma-hint)" }}
        >
          {t("هنوز سرویسی ندارید. خرید کنید یا لینک ساب قبلی را اضافه کنید.", "No services yet. Buy a plan or add a previous sub link.")}
        </div>
      )}

      {unreadAlerts ? (
        <button
          type="button"
          onClick={onOpenAlerts}
          className="flex w-full items-center justify-between rounded-[1.2rem] border px-4 py-3.5 text-left active:scale-[0.99]"
          style={{
            borderColor: "color-mix(in srgb, var(--tma-button) 25%, var(--tma-card-border))",
            background: "color-mix(in srgb, var(--tma-button) 8%, var(--tma-card))",
          }}
        >
          <span className="text-[13px] font-semibold">{t("اعلان‌های خوانده‌نشده", "Unread alerts")}</span>
          <span
            className="rounded-full px-2.5 py-0.5 text-[11px] font-bold text-white"
            style={{ background: "var(--tma-button)" }}
          >
            {unreadAlerts}
          </span>
        </button>
      ) : null}
    </div>
  );
}
