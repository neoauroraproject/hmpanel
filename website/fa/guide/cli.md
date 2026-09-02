# خط فرمان (`sudo hm`)

::: info Community
اسکریپت میزبان `cli.sh`. API اچ‌تی‌تی‌پی نیست.
:::

عنوان اسکریپت: **HMPanel CLI Manager — Community Edition**. منوی اصلی:

| # | مورد | کار |
|---|---|---|
| 1 | Panel Status | سلامت کانتینر |
| 2 | Panel Information | مسیر نصب و SSL |
| 3 | Update HMPanel | به‌روزرسانی از گیت‌هاب |
| 4 | Create Backup | زیرمنو: **full** / **database** / **config** — همان سه نوع Settings → Backup |
| 5 | Restore Backup | بازگردانی payload به `panel_db` (بدون `DROP ROLE panel_user`) |
| 6 | Restart Services | همه / panel-app / nginx / postgres / redis |
| 7 | View Logs | لاگ compose |
| 8 | SSL Management | جدول پایین |
| 9 | System Cleanup | پاکسازی میزبان |
| 10 | Uninstall HMPanel | حذف |
| 11 | Heal Panel | تعمیر اضطراری 502 / auth |
| 0 | Exit | |

### زیرمنوی SSL

| # | مورد |
|---|---|
| 1 | Issue / Renew SSL |
| 2 | Enable HTTPS |
| 3 | Disable HTTPS — گواهی می‌ماند؛ `.ssl_disabled` |
| 4 | Renew Existing Certificate |
| 5 | Check SSL Status |
| 6 | Test Domain & DNS |
| 7 | Repair SSL |
| 8 | Change Panel Domain |
| 0 | بازگشت |

مدال SSL در تنظیمات همان گردش‌کار را با `/api/settings/ssl*` و SSE اجرا می‌کند.

نگهداری آرشیو: `HMPANEL_BACKUP_KEEP` (پیش‌فرض ۵).

## مرتبط

- [تنظیمات](/fa/community/settings)
- [مرکز بکاپ](/fa/premium/backup-center)
