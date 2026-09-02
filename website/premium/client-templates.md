# Client Templates

::: warning Premium
Module `client-templates` · Kind BUSINESS · Path: `/premium/client-templates`
:::

Presets for rapid client creation: select a template, enter a name (or allocate the next name from a name pool), then create. Clients displays **With Template** when this module is loaded.

## Template fields

Name, description, inbound identifiers, total GB, expiry days, IP limit, flow, remark, enabled, sort order.

## Name pools

Prefix, separator, start number, sample names. `POST .../pools/:poolId/next-name` and `POST .../:id/next-name` allocate the next remark.

## API

| Method | Path |
|---|---|
| `GET` | `/api/premium-modules/client-templates` |
| `GET` | `/api/premium-modules/client-templates/:id` |
| `POST` | `/api/premium-modules/client-templates` |
| `PATCH` | `/api/premium-modules/client-templates/:id` |
| `DELETE` | `/api/premium-modules/client-templates/:id` |
| `POST` | `/api/premium-modules/client-templates/:id/next-name` |
| `GET` | `/api/premium-modules/client-templates/pools` |
| `POST` | `/api/premium-modules/client-templates/pools` |
| `PATCH` | `/api/premium-modules/client-templates/pools/:poolId` |
| `DELETE` | `/api/premium-modules/client-templates/pools/:poolId` |
| `POST` | `/api/premium-modules/client-templates/pools/:poolId/next-name` |

<div class="hm-actions">

[Clients](/community/clients)

</div>
