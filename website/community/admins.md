# Admins

::: info Community
UI: `/admins` · Role: `SUPER_ADMIN` only (sidebar `roles: ["SUPER_ADMIN"]`)
:::

Create and edit **reseller** operators. Subtitle in the UI: platform operators and resellers with quick operation actions.

## List

Search, pagination, status. Columns include remaining/total traffic, remaining/total clients, expiry.

## Create / edit reseller

Form fields wired to `POST /api/admins` and `PATCH /api/admins/:id` (`CreateAdminDto` / `UpdateAdminDto`):

- Username, password — renaming username also renames the admin’s group on every 3x-ui panel
- **Allowed Panels & Inbounds** — enable one or more panels, then tick inbounds (`AdminInbound`). Required: at least one inbound
- Max clients (`0` = unlimited)
- Traffic limit (GB) and **quota mode**:
  - Global pool — one shared balance
  - Per panel — separate GB per assigned panel
- Unlimited traffic — no limits; refunds disabled; can only create unlimited clients
- Expiry days (`0` = unlimited)
- Traffic accounting: **Allocation based** (deduct on create) vs **Usage based** (charge real consumption)
- Refund on delete / refund on edit
- Enable / disable account

Cannot delete an admin who still has clients.

## Other actions

- Refund audit report
- Fix migrated admin (sync balance from `trafficPool`, set `adminInbound`) after [Migration](/community/migration)

Resellers can `GET`/`PATCH` **their own** `/api/admins/:id` (used by [portal settings](/community/portal)). They cannot list all admins.

## Endpoints

| Method | Path | Role |
|---|---|---|
| `GET` | `/api/admins` | Super Admin. Query: `page`, `limit`, `search`, `status`, `inboundId`, `panelId` |
| `POST` | `/api/admins` | Super Admin. Create reseller |
| `GET` | `/api/admins/:id` | Super Admin, or the same admin id |
| `PATCH` | `/api/admins/:id` | Super Admin, or self (username change Super Admin only) |
| `DELETE` | `/api/admins/:id` | Super Admin |
| `GET` | `/api/admins/audit-refunds` | Super Admin |
| `POST` | `/api/admins/:id/fix-migration` | Super Admin. Body: `balanceGb`, `inboundIds` |

Premium: assign Store / Branding / etc. per reseller under [Premium Settings](/premium/settings) (`POST /api/platform/premium-assignments`).

## Related

- [Traffic](/community/traffic)
- [Panels](/community/panels)
- [Admin Recharge](/premium/admin-recharge)
