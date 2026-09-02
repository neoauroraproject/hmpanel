# برندینگ

::: warning Premium
ماژول `branding` · قابلیت `WHITE_LABEL` · نوع BUSINESS · مسیر: `/premium/branding`
:::

ظاهر سفیدبرچسب برای صفحات اشتراک و فروشگاه. تنظیمات پورتال Community ویرایشگر قالب Dark روی `portalSettings` باقی می‌ماند.

قالب‌ها: **Aurora, Dark, Light, Eclipse, Sunset, Glass, Vibrant**. بارگذاری نشان و نشان تیره، نام، شرح، رنگ، پیوند تلگرام و پشتیبانی. بازگشت به پیش‌فرض.

پروندهٔ نشان عمومی: `GET /api/platform/premium-assets/branding/:adminId/:file`.

## API

| روش | مسیر |
|---|---|
| `GET` | `/api/premium-modules/branding` |
| `PUT` | `/api/premium-modules/branding` |
| `POST` | `/api/premium-modules/branding/upload/:kind` |
| `POST` | `/api/premium-modules/branding/reset` |

Store مقدار `branding` را به‌عنوان وابستگی فهرست می‌کند.

<div class="hm-actions">

[اشتراک](/fa/community/portal)
[دامنهٔ اختصاصی](/fa/premium/custom-domains)
[فروشگاه](/fa/premium/store)

</div>
