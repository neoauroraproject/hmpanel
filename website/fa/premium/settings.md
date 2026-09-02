# تنظیمات پرمیوم

::: warning Premium
UI: `/settings/premium` · فقط سوپرادمین · لایسنس باید Premium باشد
:::

اگر مسیر باندل ثبت شده باشد، همان کامپوننت جایگزین لیست ساده Community می‌شود. تب‌ها:

| تب | کار |
|---|---|
| **Modules** | روشن/خاموش کردن ردیف کاتالوگ. `PATCH /api/premium-modules/:moduleId/enabled` |
| **Admin Management** | تخصیص ماژول BUSINESS به ریسلر؛ دسترسی ایلان/پاسارگارد |
| **Jobs** | [Job Center](#job-center) — در سایدبار نیست |
| **Telegram** | تست تلگرام سکو `POST /api/settings/telegram-test` |
| **Developer API** | در UI **coming soon** است. کلید API ساخته نمی‌شود. فایل‌های `docs/future-api` عمومی نیستند |

Job Center در manifest با `menus: []` از سایدبار مخفی است.

## Job Center

پول هر ۵ ثانیه.

| متد | مسیر |
|---|---|
| `GET` | `/api/platform/jobs` · `jobs/stats` |
| `POST` | `/api/platform/jobs/:id/retry` |

## تخصیص

| متد | مسیر |
|---|---|
| `GET/POST` | `/api/premium-modules/assignments` یا `/api/platform/premium-assignments` |
| `DELETE` | `/api/premium-modules/assignments/:adminId/:moduleId` |
| `PATCH` | `/api/premium-modules/:moduleId/settings` |
| `GET` | `/api/premium-modules/all` |

`BUSINESS` قابل تخصیص است؛ `PLATFORM` زیرساخت سوپرادمین.

## مرتبط

- [لایسنس](/fa/premium/license)
- [Panel Plus](/fa/premium/panel-plus)
