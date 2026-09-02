# خط فرمان

::: info Community
ابزار میزبان `cli.sh`، نصب‌شده به‌نام `hm`. این ابزار API نیست.
:::

عنوان: **HMPanel CLI Manager — Community Edition**.

| # | مورد | کارکرد |
|---|---|---|
| 1 | Panel Status | سلامت کانتینر |
| 2 | Panel Information | مسیر نصب و مسیر TLS |
| 3 | Update HMPanel | دریافت انتشار جاری از GitHub |
| 4 | Create Backup | `full`، `database` یا `config` — همان انواع Settings → Backup |
| 5 | Restore Backup | بازیابی بار PostgreSQL در `panel_db` |
| 6 | Restart Services | همه، `panel-app`، nginx، postgres یا redis |
| 7 | View Logs | دنبال‌کردن گزارش Compose |
| 8 | SSL Management | زیرفهرست TLS |
| 9 | System Cleanup | پاکسازی میزبان |
| 10 | Uninstall HMPanel | راهنمای حذف |
| 11 | Heal Panel | تعمیر اضطراری خطای ۵۰۲ و انحراف احراز هویت |
| 0 | Exit | |

### زیرفهرست TLS

| # | مورد |
|---|---|
| 1 | Issue / Renew SSL |
| 2 | Enable HTTPS |
| 3 | Disable HTTPS (HTTP Mode) — گواهی‌ها حفظ می‌شوند؛ `.ssl_disabled` تنظیم می‌گردد |
| 4 | Renew Existing Certificate |
| 5 | Check SSL Status |
| 6 | Test Domain & DNS |
| 7 | Repair SSL |
| 8 | Change Panel Domain |
| 0 | Back |

Settings → SSL همان گردش میزبان را از طریق `GET`/`POST /api/settings/ssl*` و `GET /api/settings/ssl/stream` (SSE) اجرا می‌کند.

نگهداری پشتیبان پس از پشتیبان یا به‌روزرسانی: `HMPANEL_BACKUP_KEEP` (پیش‌فرض `5`).

<div class="hm-actions">

[تنظیمات](/fa/community/settings)
[مرکز پشتیبان](/fa/premium/backup-center)

</div>
