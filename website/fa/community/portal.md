# پورتال اشتراک

::: info Community
صفحات عمومی: `/p/:id`، کوتاه `/s/:token`. مودال اتصال در کلاینت‌ها.
:::

اچ‌ام‌پنل می‌تواند لینک **پلتفرم** (`/s/…`) و لینک **نیتیو** 3x-ui (`/sub/…`) را نشان دهد. مودال اتصال دو تب دارد وقتی هر دو موجود باشند.

## صفحه `/p/:id`

تم‌های Community شامل Dark / Neo / Aurora / Sunset. [برندینگ پرمیوم](/fa/premium/branding) تم و لوگو را گسترش می‌دهد.

## برندینگ ریسلر (رایگان)

UI: `/settings/portal` — نه ماژول Branding. ذخیره روی `portalSettings`:

- تلگرام، واتساپ، وبسایت، ایمیل
- نام پورتال، لوگو، رنگ
- در این فرم Community فقط تم **Dark**
- نمایش QR پلتفرم/نیتیو، دانلود QR، ایمپورت مستقیم، بخش پشتیبانی

`PATCH /api/admins/:id` با `{ portalSettings }`. اگر سوپر سفارشی‌سازی را بسته باشد، 403 و کارت Feature Disabled.

## لینک کوتاه

Nginx: `/s/` → `@Controller('s')`.

| متد | مسیر |
|---|---|
| `GET` | `/s/:token` |
| `GET` | `/api/subscriptions/:id` · `output` · `config` · `nodes` |

حالت لینک فروشگاه (`hmpanel` / `native`) فیلد پروفایل Store پرمیوم است.

قالب HTML سفارشی خود 3x-ui در `docs/custom-subscription-templates.md` است.

## مرتبط

- [کلاینت‌ها](/fa/community/clients)
- [برندینگ](/fa/premium/branding)
- [فروشگاه](/fa/premium/store)
