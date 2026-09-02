# پاکسازی

::: info Community
UI: `/cleanup` · کاندیدها بر اساس نقش محدود می‌شوند
:::

کلاینت‌هایی که بیشتر از آستانه **تنظیمات → General** (`cleanup_threshold_days`) منقضی مانده‌اند.

صفحه هشدار می‌دهد حذف **دائمی** است و **ترافیک برنمی‌گردد**. سپس `POST /api/clients/bulk` با `action: "cleanup"`.

## Endpointها

| متد | مسیر |
|---|---|
| `GET` | `/api/clients/cleanup-candidates` |
| `POST` | `/api/clients/bulk` — `{ ids, action: "cleanup" }` |
| `GET/POST` | `/api/settings` — آستانه |

حذف گروهی از صفحه کلاینت‌ها `action: "delete"` است و اگر رفراند روی ادمین روشن باشد ممکن است ترافیک برگردد. Cleanup برنمی‌گرداند.

## مرتبط

- [تنظیمات](/fa/community/settings)
- [کلاینت‌ها](/fa/community/clients)
