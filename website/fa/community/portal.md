# اشتراک

::: info Community
صفحات عمومی: `/p/:id`، کوتاه `/s/:token`. گفتگوی اتصال مدیر در کلاینت‌ها.
:::

نشانی اشتراک **platform** (`/s/…` روی این پنل) و نشانی **native** مربوط به 3x-ui (`/sub/…` روی گره) ممکن است هر دو موجود باشند. رابط اتصال در صورت وجود هر دو، دو زبانه نمایش می‌دهد (`platform` | `native`).

## صفحهٔ عمومی `/p/:id`

قالب‌های Community: Dark، Neo، Aurora، Sunset. Branding قالب و نشان‌های بیشتری می‌افزاید.

## پورتال ریسلر (Community)

مسیر: `/settings/portal`. متمایز از Branding. `portalSettings` را روی مدیر ذخیره می‌کند:

- پشتیبانی: تلگرام، واتساپ، وب‌گاه، رایانامه
- نام پورتال، نشانی نشان، رنگ اصلی
- قالب در این فرم: **Dark**
- کلیدها: QR سکو، QR بومی، بارگیری QR، ورود مستقیم، بخش پشتیبانی

`PATCH /api/admins/:id` با `{ portalSettings }`. اگر Super Admin سفارشی‌سازی پورتال را غیرفعال کرده باشد، ریسلر پاسخ HTTP 403 دریافت می‌کند.

## پیوند کوتاه

Nginx: `location /s/` → `@Controller('s')`.

| روش | مسیر |
|---|---|
| `GET` | `/s/:token` — اشتراک کوتاه عمومی |
| `GET` | `/api/subscriptions/:id` |
| `GET` | `/api/subscriptions/:id/output` |
| `GET` | `/api/subscriptions/:id/config` |
| `GET` | `/api/subscriptions/:id/nodes` |

حالت نشانی اشتراک فروشگاه (`hmpanel` یا `native`) فیلد نمایهٔ Store است.

<div class="hm-actions">

[کلاینت‌ها](/fa/community/clients)
[برندینگ](/fa/premium/branding)
[فروشگاه](/fa/premium/store)

</div>
