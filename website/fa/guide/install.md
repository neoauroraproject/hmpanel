# نصب

::: info Community
میزبان پشتیبانی‌شده: اوبونتو ۲۰٫۰۴ یا جدیدتر، و دبیان. برای صدور گواهی Let’s Encrypt روی دامنهٔ پنل، نشانی IPv4 عمومی لازم است.
:::

نصب‌کنندهٔ رسمی:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/neoauroraproject/hmpanel/main/install.sh)
```

نصب‌کننده مقادیر زیر را دریافت می‌کند:

- دامنهٔ پنل
- نام کاربری مدیر (پیش‌فرض `admin`)
- گذرواژهٔ مدیر (حداقل هشت نویسه)
- نشانی تماس، به‌صورت `admin@<domain>`

حداقل منابع: **۱ گیگابایت RAM**، **۵ گیگابایت** دیسک.

خدمات با Docker Compose مستقر می‌شوند: `panel-app` (NestJS و Next.js)، PostgreSQL 15، Redis 7 و Nginx. تصویر: `ghcr.io/neoauroraproject/hmpanel`.

پس از نصب، مدیریت میزبان از طریق `sudo hm` در دسترس است.

<div class="hm-actions">

[ورود](/fa/guide/login)
[خط فرمان](/fa/guide/cli)
[TLS](/fa/community/settings#ssl)
[مجوز](/fa/premium/license)

</div>
