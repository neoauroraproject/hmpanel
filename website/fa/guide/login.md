# ورود

::: info Community
مسیر UI: `/login` · بدون JWT
:::

فرم، نام کاربری و رمز را می‌فرستد، توکن را ذخیره می‌کند و به `/dashboard` می‌رود. زبان همین صفحه عوض می‌شود (English / فارسی).

## Endpointها

| متد | مسیر | نقش |
|---|---|---|
| `POST` | `/api/auth/login` | عمومی. بدنه `{ username, password }`. خروجی `accessToken`, `refreshToken`, `admin` |
| `POST` | `/api/auth/refresh` | بدنه `{ refreshToken }` |

کلاینت فرانت (`/api`) احراز هویت را در `localStorage` با کلید `panel-auth` نگه می‌دارد. در 401، refresh می‌زند.

نقش‌ها:

- `SUPER_ADMIN` — ادمین‌ها، پنل‌ها، مهاجرت، تنظیمات
- `RESELLER` — داشبورد، کلاینت، ترافیک خودش؛ بدون تنظیمات سراسری

## مرتبط

- [داشبورد](/fa/community/dashboard)
- [نصب](/fa/guide/install)
