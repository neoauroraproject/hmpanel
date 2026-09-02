# قالب کلاینت

::: warning Premium
ماژول `client-templates` · UI: `/premium/client-templates`
:::

ساخت سریع: انتخاب قالب، نام (یا نام بعدی از **استخر نام**). صفحه کلاینت‌ها دکمه **با قالب** را نشان می‌دهد.

فیلد قالب: نام، توضیح، اینباندها، گیگ، روز انقضا، سقف IP، flow، remark، فعال، ترتیب.

استخر نام: پیشوند، جداکننده، شماره شروع. `POST .../next-name` نام بعدی را می‌دهد.

## Endpointها

| متد | مسیر |
|---|---|
| `GET/POST` | `/api/premium-modules/client-templates` |
| `GET/PATCH/DELETE` | `/api/premium-modules/client-templates/:id` |
| `POST` | `/api/premium-modules/client-templates/:id/next-name` |
| `GET/POST` | `/api/premium-modules/client-templates/pools` |
| `PATCH/DELETE` | `.../pools/:poolId` |
| `POST` | `.../pools/:poolId/next-name` |

## مرتبط

- [کلاینت‌ها](/fa/community/clients)
