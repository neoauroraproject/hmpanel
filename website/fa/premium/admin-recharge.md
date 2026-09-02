# شارژ ادمین

::: warning Premium
ماژول `admin-recharge` · UI: `/premium/admin-recharge`
:::

پلن شارژ اعتبار ریسلر با **تأیید دستی پرداخت**.

## تب سوپرادمین

`orders` · `plans` · `payment` · `agency` · `finance`

- سفارش‌ها — تأیید رسید؛ بج سایدبار از `pending-count`
- پلن‌ها — کاتالوگ پک
- پرداخت — `settings` / `payment-settings` (کارت بانکی / کریپتو)
- آژانس — `agency/catalog`
- مالی — `GET finance`

## تب ریسلر

`buy` · `history` — `GET catalog`، `POST orders`، آپلود رسید، `GET my-orders`.

وب‌هوک: `POST /api/premium-modules/admin-recharge/webhook/:secret`.

## Endpointها (`/api/premium-modules/admin-recharge`)

`pending-count`، `categories`، `plans`، `catalog`، `orders` (+ receipt / approve / retry / reject)، `my-orders`، `finance`، `check-username`، `validate-credentials`، `settings`.

دسترسی پروایدر ایلان/پاسارگارد از Admin Management تنظیمات پرمیوم است، نه تب اصلی این صفحه.

## مرتبط

- [ترافیک](/fa/community/traffic)
- [تنظیمات پرمیوم](/fa/premium/settings)
