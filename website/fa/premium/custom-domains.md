# دامنهٔ اختصاصی

::: warning Premium
ماژول `custom-domains` · قابلیت `CUSTOM_DOMAINS` · نوع BUSINESS · مسیر: `/premium/domains`
:::

نام میزبان به‌ازای مدیر (یا فروشگاه) همراه با TLS. وضعیت: `PENDING`، `VERIFIED`، `SSL_ACTIVE`، `SSL_FAILED`، `EXPIRED`.

- افزودن دامنه، تخصیص اختیاری مدیر، شناسهٔ اختیاری فروشگاه
- تأیید DNS
- صدور TLS
- حذف

قالب‌های Nginx با نام `vhost-domain.*.template` از `${VHOST_DOMAIN}` برای این میزبان‌های مجازی استفاده می‌کنند؛ جدا از `PANEL_DOMAIN`.

## API

| روش | مسیر |
|---|---|
| `GET` | `/api/domains` |
| `POST` | `/api/domains` |
| `PATCH` | `/api/domains/:id` |
| `POST` | `/api/domains/:id/verify` |
| `POST` | `/api/domains/:id/ssl` |
| `DELETE` | `/api/domains/:id` |
| `GET` | `/api/domains/resolve` — حل عمومی بر اساس میزبان |

در مهلت ارفاق مجوز: TLS موجود قابل مشاهده و استفاده است؛ افزودن، صدور و تغییر مسدود است.

<div class="hm-actions">

[برندینگ](/fa/premium/branding)
[فروشگاه](/fa/premium/store)
[TLS پنل](/fa/community/settings#ssl)

</div>
