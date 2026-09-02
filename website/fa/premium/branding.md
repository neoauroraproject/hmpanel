# برندینگ

::: warning Premium
ماژول `branding` · فلگ `WHITE_LABEL` · UI: `/premium/branding`
:::

وایت‌لیبل ظاهر اشتراک و فروشگاه. [تنظیمات پورتال Community](/fa/community/portal) همان ویرایشگر کوچک Dark روی `portalSettings` می‌ماند.

## UI

تم‌ها: Aurora, Dark, Light, Eclipse, Sunset, Glass, Vibrant. آپلود لوگو / لوگو تیره، نام، توضیح، رنگ، لینک تلگرام. ریست پیش‌فرض.

فایل عمومی: `GET /api/platform/premium-assets/branding/:adminId/:file`.

## Endpointها

| متد | مسیر |
|---|---|
| `GET/PUT` | `/api/premium-modules/branding` |
| `POST` | `/api/premium-modules/branding/upload/:kind` · `reset` |

فروشگاه در manifest به branding وابسته است.

## مرتبط

- [پورتال اشتراک](/fa/community/portal)
- [دامنه سفارشی](/fa/premium/custom-domains)
- [فروشگاه](/fa/premium/store)
