import type { CustomerService } from "../types";

const MS_DAY = 86_400_000;

export function serviceDaysLeft(service: CustomerService): number | null {
  const exp = Number(service.expiryTime || 0);
  if (!(exp > 0)) return null;
  return Math.max(0, Math.ceil((exp - Date.now()) / MS_DAY));
}

export function isExpiringSoon(service: CustomerService, withinDays = 7): boolean {
  const days = serviceDaysLeft(service);
  if (days == null) return false;
  return days <= withinDays && service.status === "active";
}

export function formatServiceExpiry(
  service: CustomerService,
  t: (fa: string, en: string) => string,
): string {
  const exp = Number(service.expiryTime || 0);
  if (!(exp > 0)) return t("بدون انقضا", "No expiry");
  const days = serviceDaysLeft(service);
  if (days === 0) return t("امروز منقضی می‌شود", "Expires today");
  if (days != null && days <= 7) {
    return t(`${days} روز مانده`, `${days} days left`);
  }
  return new Date(exp).toLocaleDateString();
}

export function trafficPercent(service: CustomerService): number {
  const total = Number(service.total);
  if (!(total > 0)) return 0;
  const used = Number(service.up) + Number(service.down);
  return Math.min(100, Math.round((used / total) * 100));
}
