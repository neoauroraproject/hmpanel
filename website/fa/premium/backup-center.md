# مرکز بکاپ

::: warning Premium
ماژول `backup-center` · فلگ `REMOTE_BACKUPS` · UI: `/premium/backups` · سوپرادمین
:::

بکاپ **زمان‌بندی‌شده**. جدا از [تنظیمات → Backup](/fa/community/settings#backup) که فقط دستی است (`/api/backups`).

## UI

- متریک داشبورد
- تناوب: `hourly`, `6h`, `12h`, `daily`, `3d`, `weekly`
- نوع: `full`, `database`, `config`
- تاریخچه: دانلود، بازگردانی، حذف
- لاگ تلگرام
- آپلود → تحلیل → اعمال (از جمله SQLite پنل 3x-ui روی پنل انتخابی)

## Endpointها (`/api/plugins/backup-center`)

`dashboard`، `backups`، `telegram-log`، `POST backups`، `GET/DELETE backups/:id`، `download`، `POST backups/:id/restore`، `restore/analyze`، `restore/apply`، `GET/PUT schedule`.

جاب زمان‌بند هر ۵ دقیقه روی صف `platform-jobs` وقتی write مجاز باشد.

جاب‌های طولانی در [Jobs](/fa/premium/settings#job-center) دیده می‌شوند.

## مرتبط

- [تنظیمات → Backup](/fa/community/settings#backup)
- [CLI](/fa/guide/cli)
