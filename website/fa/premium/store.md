# فروشگاه

::: warning Premium
ماژول `store` · قابلیت `CUSTOM_SUBSCRIPTION_PORTAL` · وابسته به branding · مسیر: `/premium/store`
:::

فروشگاه مدیر، فروشگاه عمومی، پورتال مشتری و مینی‌اپ تلگرام. درخت Community زیرمجموعه‌ای از کنترلرهای Store را شامل می‌شود. باندل دارای مجوز کوپن، کیف پول، محدودیت IP، تحلیل، پخش و افزونه را می‌افزاید.

## زبانه‌های مدیر

| زبانه | محتوا |
|---|---|
| Overview | خلاصه (`GET .../dashboard`)، Analytics (`GET .../analytics`) |
| Commerce | سفارش‌ها، محصولات، دسته‌ها، نمایه‌های تأمین، کوپن، واریز کیف پول، محدودیت IP |
| Customers | فهرست، پخش تلگرام |
| Settings | نمایهٔ فروشگاه، ربات تلگرام، افزونهٔ محصول (ایلان / پاسارگارد) |

سفارش: approve، reject، provision، cancel، manual-deliver. مشتری: اتصال و به‌روزرسانی خدمت.

مسیرهای عمومی (بدون JWT مدیر): `/shop/:slug`، `/shop/:slug/portal`، `/portal`، `/portal/dashboard`، `/track/:code`. پورتال مشتری: **home / orders / alerts**. مینی‌اپ: **home / services / shop / orders / alerts**.

تسویه (مهمان، پورتال، مینی‌اپ): دسته → محصول → نام و افزونه → پرداخت. کوپن ممکن است محدود به `both`، `new` یا `renewal` باشد.

## API مدیر (`/api/premium-modules/store`)

محافظ: JWT، Premium، ماژول `store`.

| حوزه | روش‌ها |
|---|---|
| Dashboard / profile | `GET dashboard`، `GET/PUT profile` |
| Categories | `GET/POST categories`، `POST categories/reorder`، `PATCH/DELETE categories/:id` |
| Profiles | `GET profiles`، `GET provisioning-options`، `POST/PATCH/DELETE profiles/:id` |
| Templates | `GET/POST templates`، `PATCH/DELETE templates/:id`، `POST templates/:id/clone` |
| Products | `GET/POST products`، `POST products/reorder`، `PATCH/DELETE products/:id` |
| IP limits | `GET/POST ip-limits`، `DELETE ip-limits/:id`، `POST ip-limits/migrate-legacy` |
| Add-ons | `GET/POST product-addons`، `DELETE product-addons/:id`؛ ایلان/پاسارگارد `GET/PUT addons/:provider`، test، options، grants |
| Orders | `GET orders`، `GET orders/:id`، `POST orders/:id/approve\|reject\|provision\|cancel\|manual-deliver`، `PATCH orders/:id` |
| Customers | `GET customers`، `GET customers/:id`، `POST customers/:id/services/attach`، `PATCH customers/:id/services/:clientId` |
| Telegram | `GET/PUT telegram`، `POST telegram/test`، `POST telegram/activate`، `GET telegram/broadcast/preview`، `POST telegram/broadcast` |
| Coupons | `GET/POST coupons`، `DELETE coupons/:id` |
| Referral | `GET/POST referral-rewards`، `DELETE referral-rewards/:id` |
| Wallet | `GET wallet/deposits`، `POST wallet/deposits/:id/approve\|reject`، `POST wallet/customers/:customerId/adjust` |
| Analytics | `GET analytics` |

## API عمومی (`/api/store`)

| روش | مسیر |
|---|---|
| `GET` | `/api/store/public/:slug` |
| `GET` | `/api/store/public/by-domain` |
| `POST` | `/api/store/public/:slug/customer` |
| `POST` | `/api/store/public/:slug/order` |
| `POST` | `/api/store/public/:slug/coupon/validate` |
| `POST` | `/api/store/public/:slug/coupons/applicable` |
| `GET` | `/api/store/track/:code` |
| `POST` | `/api/store/customer/session` |
| `GET` | `/api/store/customer/session` |
| `POST` | `/api/store/customer/logout` |
| `POST` | `/api/store/customer/order` |
| `POST` | `/api/store/customer/renew` |
| `POST` | `/api/store/customer/orders/:id/cancel` |
| `POST` | `/api/store/customer/services/claim` |
| `GET` | `/api/store/portal/:token` |
| `POST` | `/api/store/portal/:token/renew` |
| `POST` | `/api/store/telegram/session` |
| `POST` | `/api/store/telegram/webhook/:slug/:secret` |
| `GET` | `/api/store/customer/wallet` |
| `POST` | `/api/store/customer/wallet/deposit` |

سرایند نشست مشتری: `x-customer-session`.

<div class="hm-actions">

[برندینگ](/fa/premium/branding)
[دامنهٔ اختصاصی](/fa/premium/custom-domains)
[Panel Plus](/fa/premium/panel-plus)

</div>
