# مهاجرت

::: info Community
مسیر: `/migration` · نقش: `SUPER_ADMIN`
:::

ورود از پایگاه SQLite از نوع WhalePanel با نام `backupp.db`. رابط پروندهٔ `.db` را می‌پذیرد.

1. **بارگذاری پشتیبان** — `POST /api/migration/upload`
2. **اعتبارسنجی طرح** — پنل‌ها، ادمین‌ها و `sanaei_users`
3. **پیش‌نمایش موجودیت‌ها** — `POST /api/migration/preview`
4. **ورود معماری** — `POST /api/migration/import` (پنل‌ها و ادمین‌ها؛ نگاشت کلاینت در حافظه نگه داشته می‌شود)
5. **همگام‌سازی پس از ورود** — `POST /api/migration/sync` (اتصال به پنل‌های 3x-ui واردشده، دریافت کلاینت زنده، ایجاد اختیاری گروه بومی)

پس از ورود، **Fix migration** در ادمین‌ها (`POST /api/admins/:id/fix-migration`) در صورت نیاز نگاشت اینباند یا مانده را تعمیر می‌کند.

## API

| روش | مسیر |
|---|---|
| `POST` | `/api/migration/upload` |
| `POST` | `/api/migration/preview` |
| `POST` | `/api/migration/import` |
| `POST` | `/api/migration/sync` |

<div class="hm-actions">

[ادمین‌ها](/fa/community/admins)
[پنل‌ها](/fa/community/panels)

</div>
