# تنظیمات

::: info Community
UI: `/settings` · فقط `SUPER_ADMIN`
:::

پنج تب: **General**، **License**، **SSL**، **Backup**، **About**.

پاکسازی و عیب‌یابی مسیر جدا دارند (`/cleanup`، `/diagnostics`).

## General

- آستانه کاندید پاکسازی (روز بعد از انقضا)
- منطقه زمانی نمایش (پیش‌فرض Asia/Tehran)
- تقویم: جلالی یا میلادی (جدا از زبان UI)
- زبان پنل

| متد | مسیر |
|---|---|
| `GET/POST` | `/api/settings` |
| `GET` | `/api/settings/display-timezone` — هر ادمین لاگین‌شده |

## لایسنس

همان کارت [لایسنس و باندل](/fa/premium/license).

| متد | مسیر |
|---|---|
| `GET` | `/api/platform/license` |
| `POST` | `/api/platform/license/activate` · `deactivate` · `recheck` · `update-bundle` · `reload-plugins` · `diagnose-bundle` |
| `GET` | `/api/platform/license/bundle-status` |
| `GET` | `/api/settings/license` |

## SSL

مدال: وضعیت، صدور (Let's Encrypt یا self-signed)، تغییر دامنه، پیشرفت SSE.

| متد | مسیر |
|---|---|
| `GET` | `/api/settings/ssl` |
| `POST` | `/api/settings/ssl/issue` · `renew` · `switch` · `change-domain` · `repair` |
| `GET` | `/api/settings/ssl/stream` |
| `GET` | `/api/settings/ssl-diagnostic` |

معادل میزبان: [منوی SSL در hm](/fa/guide/cli).

## Backup

اسنپ‌شات **دستی** — نه [مرکز بکاپ](/fa/premium/backup-center).

انواع: `full`، `database`، `config`.

| متد | مسیر |
|---|---|
| `POST` | `/api/backups` — `{ type }` |
| `GET` | `/api/backups/:id/download` |
| `POST` | `/api/backups/analyze-upload` · `restore-apply` |

## About

نسخه، بررسی آپدیت گیت‌هاب، اجرای آپدیت.

| متد | مسیر |
|---|---|
| `GET` | `/api/settings/check-update` · `update-logs` |
| `POST` | `/api/settings/update-panel` |

## مرتبط

- [پاکسازی](/fa/community/cleanup)
- [عیب‌یابی](/fa/community/diagnostics)
