# Clients

::: info Community
UI: `/clients` · Roles: `SUPER_ADMIN`, `RESELLER` (scoped to allowed panels/inbounds)
:::

List, filter, create, bulk-edit, and export subscription links for 3x-ui clients. Native groups map to 3x-ui groups.

## Filters and chips

- Panel chip bar: All panels + each accessible panel. Create / bulk-create require a panel when more than one exists
- Quick filters: All, Online, Low traffic, Expiring soon, Disabled, Expired, No traffic
- Extra query filters: search, inbound, `panelType`, admin (Super Admin), expiry, traffic range

Eylan / Pasarguard inbounds can appear in the list. **Writes stay frozen** until [Panel Plus](/premium/panel-plus) is licensed (`premium_unavailable` on the panel operation gate).

## Create / edit

`POST /api/clients`, `PATCH /api/clients/:id` — remark, traffic, expiry, IP limit, inbounds, enable flag, group.

**With Template** is shown when Premium Client Templates are loaded; otherwise use manual create. See [Client Templates](/premium/client-templates).

## Bulk

`POST /api/clients/bulk` actions: `enable`, `disable`, `delete`, `cleanup`, `addTraffic`, `addDays`, `resetUsage`, `resetTraffic`, `assignGroup`, `assignInbounds`.

Faster enable/disable when the remote 3x-ui supports bulk APIs: `POST /api/bulk-clients/enable` and `disable`. Export links: `POST /api/bulk-clients/export-subs`.

Bulk create: `POST /api/clients/bulk-create` after `POST /api/clients/bulk-create/validate` (prefix, separator, count, traffic, expiry, inbounds).

## Connection output

Per client: protocol-aware output, QR, downloadable config (e.g. WireGuard `.conf`). Subscription modal has **platform** vs **native** tabs when both URLs exist — see [Subscription portal](/community/portal).

## Endpoints

| Method | Path |
|---|---|
| `GET` | `/api/clients` — `page`, `limit`, `search`, `status`, `inboundId`, `panelId`, `panelType`, `adminId`, `expiry`, `trafficRange` |
| `POST` | `/api/clients` |
| `GET` | `/api/clients/:id` |
| `PATCH` | `/api/clients/:id` |
| `DELETE` | `/api/clients/:id` |
| `GET` | `/api/clients/:id/output` — optional `inboundId` |
| `GET` | `/api/clients/:id/config` |
| `GET` | `/api/clients/:id/qrcode` |
| `GET` | `/api/clients/groups` |
| `POST` | `/api/clients/bulk-create` |
| `POST` | `/api/clients/bulk-create/validate` |
| `POST` | `/api/clients/bulk` |
| `GET` | `/api/clients/cleanup-candidates` — used by [Cleanup](/community/cleanup) |
| `POST` | `/api/bulk-clients/enable` |
| `POST` | `/api/bulk-clients/disable` |
| `POST` | `/api/bulk-clients/export-subs` |
| `GET` | `/api/inbounds` |
| `PATCH` | `/api/inbounds/:id` |

Online IP counts used on the list: `GET /api/panels/online-ips` (Super Admin and Reseller).

## Related

- [Panels](/community/panels)
- [Cleanup](/community/cleanup)
- [Client Templates](/premium/client-templates)
- [Panel Plus](/premium/panel-plus)
