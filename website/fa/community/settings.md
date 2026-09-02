# تنظیمات

::: info Community
مسیر: `/settings` · نقش: `SUPER_ADMIN`
:::

زبانه‌ها: **General**، **License**، **SSL**، **Backup**، **About**.

پاکسازی و عیب‌یابی مسیر جدا دارند (`/cleanup`، `/diagnostics`).

## General

- آستانهٔ نامزد پاکسازی (روز پس از انقضا) — `POST /api/settings`
- منطقهٔ زمانی نمایش (پیش‌فرض Asia/Tehran) — برای تاریخ رابط و ساعت هشدار تلگرام
- تقویم نمایش: جلالی یا میلادی (مستقل از زبان رابط)
- زبان پنل (همچنین از نوار کناری)

| روش | مسیر |
|---|---|
| `GET` | `/api/settings` |
| `POST` | `/api/settings` — نقشهٔ تنظیمات (`cleanup_threshold_days`، `display_timezone`، `display_calendar`، …) |
| `GET` | `/api/settings/display-timezone` — هر مدیر احراز هویت‌شده |

## License

همان کارت مجوز. نصب Community می‌تواند کلید را در این زبانه فعال کند.

| روش | مسیر |
|---|---|
| `GET` | `/api/platform/license` |
| `POST` | `/api/platform/license/activate` — `{ licenseKey }` |
| `POST` | `/api/platform/license/deactivate` |
| `POST` | `/api/platform/license/recheck` |
| `POST` | `/api/platform/license/update-bundle` |
| `POST` | `/api/platform/license/reload-plugins` |
| `POST` | `/api/platform/license/diagnose-bundle` |
| `GET` | `/api/platform/license/bundle-status` |
| `GET` | `/api/settings/license` — پرچم قابلیت برای هر کاربر احراز هویت‌شده |

## SSL

نماها: وضعیت، صدور (Let’s Encrypt یا خودامضا)، تغییر دامنه، پیشرفت (SSE).

| روش | مسیر |
|---|---|
| `GET` | `/api/settings/ssl` |
| `POST` | `/api/settings/ssl/issue` — `{ domain, email, selfSigned? }` |
| `POST` | `/api/settings/ssl/renew` |
| `POST` | `/api/settings/ssl/switch` — `{ enableHttps }` |
| `POST` | `/api/settings/ssl/change-domain` — `{ domain, email }` |
| `POST` | `/api/settings/ssl/repair` |
| `GET` | `/api/settings/ssl/stream` — پیشرفت SSE |
| `GET` | `/api/settings/ssl-diagnostic` |

معادل میزبان: زیرفهرست TLS خط فرمان.

## Backup

اسنپ‌شات درخواستی. متمایز از Backup Center.

انواع (همان `hm`):

- `full` — پایگاه داده، پیکربندی، بارگذاری‌ها و premium
- `database`
- `config` — `.env`، nginx و ACME

گردش: تولید سپس بارگیری؛ یا بارگذاری بایگانی، تحلیل و تأیید بازیابی.

| روش | مسیر |
|---|---|
| `POST` | `/api/backups` — `{ type: 'full' \| 'database' \| 'config' }` |
| `GET` | `/api/backups/:id/download` |
| `POST` | `/api/backups/analyze-upload` — چندبخشی `file` |
| `POST` | `/api/backups/restore-apply` — `{ id, fileName, panelId? }` |

## About

نسخهٔ پنل، برچسب نسخه، کانال تلگرام، و بررسی و اعمال به‌روزرسانی GitHub.

| روش | مسیر |
|---|---|
| `GET` | `/api/settings/check-update` |
| `POST` | `/api/settings/update-panel` |
| `GET` | `/api/settings/update-logs` |

<div class="hm-actions">

[پاکسازی](/fa/community/cleanup)
[عیب‌یابی](/fa/community/diagnostics)
[اشتراک](/fa/community/portal)
[خط فرمان](/fa/guide/cli)

</div>
