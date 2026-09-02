# داشبورد

::: info Community
مسیر: `/dashboard` · نقش: `SUPER_ADMIN`، `RESELLER`
:::

نمای پیش‌فرض پس از ورود. Super Admin شاخص‌های سکو را دریافت می‌کند. ریسلر `reseller-overview` را دریافت می‌کند (کلاینت‌ها، ترافیک باقی‌مانده و ظرفیت).

## محتوا

داده از `GET /api/stats/*` تأمین می‌شود.

- کارت شاخص — Super Admin: `overview`؛ ریسلر: `reseller-overview`
- سری ترافیک — `traffic-series`
- روند — `trends`
- سنجش منابع میزبان (CPU، RAM، دیسک، شبکه) — `monitoring`، همراه با به‌روزرسانی Socket.IO
- کلاینت‌های برخط — `onlines`
- نمای میزبان — `system`
- هشدار آفلاین برای 3x-ui / Xray. هشدارهای ایلان و پاسارگارد جداگانه پالایش می‌شوند
- عملیات: همگام‌سازی پنل و راه‌اندازی مجدد Xray (Super Admin)

ویجت‌های Premium تنها پس از بارگذاری باندل دارای مجوز ظاهر می‌شوند.

سنجش منابع این صفحه با Monitoring Pro (`/premium/monitoring`) متفاوت است.

## API

| روش | مسیر | توضیح |
|---|---|---|
| `GET` | `/api/stats/overview` | شاخص Super Admin |
| `GET` | `/api/stats/reseller-overview` | شاخص ریسلر |
| `GET` | `/api/stats/traffic-series` | سری نمودار |
| `GET` | `/api/stats/trends` | کارت روند |
| `GET` | `/api/stats/monitoring` | نمای CPU، RAM، دیسک و شبکه |
| `GET` | `/api/stats/system` | اطلاعات میزبان |
| `GET` | `/api/stats/onlines` | فهرست کلاینت برخط |
| `GET` | `/api/stats/diagnostics` | بار تشخیصی |
| `POST` | `/api/stats/sync` | همگام‌سازی پنل |
| `POST` | `/api/stats/restart-xray` | راه‌اندازی مجدد Xray روی گره |

<div class="hm-actions">

[پنل‌ها](/fa/community/panels)
[کلاینت‌ها](/fa/community/clients)
[Monitoring Pro](/fa/premium/monitoring-pro)

</div>
