# داشبورد

::: info Community
UI: `/dashboard` · نقش: `SUPER_ADMIN` و `RESELLER`
:::

اولین صفحه بعد از [ورود](/fa/guide/login). سوپرادمین KPI سکو را می‌بیند؛ ریسلر `reseller-overview` را.

## محتوای صفحه

از `dashboard/page.tsx` و `GET /api/stats/*`:

- کارت KPI — سوپر: `overview`؛ ریسلر: `reseller-overview`
- نمودار ترافیک — `traffic-series`
- روند — `trends`
- نوار CPU / RAM / دیسک / شبکه — `monitoring` به‌علاوه Socket.IO
- کلاینت آنلاین — `onlines`
- اسنپ‌شات میزبان — `system`
- هشدار آفلاین 3x-ui / Xray (برای ایلان/پاسارگارد وضعیت Xray جعلی نشان داده نمی‌شود)
- اکشن: سینک پنل، ریستارت Xray (سوپرادمین)

`PluginSlot` تا لود باندل پرمیوم خالی است.

## Endpointها

| متد | مسیر |
|---|---|
| `GET` | `/api/stats/overview` |
| `GET` | `/api/stats/reseller-overview` |
| `GET` | `/api/stats/traffic-series` |
| `GET` | `/api/stats/trends` |
| `GET` | `/api/stats/monitoring` |
| `GET` | `/api/stats/system` |
| `GET` | `/api/stats/onlines` |
| `GET` | `/api/stats/diagnostics` |
| `POST` | `/api/stats/sync` |
| `POST` | `/api/stats/restart-xray` |

این صفحه **مانیتورینگ پرو** نیست. آن یکی `/premium/monitoring` است.

## مرتبط

- [پنل‌ها](/fa/community/panels)
- [کلاینت‌ها](/fa/community/clients)
- [مانیتورینگ پرو](/fa/premium/monitoring-pro)
