# پنل‌ها

::: info Community
UI: `/panels` · فقط `SUPER_ADMIN`
:::

ثبت و مدیریت نودهای **3x-ui**. فرم افزودن، نوع 3x-ui / Eylan / Pasarguard را هم دارد. برای دو تای آخر فیلدهای Panel Plus است؛ **نوشتن در Community قفل است** (`premium_unavailable`) تا [Panel Plus](/fa/premium/panel-plus) فعال شود.

## اکشن‌های 3x-ui

- ثبت: نام، URL، اختیاری `subUrl`، توکن API یا یوزر/پسورد
- تست اتصال
- سینک اینباند/کلاینت
- اسکن قابلیت‌ها روی OpenAPI داخل `docs/api*.json`
- ریستارت Xray
- لاگ
- اینباند زنده: `GET /api/panels/:id/inbounds`
- ویرایش / حذف

UI قابلیت‌محور است: اگر API ریموت عملی را پشتیبانی نکند، دکمه قفل/مخفی می‌شود نه عدد جعلی.

## Endpointها

| متد | مسیر |
|---|---|
| `GET/POST` | `/api/panels` |
| `GET/PATCH/DELETE` | `/api/panels/:id` |
| `POST` | `/api/panels/test-connection` |
| `GET` | `/api/panels/online-ips` — ریسلر هم |
| `GET` | `/api/panels/:id/inbounds` · `logs` |
| `POST` | `/api/panels/:id/scan-capabilities` · `sync` · `restart-xray` |

باندل پرمیوم اضافه: `POST /api/premium-modules/native-panels` (تست/سینک/قطع).

## مرتبط

- [داشبورد](/fa/community/dashboard)
- [Panel Plus](/fa/premium/panel-plus)
