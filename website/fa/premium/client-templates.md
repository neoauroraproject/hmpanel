# قالب کلاینت

::: warning Premium
ماژول `client-templates` · نوع BUSINESS · مسیر: `/premium/client-templates`
:::

پیش‌تنظیم برای ایجاد سریع کلاینت: قالب را انتخاب کنید، نام را وارد نمایید (یا نام بعدی را از استخر نام تخصیص دهید)، سپس ایجاد کنید. صفحهٔ کلاینت‌ها هنگام بارگذاری این ماژول **With Template** را نمایش می‌دهد.

## فیلدهای قالب

نام، شرح، شناسهٔ اینباند، کل گیگابایت، روز انقضا، محدودیت IP، flow، نامک، فعال، ترتیب.

## استخر نام

پیشوند، جداکننده، شمارهٔ شروع، نام‌های نمونه. `POST .../pools/:poolId/next-name` و `POST .../:id/next-name` نامک بعدی را تخصیص می‌دهند.

## API

| روش | مسیر |
|---|---|
| `GET` | `/api/premium-modules/client-templates` |
| `GET` | `/api/premium-modules/client-templates/:id` |
| `POST` | `/api/premium-modules/client-templates` |
| `PATCH` | `/api/premium-modules/client-templates/:id` |
| `DELETE` | `/api/premium-modules/client-templates/:id` |
| `POST` | `/api/premium-modules/client-templates/:id/next-name` |
| `GET` | `/api/premium-modules/client-templates/pools` |
| `POST` | `/api/premium-modules/client-templates/pools` |
| `PATCH` | `/api/premium-modules/client-templates/pools/:poolId` |
| `DELETE` | `/api/premium-modules/client-templates/pools/:poolId` |
| `POST` | `/api/premium-modules/client-templates/pools/:poolId/next-name` |

<div class="hm-actions">

[کلاینت‌ها](/fa/community/clients)

</div>
