# Monitoring Pro

::: warning Premium
ماژول `monitoring-pro` · نوع PLATFORM · قابلیت `ADVANCED_ANALYTICS`، `SMART_ALERTS`، `XRAY_PRO` · مسیر: `/premium/monitoring` · Super Admin
:::

متمایز از سنجش منابع داشبورد (`GET /api/stats/monitoring`). این ماژول از `/api/platform/premium-assets/frontend/premium-monitoring.js` بارگذاری می‌شود.

فضای کار: نمای سکو، شاخص به‌ازای پنل، بازه‌های تاریخچه **1h / 6h / 24h**، دسترس‌پذیری، هشدار فعال، چرخهٔ حادثه و قواعد هشدار.

## API (`/api/plugins/monitoring`)

محافظ: JWT، Premium، Super Admin، ماژول `monitoring-pro`، فقط‌خواندنی در مهلت ارفاق.

| روش | مسیر |
|---|---|
| `GET` | `platform-overview` · `dashboard` · `availability` |
| `GET` | `panels/:id` · `panels/:id/outbounds` · `panels/:id/traffic-windows` |
| `GET` | `realtime/:panelId` |
| `GET` | `history` |
| `GET` | `alerts/active` |
| `GET/PUT` | `settings` |
| `GET/POST` | `rules` · `PUT/DELETE rules/:id` |
| `GET` | `incidents` · `incidents/:id/timeline` |
| `POST` | `incidents/:id/acknowledge` · `resolve` · `reopen` · `archive` |

زمان‌بند: poll-tier-1 هر ۵ ثانیه، poll-tier-2 هر ۳۰ ثانیه (نوشتن لازم است).

<div class="hm-actions">

[داشبورد](/fa/community/dashboard)
[تنظیمات Premium](/fa/premium/settings)

</div>
