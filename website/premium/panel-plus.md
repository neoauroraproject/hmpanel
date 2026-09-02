# Panel Plus (external panels)

::: warning Premium
Module id `external-panels` · Kind BUSINESS · UI: `/premium/external-panels` · Nav label: **Panel Plus**
:::

Connect **Eylan** and **Pasarguard**. In Community you can still *select* those types on [Panels](/community/panels) / see chips on [Clients](/community/clients), but writes are gated:

`panel-operation-gate.ts` returns `operable: false`, `reason: 'premium_unavailable'` unless this module can write.

## Super Admin

Health strip + **Pasarguard** and **Eylan** connection cards (`ProviderConnectionCard`). APIs: `GET access`, `GET providers`, addons `GET/PUT addons/:providerId`, `POST addons/:providerId/test`, `GET .../health`, `GET .../options`.

## Reseller

`ResellerPanelCatalog` from `GET catalog` — which destinations they may use. Grants: `GET/PUT grants`, `PATCH grants/traffic-mode`, `PUT grants/:adminId/:providerId`.

## Client operations (when licensed)

Same mental model as 3x-ui clients, under `/api/premium-modules/external-panels/:providerId/clients` — list, create, bulk, bulk-create, export, get/patch/delete by username, output, qrcode. Overview/scope: `GET :providerId/overview`, `GET :providerId/scope`.

Store fulfillment can also call Eylan/Pasarguard add-on endpoints under Store.

## Endpoints (`/api/premium-modules/external-panels`)

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

## Related

- [Panels](/community/panels)
- [Clients](/community/clients)
- [Store](/premium/store)
