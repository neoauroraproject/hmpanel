# Panel Plus

::: warning Premium
ماژول `external-panels` · نوع BUSINESS · مسیر: `/premium/external-panels` · برچسب: **Panel Plus**
:::

اتصال **Eylan** و **Pasarguard**. آن انواع ممکن است در پنل‌ها انتخاب شوند و در کلاینت‌های Community ظاهر گردند؛ عملیات نوشتن همچنان دروازه‌بندی می‌شود.

دروازهٔ عملیات `operable: false` و `reason: 'premium_unavailable'` بازمی‌گرداند تا این ماژول بتواند بنویسد.

## Super Admin

نوار سلامت و کارت اتصال **Pasarguard** / **Eylan**. `GET access`، `GET providers`، افزونه `GET/PUT addons/:providerId`، `POST addons/:providerId/test`، سلامت و گزینه‌ها.

## ریسلر

فهرست از `GET catalog`. مجوزها: `GET/PUT grants`، `PATCH grants/traffic-mode`، `PUT grants/:adminId/:providerId`.

## عملیات کلاینت (دارای مجوز)

زیر `/api/premium-modules/external-panels/:providerId/clients` — فهرست، ایجاد، گروهی، ایجاد گروهی، صدور، get/patch/delete بر اساس نام کاربری، خروجی، QR. نما و دامنه: `GET :providerId/overview`، `GET :providerId/scope`.

تأمین فروشگاه ممکن است نقاط افزونهٔ ایلان و پاسارگارد را نیز فراخوانی کند.

## API (`/api/premium-modules/external-panels`)

| روش | مسیر |
|---|---|
| `GET` | `access` · `providers` · `catalog` |
| `PATCH` | `catalog/:id/description` |
| `GET/PUT` | `grants` |
| `PATCH` | `grants/traffic-mode` |
| `PUT` | `grants/:adminId/:providerId` |
| `GET/PUT` | `addons/:providerId` |
| `POST` | `addons/:providerId/test` |
| `GET` | `addons/:providerId/health` · `addons/:providerId/options` |
| `GET` | `:providerId/overview` · `:providerId/scope` · `:providerId/clients` |
| `POST` | `:providerId/clients` · `.../bulk` · `.../bulk-create` · `.../export` |
| `GET/PATCH/DELETE` | `:providerId/clients/:username` |
| `GET` | `:providerId/clients/:username/output` · `.../qrcode` |

<div class="hm-actions">

[پنل‌ها](/fa/community/panels)
[کلاینت‌ها](/fa/community/clients)
[فروشگاه](/fa/premium/store)

</div>
