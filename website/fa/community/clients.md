# کلاینت‌ها

::: info Community
مسیر: `/clients` · نقش: `SUPER_ADMIN`، `RESELLER` (محدود به پنل و اینباند تخصیص‌یافته)
:::

فهرست، پالایش، ایجاد، ویرایش گروهی و صدور پیوند اشتراک برای کلاینت‌های 3x-ui. گروه بومی با گروه 3x-ui متناظر است.

## پالایش

- انتخاب پنل: همهٔ پنل‌های در دسترس. ایجاد و ایجاد گروهی در صورت وجود بیش از یک پنل، انتخاب پنل را الزامی می‌کند
- وضعیت: All، Online، Low traffic، Expiring soon، Disabled، Expired، No traffic
- پالایش پرس‌وجو: جستجو، اینباند، `panelType`، ادمین (Super Admin)، انقضا، بازهٔ ترافیک

اینباندهای ایلان و پاسارگارد ممکن است در فهرست ظاهر شوند. عملیات نوشتن تا زمان مجوز داشتن Panel Plus مسدود است (`premium_unavailable`).

## ایجاد و ویرایش

`POST /api/clients`، `PATCH /api/clients/:id` — نامک، ترافیک، انقضا، محدودیت IP، اینباند، پرچم فعال‌سازی، گروه.

**With Template** هنگام بارگذاری Client Templates در دسترس است. در غیر این صورت ایجاد به‌صورت دستی انجام می‌شود.

## عملیات گروهی

اقدامات `POST /api/clients/bulk`: `enable`، `disable`، `delete`، `cleanup`، `addTraffic`، `addDays`، `resetUsage`، `resetTraffic`، `assignGroup`، `assignInbounds`.

فعال و غیرفعال سریع، در صورت پشتیبانی 3x-ui دور: `POST /api/bulk-clients/enable` و `disable`. صدور: `POST /api/bulk-clients/export-subs`.

ایجاد گروهی: `POST /api/clients/bulk-create` پس از `POST /api/clients/bulk-create/validate` (پیشوند، جداکننده، تعداد، ترافیک، انقضا، اینباند).

## خروجی اتصال

برای هر کلاینت: خروجی متناسب با پروتکل، رمزینهٔ QR و پیکربندی قابل بارگیری (برای نمونه WireGuard `.conf`). گفتگوی اشتراک در صورت وجود هر دو نشانی، زبانه‌های **platform** و **native** را نمایش می‌دهد.

## API

| روش | مسیر |
|---|---|
| `GET` | `/api/clients` — `page`، `limit`، `search`، `status`، `inboundId`، `panelId`، `panelType`، `adminId`، `expiry`، `trafficRange` |
| `POST` | `/api/clients` |
| `GET` | `/api/clients/:id` |
| `PATCH` | `/api/clients/:id` |
| `DELETE` | `/api/clients/:id` |
| `GET` | `/api/clients/:id/output` — اختیاری `inboundId` |
| `GET` | `/api/clients/:id/config` |
| `GET` | `/api/clients/:id/qrcode` |
| `GET` | `/api/clients/groups` |
| `POST` | `/api/clients/bulk-create` |
| `POST` | `/api/clients/bulk-create/validate` |
| `POST` | `/api/clients/bulk` |
| `GET` | `/api/clients/cleanup-candidates` |
| `POST` | `/api/bulk-clients/enable` |
| `POST` | `/api/bulk-clients/disable` |
| `POST` | `/api/bulk-clients/export-subs` |
| `GET` | `/api/inbounds` |
| `PATCH` | `/api/inbounds/:id` |

شمارش IP برخط: `GET /api/panels/online-ips` (Super Admin و Reseller).

<div class="hm-actions">

[پنل‌ها](/fa/community/panels)
[پاکسازی](/fa/community/cleanup)
[قالب کلاینت](/fa/premium/client-templates)
[Panel Plus](/fa/premium/panel-plus)

</div>
