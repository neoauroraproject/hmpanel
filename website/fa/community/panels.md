# پنل‌ها

::: info Community
مسیر: `/panels` · نقش: `SUPER_ADMIN`
:::

ثبت و بهره‌برداری از گره‌های **3x-ui**. فرم همچنین انواع **3x-ui**، **Eylan** و **Pasarguard** را می‌پذیرد. ایلان و پاسارگارد از فیلدهای اتصال Panel Plus استفاده می‌کنند. عملیات نوشتن برای آن انواع در Community تا فعال بودن Panel Plus مسدود است (`premium_unavailable`).

## عملیات 3x-ui

- ثبت: نام، URL، اختیاری `subUrl`، `apiToken` یا نام کاربری و گذرواژه
- آزمایش اتصال پیش از ذخیره
- همگام‌سازی اینباند و کلاینت از API دور
- پویش قابلیت‌ها بر اساس مشخصات OpenAPI همراه
- راه‌اندازی مجدد Xray
- مشاهدهٔ گزارش‌های اخیر
- اینباند زنده: `GET /api/panels/:id/inbounds`
- ویرایش و حذف

اقداماتی که API دور پشتیبانی نمی‌کند پنهان یا غیرفعال می‌شوند.

## API

| روش | مسیر |
|---|---|
| `GET` | `/api/panels` |
| `POST` | `/api/panels` |
| `GET` | `/api/panels/:id` |
| `PATCH` | `/api/panels/:id` |
| `DELETE` | `/api/panels/:id` |
| `POST` | `/api/panels/test-connection` — `{ url, apiToken?, panelId? }` |
| `GET` | `/api/panels/online-ips` — همچنین برای `RESELLER` |
| `GET` | `/api/panels/:id/inbounds` |
| `POST` | `/api/panels/:id/scan-capabilities` |
| `POST` | `/api/panels/:id/sync` |
| `POST` | `/api/panels/:id/restart-xray` |
| `GET` | `/api/panels/:id/logs` |

باندل دارای مجوز (نه Community): `POST /api/premium-modules/native-panels` برای یاری‌گر پنل بومی.

<div class="hm-actions">

[داشبورد](/fa/community/dashboard)
[کلاینت‌ها](/fa/community/clients)
[ادمین‌ها](/fa/community/admins)
[ترافیک](/fa/community/traffic)
[مهاجرت](/fa/community/migration)
[Panel Plus](/fa/premium/panel-plus)

</div>
