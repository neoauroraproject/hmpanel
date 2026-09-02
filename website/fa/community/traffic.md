# ترافیک

::: info Community
مسیر: `/traffic` · Super Admin: دفتر و شارژ هر ریسلر. ریسلر: دفتر خود
:::

دفتر ترافیک: بستانکار (شارژ)، بدهکار (تأمین) و هزینهٔ مصرف. زبانه‌های مقصد هنگامی ظاهر می‌شوند که مدیر سهمیهٔ به‌ازای پنل داشته باشد (`GET /api/traffic/destinations`).

## Super Admin

1. انتخاب ریسلر
2. مقصد اختیاری (پنل)
3. پالایش: همه، بستانکار، بدهکار یا مصرف
4. جستجوی شرح یا کلاینت
5. شارژ: `POST /api/traffic/top-up/:adminId` با `{ amount, description?, panelId? }` (`amount` بایت صحیح است؛ رابط گیگابایت را به بایت تبدیل می‌کند)

کارت سهمیه حالت (سراسری یا به‌ازای پنل)، باقی‌مانده، مصرف‌شده و پرچم نامحدود را نشان می‌دهد.

## ریسلر

همان دفتر از `GET /api/traffic/ledger` (بدون `:adminId`). مسیر شارژ وجود ندارد.

حالت حسابداری روی پروندهٔ مدیر تنظیم می‌شود: تخصیص در برابر مصرف، و استرداد.

## API

| روش | مسیر | نقش |
|---|---|---|
| `GET` | `/api/traffic/ledger` | دفتر فراخوان. پرس‌وجو: `page`، `limit`، `type`، `search`، `panelId` |
| `GET` | `/api/traffic/ledger/:adminId` | Super Admin |
| `GET` | `/api/traffic/destinations` | زبانه‌های پنل فراخوان |
| `GET` | `/api/traffic/destinations/:adminId` | Super Admin |
| `POST` | `/api/traffic/top-up/:adminId` | Super Admin |

<div class="hm-actions">

[ادمین‌ها](/fa/community/admins)
[شارژ ادمین](/fa/premium/admin-recharge)

</div>
