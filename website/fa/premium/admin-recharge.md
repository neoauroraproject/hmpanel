# شارژ ادمین

::: warning Premium
ماژول `admin-recharge` · نوع BUSINESS · مسیر: `/premium/admin-recharge`
:::

طرح اعتبار ریسلر با تأیید دستی پرداخت. Super Admin و Reseller زبانه‌های متفاوت می‌بینند.

## Super Admin

`orders` · `plans` · `payment` · `agency` · `finance`

- **Orders** — بررسی رسید معلق؛ approve، reject، retry. نشان: `GET .../pending-count`
- **Plans** — بسته‌های شارژ (`GET/POST/PATCH/DELETE plans`، دسته‌ها)
- **Payment** — `GET/PATCH settings` (نام مستعار `payment-settings`): کارت بانکی و دستورالعمل رمزارز
- **Agency** — `GET agency/catalog`
- **Finance** — `GET finance`

## ریسلر

`buy` · `history` — `GET catalog`، `POST orders`، بارگذاری رسید `POST orders/:id/receipt`، `GET my-orders`. بررسی اعتبارنامه: `GET check-username`، `POST validate-credentials`.

وب‌هوک تلگرام: `POST /api/premium-modules/admin-recharge/webhook/:secret`.

## API (`/api/premium-modules/admin-recharge`)

| روش | مسیر |
|---|---|
| `GET` | `pending-count` / `my-pending-count` |
| `GET/POST` | `categories` · `PATCH/DELETE categories/:id` |
| `GET` | `agency/catalog` |
| `GET` | `check-username` |
| `POST` | `validate-credentials` |
| `GET/PATCH` | `settings` یا `payment-settings` |
| `GET/POST` | `plans` · `PATCH/DELETE plans/:id` |
| `GET` | `catalog` |
| `POST` | `orders` |
| `POST` | `orders/:id/receipt` |
| `GET` | `my-orders` · `orders` |
| `POST` | `orders/:id/approve` · `retry` · `reject` |
| `GET` | `finance` |

مجوز ایلان و پاسارگارد برای ریسلر در تنظیمات Premium → Admin Management (`admin-provider-access`) پیکربندی می‌شود.

<div class="hm-actions">

[ترافیک](/fa/community/traffic)
[تنظیمات Premium](/fa/premium/settings)

</div>
