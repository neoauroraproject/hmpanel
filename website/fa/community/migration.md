# مهاجرت

::: info Community
UI: `/migration` · فقط `SUPER_ADMIN`
:::

ورود از SQLite قدیمی WhalePanel (`backupp.db`). مراحل صفحه:

1. آپلود — `POST /api/migration/upload`
2. اعتبارسنجی اسکیما — جداول panels / admins / `sanaei_users`
3. پیش‌نمایش — `POST /api/migration/preview`
4. ورود معماری — `POST /api/migration/import`
5. سینک بعد از ورود — `POST /api/migration/sync`

بعد از ورود، در صورت نیاز [رفع مهاجرت ادمین](/fa/community/admins) (`POST /api/admins/:id/fix-migration`).

## Endpointها

| متد | مسیر |
|---|---|
| `POST` | `/api/migration/upload` · `preview` · `import` · `sync` |

## مرتبط

- [ادمین‌ها](/fa/community/admins)
- [پنل‌ها](/fa/community/panels)
