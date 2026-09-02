# فروشگاه

::: warning Premium
ماژول `store` · فلگ `CUSTOM_SUBSCRIPTION_PORTAL` · وابسته به branding · UI: `/premium/store`
:::

ادمین فروشگاه + شاپ عمومی + پورتال مشتری + مینی‌اپ تلگرام.

## تب‌های ادمین

| تب | زیرتب |
|---|---|
| Overview | Summary (`GET dashboard`)، Analytics |
| Commerce | سفارش، محصول، دسته، پروفایل پروویژن، کوپن، واریز کیف‌پول، سقف IP |
| Customers | فهرست، broadcast تلگرام |
| Settings | پروفایل فروشگاه، ربات تلگرام، ادآن محصول |

سفارش: approve / reject / provision / cancel / manual-deliver.

مسیر عمومی: `/shop/:slug`، `/portal`، `/track/:code`. تب پورتال مشتری: home / orders / alerts. نوار TMA: home / services / shop / orders / alerts.

چک‌اوت مشترک: دسته → محصول → نام + ادآن → پرداخت. کوپن: `both` / `new` / `renewal`.

## API ادمین `/api/premium-modules/store`

گارد JWT + Premium + ماژول store. شامل dashboard، profile، categories (+ reorder)، profiles، templates (+ clone)، products (+ reorder)، ip-limits، product-addons، سفارش‌ها، مشتری‌ها، telegram (+ broadcast)، coupons، referral-rewards، wallet، analytics، ادآن ایلان/پاسارگارد.

ریپوی Community زیرمجموعه کوچک‌تری از همین پیشوند را دارد.

## API عمومی `/api/store`

`public/:slug`، `public/by-domain`، سفارش مهمان، اعتبارسنجی کوپن، `track/:code`، session مشتری (`x-customer-session`)، portal token، webhook تلگرام، کیف‌پول.

## مرتبط

- [برندینگ](/fa/premium/branding)
- [دامنه سفارشی](/fa/premium/custom-domains)
- [Panel Plus](/fa/premium/panel-plus)
