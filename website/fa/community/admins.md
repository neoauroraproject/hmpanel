# ادمین‌ها

::: info Community
مسیر: `/admins` · نقش: `SUPER_ADMIN`
:::

ایجاد و ادارهٔ اپراتورهای ریسلر.

## فهرست

جستجو، صفحه‌بندی و وضعیت. ستون‌ها شامل ترافیک باقی‌مانده و کل، کلاینت باقی‌مانده و کل، و انقضا است.

## ایجاد و ویرایش

`POST /api/admins` و `PATCH /api/admins/:id`:

- نام کاربری و گذرواژه. تغییر نام کاربری، گروه همان مدیر را روی هر پنل 3x-ui نیز تغییر می‌دهد
- **Allowed Panels & Inbounds** — یک یا چند پنل را فعال کنید، سپس اینباند را انتخاب نمایید. دست‌کم یک اینباند الزامی است
- حداکثر کلاینت (`0` = نامحدود)
- سقف ترافیک (گیگابایت) و حالت سهمیه:
  - استخر سراسری — یک ماندهٔ مشترک
  - به‌ازای پنل — گیگابایت جدا برای هر پنل تخصیص‌یافته
- ترافیک نامحدود — بدون سقف؛ استرداد غیرفعال؛ تنها کلاینت نامحدود قابل ایجاد است
- روز انقضا (`0` = نامحدود)
- حسابداری ترافیک: **Allocation based** (کسر هنگام ایجاد) یا **Usage based** (هزینه بر مصرف واقعی)
- استرداد هنگام حذف / استرداد هنگام ویرایش
- فعال یا غیرفعال کردن حساب

مدیری که هنوز کلاینت دارد قابل حذف نیست.

## سایر اقدامات

- گزارش حسابرسی استرداد
- تعمیر مدیر مهاجرت‌شده (همگام‌سازی مانده از `trafficPool`، تنظیم `adminInbound`) پس از مهاجرت

ریسلر می‌تواند `GET` و `PATCH` را روی `/api/admins/:id` خودش اجرا کند. فهرست همهٔ مدیران در دسترس او نیست.

## API

| روش | مسیر | نقش |
|---|---|---|
| `GET` | `/api/admins` | Super Admin. پرس‌وجو: `page`، `limit`، `search`، `status`، `inboundId`، `panelId` |
| `POST` | `/api/admins` | Super Admin. ایجاد ریسلر |
| `GET` | `/api/admins/:id` | Super Admin، یا همان شناسهٔ مدیر |
| `PATCH` | `/api/admins/:id` | Super Admin، یا خود (تغییر نام کاربری فقط Super Admin) |
| `DELETE` | `/api/admins/:id` | Super Admin |
| `GET` | `/api/admins/audit-refunds` | Super Admin |
| `POST` | `/api/admins/:id/fix-migration` | Super Admin. بدنه: `balanceGb`، `inboundIds` |

تخصیص فروشگاه، برندینگ و سایر ماژول‌های BUSINESS در تنظیمات Premium پیکربندی می‌شود (`POST /api/platform/premium-assignments`).

<div class="hm-actions">

[ترافیک](/fa/community/traffic)
[پنل‌ها](/fa/community/panels)
[شارژ ادمین](/fa/premium/admin-recharge)

</div>
