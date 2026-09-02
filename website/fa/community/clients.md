# کلاینت‌ها

::: info Community
UI: `/clients` · `SUPER_ADMIN` و `RESELLER` (محدود به پنل/اینباند مجاز)
:::

لیست، فیلتر، ساخت، ویرایش گروهی، خروجی اشتراک برای کلاینت‌های 3x-ui. گروه نیتیو با گروه 3x-ui یکی است.

## فیلتر و چیپ

- نوار پنل: همه + هر پنل قابل دسترس. اگر چند پنل باشد، ساخت/ساخت گروهی پنل می‌خواهد
- فیلتر سریع: همه، آنلاین، ترافیک کم، نزدیک انقضا، غیرفعال، منقضی، بدون ترافیک
- کوئری: جستجو، اینباند، `panelType`، ادمین (سوپر)، انقضا، بازه ترافیک

اینباند ایلان/پاسارگارد ممکن است دیده شود. **نوشتن قفل است** تا [Panel Plus](/fa/premium/panel-plus) لایسنس شود.

## ساخت / ویرایش

`POST /api/clients`، `PATCH /api/clients/:id`. **با قالب** وقتی ماژول Client Templates لود شده باشد.

## گروهی

`POST /api/clients/bulk`: `enable`, `disable`, `delete`, `cleanup`, `addTraffic`, `addDays`, `resetUsage`, `resetTraffic`, `assignGroup`, `assignInbounds`.

فعال/غیرفعال سریع‌تر: `POST /api/bulk-clients/enable` و `disable`. خروجی لینک: `export-subs`. ساخت گروهی: `bulk-create` بعد از `validate`.

## خروجی اتصال

خروجی پروتکل، QR، فایل کانفیگ. مودال اشتراک تب **پلتفرم / نیتیو** دارد — [پورتال اشتراک](/fa/community/portal).

## Endpointها

| متد | مسیر |
|---|---|
| `GET` | `/api/clients` |
| `POST` | `/api/clients` |
| `GET/PATCH/DELETE` | `/api/clients/:id` |
| `GET` | `/api/clients/:id/output` · `config` · `qrcode` |
| `GET` | `/api/clients/groups` |
| `POST` | `/api/clients/bulk-create` · `bulk-create/validate` · `bulk` |
| `GET` | `/api/clients/cleanup-candidates` |
| `POST` | `/api/bulk-clients/enable` · `disable` · `export-subs` |
| `GET` | `/api/inbounds` · `PATCH /api/inbounds/:id` |
| `GET` | `/api/panels/online-ips` |

## مرتبط

- [پنل‌ها](/fa/community/panels)
- [پاکسازی](/fa/community/cleanup)
- [قالب کلاینت](/fa/premium/client-templates)
