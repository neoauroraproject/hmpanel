# مجوز

::: warning Premium
مسیر: **Settings → License** (`/settings`، زبانهٔ `license`). Super Admin می‌تواند کلید را از Community فعال کند.
:::

نصب پیش‌فرض Community است (`RELEASE_MODE=COMMUNITY`). مبدأ Premium در مخزن عمومی نیست. پس از کلید معتبر، پنل باندل امضاشده را از `license.hmray.pro` (پشتیبان `license.hmrayserver.com`) بارگیری می‌کند و ماژول‌های NestJS را همراه با `premium-runtime.js` بار می‌گذارد.

خرید و پشتیبانی: [t.me/hmraysupport](https://t.me/hmraysupport). کانال: [t.me/hmpanel](https://t.me/hmpanel).

## اقدامات کارت

- Activate — درج کلید مجوز
- Deactivate — پرونده‌های باندل ممکن است روی دیسک بمانند
- Recheck — استعلام از کارساز مجوز
- Update bundle — بارگیری باندل جاری برای این کلید
- Reload plugins — پس از باندل ناموفق به‌صورت خودکار اجرا نمی‌شود

وضعیت: `active`، `grace`، `expired`، `invalid`، `community`. حالت: `full`، `read_only`، `disabled`. نسخه: `COMMUNITY` | `PREMIUM`.

مهلت ارفاق: ۷ روز. در این مدت Premium به‌صورت **فقط‌خواندنی** باقی می‌ماند. پس از آن ماژول‌ها غیرفعال می‌شوند.

باندل دارای `minPanelVersion` تا زمان ارتقای تصویر با `hm update` رد می‌شود.

## API

| روش | مسیر |
|---|---|
| `GET` | `/api/platform/license` |
| `POST` | `/api/platform/license/activate` — `{ licenseKey }` |
| `POST` | `/api/platform/license/deactivate` |
| `POST` | `/api/platform/license/recheck` |
| `POST` | `/api/platform/license/update-bundle` |
| `POST` | `/api/platform/license/reload-plugins` |
| `POST` | `/api/platform/license/diagnose-bundle` |
| `GET` | `/api/platform/license/bundle-status` |
| `GET` | `/api/platform/features` |
| `GET` | `/api/platform/premium-module-catalog` |
| `GET` | `/api/platform/premium-modules-all` |
| `GET` | `/api/premium-modules` |
| `GET` | `/api/platform/premium-assets/frontend/premium-runtime.js` |
| `GET` | `/api/platform/premium-assets/frontend/premium-runtime.css` |
| `GET` | `/api/platform/premium-assets/frontend/premium-monitoring.js` |
| `GET` | `/api/settings/license` |

شناسهٔ محصول: `LICENSE_PRODUCT_ID=hmpanel`.

<div class="hm-actions">

[تنظیمات Premium](/fa/premium/settings)
[ماژول‌ها](/fa/premium/modules)
[مقایسهٔ نسخه‌ها](/fa/compare)

</div>
