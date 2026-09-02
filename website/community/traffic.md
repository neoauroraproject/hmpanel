# Traffic

::: info Community
UI: `/traffic` · Roles: Super Admin (any reseller’s ledger + top-up), Reseller (own ledger)
:::

Traffic **ledger**: credits (top-ups), debits (provisioning), usage charges. Destination chips appear when the admin has per-panel quota (`GET /api/traffic/destinations`).

## Super Admin

1. Pick a reseller
2. Optional destination (panel) tab
3. Filter type: all / credits / debits / usage
4. Search description or client
5. Top-up: `POST /api/traffic/top-up/:adminId` with `{ amount, description?, panelId? }` (`amount` is integer bytes in the API; the UI sends GB converted to bytes)

Quota card shows mode (global vs per-panel), remaining, used, unlimited flag.

## Reseller

Same ledger for `GET /api/traffic/ledger` (no `:adminId`). No top-up endpoint.

Accounting modes themselves are set on the admin record — see [Admins](/community/admins) (allocation vs usage, refunds).

## Endpoints

| Method | Path | Role |
|---|---|---|
| `GET` | `/api/traffic/ledger` | Caller’s ledger. Query: `page`, `limit`, `type`, `search`, `panelId` |
| `GET` | `/api/traffic/ledger/:adminId` | Super Admin |
| `GET` | `/api/traffic/destinations` | Caller’s panel tabs |
| `GET` | `/api/traffic/destinations/:adminId` | Super Admin |
| `POST` | `/api/traffic/top-up/:adminId` | Super Admin |

## Related

- [Admins](/community/admins)
- [Admin Recharge](/premium/admin-recharge) (reseller self-serve credit requests — Premium)
