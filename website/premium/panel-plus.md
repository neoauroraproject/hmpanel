# Panel Plus

::: warning Premium
Module `external-panels` · Kind BUSINESS · Path: `/premium/external-panels` · Label: **Panel Plus**
:::

Connect **Eylan** and **Pasarguard**. Those types may be selected on Panels and appear on Clients in Community; write operations remain gated.

The operation gate returns `operable: false`, `reason: 'premium_unavailable'` until this module can write.

## Super Admin

Health strip and **Pasarguard** / **Eylan** connection cards. `GET access`, `GET providers`, add-ons `GET/PUT addons/:providerId`, `POST addons/:providerId/test`, health and options.

## Reseller

Catalog from `GET catalog`. Grants: `GET/PUT grants`, `PATCH grants/traffic-mode`, `PUT grants/:adminId/:providerId`.

## Client operations (licensed)

Under `/api/premium-modules/external-panels/:providerId/clients` — list, create, bulk, bulk-create, export, get/patch/delete by username, output, QR. Overview and scope: `GET :providerId/overview`, `GET :providerId/scope`.

Store fulfillment may also call Eylan and Pasarguard add-on endpoints.

## API (`/api/premium-modules/external-panels`)

| Method | Path |
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

[Panels](/community/panels)
[Clients](/community/clients)
[Store](/premium/store)

</div>
