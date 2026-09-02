# Client Templates

::: warning Premium
Module id `client-templates` · Kind BUSINESS · UI: `/premium/client-templates`
:::

Quick-create presets: pick a template, type a name (or pull the next name from a **name pool**), create. Clients page shows **With Template** when this module is loaded.

## Template fields

Name, description, inbound ids, total GB, expiry days, IP limit, flow, remark, enabled, sort order.

## Name pools

Prefix, separator, start number, sample names. `POST .../pools/:poolId/next-name` and `POST .../:id/next-name` allocate the next remark.

## Endpoints

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

## Related

- [Clients](/community/clients)
