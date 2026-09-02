# تنظیمات Premium

::: warning Premium
مسیر: `/settings/premium` · نقش: `SUPER_ADMIN` · نسخه باید `PREMIUM` باشد
:::

هنگامی که باندل مسیر `/settings/premium` را ثبت کند، آن نما فهرست پشتیبان Community را جایگزین می‌کند.

| زبانه | محتوا |
|---|---|
| **Modules** | فعال یا غیرفعال کردن ردیف‌های فهرست (`branding`، `custom-domains`، `client-templates`، `store`، `external-panels`، `admin-recharge`، `monitoring-pro`، `backup-center`، `job-center`). `PATCH /api/premium-modules/:moduleId/enabled` |
| **Admin Management** | تخصیص ماژول BUSINESS به ریسلر؛ دسترسی پروایدر ایلان و پاسارگارد |
| **Jobs** | Job Center (آیتم نوار کناری نیست) |
| **Telegram** | آزمایش تلگرام سکو (`POST /api/settings/telegram-test`) |
| **Developer API** | coming soon. API صدور کلید منتشر نشده است |

پشتیبان Community (بدون رابط باندل): فهرست ماژول‌های فعال.

Job Center از نوار کناری حذف شده است (`menus: []`).

## Job Center

بازهٔ پرسش: ۵ ثانیه.

| روش | مسیر |
|---|---|
| `GET` | `/api/platform/jobs` |
| `GET` | `/api/platform/jobs/stats` — queued، running، completed، failed |
| `POST` | `/api/platform/jobs/:id/retry` |

## تخصیص

| روش | مسیر |
|---|---|
| `GET` | `/api/premium-modules/assignments` یا `/api/platform/premium-assignments` |
| `POST` | `/api/premium-modules/assignments` یا `/api/platform/premium-assignments` |
| `DELETE` | `/api/premium-modules/assignments/:adminId/:moduleId` |
| `PATCH` | `/api/premium-modules/:moduleId/settings` |
| `GET` | `/api/premium-modules/all` |

انواع مانیفست: `BUSINESS` (قابل تخصیص) و `PLATFORM` (زیرساخت Super Admin).

<div class="hm-actions">

[مجوز](/fa/premium/license)
[ماژول‌ها](/fa/premium/modules)
[Panel Plus](/fa/premium/panel-plus)

</div>
