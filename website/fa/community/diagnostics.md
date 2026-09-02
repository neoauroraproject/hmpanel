# عیب‌یابی

::: info Community
UI: `/diagnostics` · `GET /api/settings/diagnostics` فقط سوپرادمین
:::

کارت‌های صفحه:

- نسخه نصب‌شده، تگ ایمیج در حال اجرا، آخرین ریلیز گیت‌هاب
- میزبان: hostname، CPU، حافظه، دیسک
- دسترسی Docker / GitHub API
- اگر `/var/run/docker.sock` مانت نشده باشد، مدیریت میزبان و ردیابی آپدیت خودکار خاموش است
- ماتریس قابلیت، تشخیص SSL، تحلیل گواهی، فلگ auto-update

رفرش UI: هر ۱۵ ثانیه.

## Endpointها

| متد | مسیر |
|---|---|
| `GET` | `/api/settings/diagnostics` |
| `GET` | `/api/stats/diagnostics` |

## مرتبط

- [تنظیمات → About](/fa/community/settings#about)
