# Dashboard

::: info Community
UI: `/dashboard` · Roles: `SUPER_ADMIN`, `RESELLER`
:::

First screen after [login](/guide/login). Super Admin sees platform KPIs; resellers see `reseller-overview` (their clients, remaining traffic, capacity).

## What the page shows

From `frontend/src/app/(app)/dashboard/page.tsx` and `GET /api/stats/*`:

- KPI cards (panels, admins, clients, traffic, expiry) — Super Admin: `overview`; reseller: `reseller-overview`
- Traffic series chart — `traffic-series`
- Trends — `trends`
- Live resource bars (CPU / RAM / disk / network) — `monitoring` plus Socket.IO updates
- Online clients — `onlines`
- Host snapshot — `system`
- Alerts for offline 3x-ui / Xray (Eylan/Pasarguard alerts are filtered separately so Community does not fake Xray-stopped on those nodes)
- Actions: sync a panel, restart Xray (Super Admin)

`PluginSlot` on this page is empty until a Premium bundle registers widgets.

## Endpoints

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/stats/overview` | Super Admin KPIs |
| `GET` | `/api/stats/reseller-overview` | Reseller KPIs |
| `GET` | `/api/stats/traffic-series` | Chart series |
| `GET` | `/api/stats/trends` | Trend cards |
| `GET` | `/api/stats/monitoring` | CPU/RAM/disk/net snapshot used on this dashboard |
| `GET` | `/api/stats/system` | Host info |
| `GET` | `/api/stats/onlines` | Online client list |
| `GET` | `/api/stats/diagnostics` | Extra diagnostic payload (also used elsewhere) |
| `POST` | `/api/stats/sync` | Trigger panel sync from dashboard |
| `POST` | `/api/stats/restart-xray` | Restart Xray on a node |

This is **not** [Monitoring Pro](/premium/monitoring-pro). Monitoring Pro is `/premium/monitoring` and `/api/plugins/monitoring/*`.

## Related

- [Panels](/community/panels)
- [Clients](/community/clients)
- [Monitoring Pro](/premium/monitoring-pro)
