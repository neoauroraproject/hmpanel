# نصب

::: info Community
روی اوبونتو ۲۰.۰۴+ یا دبیان خام. برای Let's Encrypt روی دامنه پنل، IP عمومی لازم است.
:::

دستور رسمی از [neoauroraproject/hmpanel](https://github.com/neoauroraproject/hmpanel):

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/neoauroraproject/hmpanel/main/install.sh)
```

`install.sh` می‌پرسد:

- دامنه پنل
- نام کاربری ادمین (پیش‌فرض `admin`)
- رمز (حداقل ۸ کاراکتر)
- ایمیل به‌صورت `admin@<domain>`

پیش‌نیاز README: حدود **۱ گیگ رم**، **۵ گیگ دیسک**.

سرویس‌ها با Docker Compose: `panel-app`، PostgreSQL 15، Redis 7، Nginx. ایمیج: `ghcr.io/neoauroraproject/hmpanel`.

بعد از نصب: `sudo hm` — [خط فرمان](/fa/guide/cli).

## مرتبط

- [ورود](/fa/guide/login)
- [تنظیمات SSL](/fa/community/settings#ssl)
- [لایسنس](/fa/premium/license)
