# Clients

::: info Community
Path: `/clients` · Roles: `SUPER_ADMIN`, `RESELLER` (scoped to assigned panels and inbounds)
:::

List, filter, create, bulk-edit, and export subscription links for 3x-ui clients. Native groups correspond to 3x-ui groups.

## Filters

- Panel selector: all accessible panels. Create and bulk-create require a panel when more than one is available
- Status filters: All, Online, Low traffic, Expiring soon, Disabled, Expired, No traffic
- Query filters: search, inbound, `panelType`, admin (Super Admin), expiry, traffic range

Eylan and Pasarguard inbounds may appear in the list. Write operations remain blocked until Panel Plus is licensed (`premium_unavailable`).

## Create and edit

`POST /api/clients`, `PATCH /api/clients/:id` — remark, traffic, expiry, IP limit, inbounds, enable flag, group.

**With Template** is available when Client Templates are loaded. Otherwise create manually.

## Bulk operations

`POST /api/clients/bulk` actions: `enable`, `disable`, `delete`, `cleanup`, `addTraffic`, `addDays`, `resetUsage`, `resetTraffic`, `assignGroup`, `assignInbounds`.

Accelerated enable and disable, when supported by the remote 3x-ui: `POST /api/bulk-clients/enable` and `disable`. Export: `POST /api/bulk-clients/export-subs`.

Bulk create: `POST /api/clients/bulk-create` after `POST /api/clients/bulk-create/validate` (prefix, separator, count, traffic, expiry, inbounds).

## Connection output

Per client: protocol-aware output, QR code, and downloadable configuration (for example WireGuard `.conf`). The subscription dialog presents **platform** and **native** tabs when both URLs exist.

## API

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
| `GET` | `/api/clients/cleanup-candidates` |
| `POST` | `/api/bulk-clients/enable` |
| `POST` | `/api/bulk-clients/disable` |
| `POST` | `/api/bulk-clients/export-subs` |
| `GET` | `/api/inbounds` |
| `PATCH` | `/api/inbounds/:id` |

Online IP counts: `GET /api/panels/online-ips` (Super Admin and Reseller).

<div class="hm-actions">

[Panels](/community/panels)
[Cleanup](/community/cleanup)
[Client Templates](/premium/client-templates)
[Panel Plus](/premium/panel-plus)

</div>
