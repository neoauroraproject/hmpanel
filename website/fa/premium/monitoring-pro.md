# مانیتورینگ پرو

::: warning Premium
ماژول `monitoring-pro` · فلگ‌های `ADVANCED_ANALYTICS`، `SMART_ALERTS`، `XRAY_PRO` · UI: `/premium/monitoring` · سوپرادمین
:::

نوار CPU/RAM داشبورد (`GET /api/stats/monitoring`) این صفحه نیست. این ماژول با `/api/platform/premium-assets/frontend/premium-monitoring.js` لود می‌شود.

یک فضای کاری: overview سکو، متریک per-panel، بازه تاریخچه **1h / 6h / 24h**، availability، هشدار فعال، چرخه incident، مدیر قوانین هشدار.

## Endpointها (`/api/plugins/monitoring`)

`platform-overview`، `dashboard`، `availability`، `panels/:id` (+ outbounds / traffic-windows)، `realtime/:panelId`، `history`، `alerts/active`، `settings`، `rules`، `incidents` (+ acknowledge / resolve / reopen / archive / timeline).

زمان‌بند manifest: poll هر ۵ و ۳۰ ثانیه (نیاز به write).

## مرتبط

- [داشبورد](/fa/community/dashboard)
- [تنظیمات پرمیوم](/fa/premium/settings)
