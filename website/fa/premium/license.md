# لایسنس و باندل

::: warning Premium
UI: **تنظیمات → License**. سوپرادمین در Community هم می‌تواند کلید بزند و ارتقا دهد.
:::

نصب پیش‌فرض Community است. کد پرمیوم در git عمومی نیست. بعد از کلید معتبر، باندل از `license.hmray.pro` (فالبک `license.hmrayserver.com`) دانلود و ماژول Nest به‌علاوه `premium-runtime.js` لود می‌شود.

خرید / پشتیبانی: [t.me/hmraysupport](https://t.me/hmraysupport). کانال: [t.me/hmpanel](https://t.me/hmpanel).

## اکشن‌های کارت

فعال‌سازی، غیرفعال‌سازی، recheck، به‌روزرسانی باندل، reload پلاگین‌ها (بعد از باندل خراب به‌صورت خودکار لوپ 502 نمی‌سازد).

وضعیت: `active`, `grace`, `expired`, `invalid`, `community`. حالت: `full`, `read_only`, `disabled`.

**Grace:** ۷ روز در `license-manager.service.ts`. در این مدت پرمیوم **فقط خواندنی** است.

باندل با `minPanelVersion` تا `hm update` ایمیج را بالا نبرد رد می‌شود.

## Endpointها

| متد | مسیر |
|---|---|
| `GET` | `/api/platform/license` · `bundle-status` · `features` · `premium-module-catalog` · `premium-modules-all` |
| `POST` | `/api/platform/license/activate` · `deactivate` · `recheck` · `update-bundle` · `reload-plugins` · `diagnose-bundle` |
| `GET` | `/api/premium-modules` |
| `GET` | `/api/platform/premium-assets/frontend/premium-runtime.js` · `css` · `premium-monitoring.js` |
| `GET` | `/api/settings/license` |

`LICENSE_PRODUCT_ID=hmpanel`.

## مرتبط

- [تنظیمات پرمیوم](/fa/premium/settings)
