# دامنه سفارشی

::: warning Premium
ماژول `custom-domains` · فلگ `CUSTOM_DOMAINS` · UI: `/premium/domains`
:::

هاست‌نیم per-admin (یا فروشگاه) با SSL. وضعیت UI: `PENDING`, `VERIFIED`, `SSL_ACTIVE`, `SSL_FAILED`, `EXPIRED`.

افزودن دامنه، تخصیص ادمین، اسلاگ فروشگاه، verify DNS، صدور SSL، حذف.

قالب Nginx `vhost-domain.*.template` از `${VHOST_DOMAIN}` استفاده می‌کند (جدا از `PANEL_DOMAIN`).

## Endpointها

| متد | مسیر |
|---|---|
| `GET/POST` | `/api/domains` |
| `PATCH` | `/api/domains/:id` |
| `POST` | `/api/domains/:id/verify` · `ssl` |
| `DELETE` | `/api/domains/:id` |
| `GET` | `/api/domains/resolve` — resolve عمومی |

در grace فقط خواندن/استفاده از SSL موجود؛ افزودن/صدور قفل است.

تب SSL تنظیمات سراسری، دامنه **خود پنل** است نه vhost ریسلر.

## مرتبط

- [برندینگ](/fa/premium/branding)
- [فروشگاه](/fa/premium/store)
