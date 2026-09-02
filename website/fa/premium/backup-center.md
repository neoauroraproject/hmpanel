# مرکز پشتیبان

::: warning Premium
ماژول `backup-center` · نوع PLATFORM · قابلیت `REMOTE_BACKUPS` · مسیر: `/premium/backups` · Super Admin
:::

پشتیبان زمان‌بندی‌شده و بازیابی. متمایز از Settings → Backup (`/api/backups`) که فقط درخواستی است.

- شاخص داشبورد
- تناوب: `hourly`، `6h`، `12h`، `daily`، `3d`، `weekly`
- انواع: `full`، `database`، `config`
- تاریخچه: بارگیری، بازیابی، حذف
- گزارش ارسال تلگرام
- بارگذاری، تحلیل، اعمال (شامل بازیابی SQLite مربوط به 3x-ui روی پنل انتخاب‌شده)

## API (`/api/plugins/backup-center`)

| روش | مسیر |
|---|---|
| `GET` | `dashboard` · `backups` · `telegram-log` |
| `POST` | `backups` |
| `GET` | `backups/:id/download` |
| `DELETE` | `backups/:id` |
| `POST` | `backups/:id/restore` |
| `POST` | `restore/analyze` · `restore/apply` |
| `GET/PUT` | `schedule` |

زمان‌بند: `scheduled-backup` روی صف `platform-jobs` هر ۵ دقیقه در صورت مجاز بودن نوشتن.

کارهای طولانی پشتیبان و TLS در تنظیمات Premium → Jobs ظاهر می‌شوند.

<div class="hm-actions">

[Settings → Backup](/fa/community/settings#backup)
[خط فرمان](/fa/guide/cli)

</div>
