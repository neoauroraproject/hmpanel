# Admins

::: info Community
Path: `/admins` · Role: `SUPER_ADMIN`
:::

Create and administer reseller operators.

## List

Search, pagination, and status. Columns include remaining and total traffic, remaining and total clients, and expiry.

## Create and edit

`POST /api/admins` and `PATCH /api/admins/:id`:

- Username and password. Renaming the username also renames the administrator’s group on every 3x-ui panel
- **Allowed Panels & Inbounds** — enable one or more panels, then select inbounds. At least one inbound is required
- Maximum clients (`0` = unlimited)
- Traffic limit (GB) and quota mode:
  - Global pool — one shared balance
  - Per panel — separate GB per assigned panel
- Unlimited traffic — no limits; refunds disabled; only unlimited clients may be created
- Expiry days (`0` = unlimited)
- Traffic accounting: **Allocation based** (deduct on create) or **Usage based** (charge actual consumption)
- Refund on delete / refund on edit
- Enable or disable the account

An administrator who still has clients cannot be deleted.

## Additional actions

- Refund audit report
- Repair a migrated administrator (synchronize balance from `trafficPool`, set `adminInbound`) after Migration

Resellers may `GET` and `PATCH` their own `/api/admins/:id`. They cannot list all administrators.

## API

| Method | Path | Role |
|---|---|---|
| `GET` | `/api/admins` | Super Admin. Query: `page`, `limit`, `search`, `status`, `inboundId`, `panelId` |
| `POST` | `/api/admins` | Super Admin. Create reseller |
| `GET` | `/api/admins/:id` | Super Admin, or the same administrator id |
| `PATCH` | `/api/admins/:id` | Super Admin, or self (username change Super Admin only) |
| `DELETE` | `/api/admins/:id` | Super Admin |
| `GET` | `/api/admins/audit-refunds` | Super Admin |
| `POST` | `/api/admins/:id/fix-migration` | Super Admin. Body: `balanceGb`, `inboundIds` |

Assignment of Store, Branding, and other BUSINESS modules is configured under Premium Settings (`POST /api/platform/premium-assignments`).

<div class="hm-actions">

[Traffic](/community/traffic)
[Panels](/community/panels)
[Admin Recharge](/premium/admin-recharge)

</div>
