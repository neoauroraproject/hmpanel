# Traffic

::: info Community
Path: `/traffic` · Super Admin: any reseller ledger and top-up. Reseller: own ledger
:::

Traffic ledger: credits (top-ups), debits (provisioning), and usage charges. Destination chips appear when the administrator has per-panel quota (`GET /api/traffic/destinations`).

## Super Admin

1. Select a reseller
2. Optional destination (panel)
3. Filter: all, credits, debits, or usage
4. Search description or client
5. Top-up: `POST /api/traffic/top-up/:adminId` with `{ amount, description?, panelId? }` (`amount` is integer bytes; the interface converts GB to bytes)

The quota card shows mode (global or per-panel), remaining, used, and the unlimited flag.

## Reseller

The same ledger via `GET /api/traffic/ledger` (without `:adminId`). No top-up endpoint.

Accounting modes are set on the administrator record: allocation versus usage, and refunds.

## API

| Method | Path | Role |
|---|---|---|
| `GET` | `/api/traffic/ledger` | Caller’s ledger. Query: `page`, `limit`, `type`, `search`, `panelId` |
| `GET` | `/api/traffic/ledger/:adminId` | Super Admin |
| `GET` | `/api/traffic/destinations` | Caller’s panel tabs |
| `GET` | `/api/traffic/destinations/:adminId` | Super Admin |
| `POST` | `/api/traffic/top-up/:adminId` | Super Admin |

<div class="hm-actions">

[Admins](/community/admins)
[Admin Recharge](/premium/admin-recharge)

</div>
