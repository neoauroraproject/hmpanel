# Dashboard

::: info Community
Path: `/dashboard` · Roles: `SUPER_ADMIN`, `RESELLER`
:::

Default view after sign-in. Super Admin receives platform indicators. Resellers receive `reseller-overview` (clients, remaining traffic, and capacity).

## Contents

Data is served by `GET /api/stats/*`.

- Indicator cards — Super Admin: `overview`; reseller: `reseller-overview`
- Traffic series — `traffic-series`
- Trends — `trends`
- Host resource meters (CPU, RAM, disk, network) — `monitoring`, with Socket.IO updates
- Online clients — `onlines`
- Host snapshot — `system`
- Offline alerts for 3x-ui / Xray. Eylan and Pasarguard alerts are filtered separately
- Actions: panel sync and Xray restart (Super Admin)

Premium widgets appear only after the licensed bundle is loaded.

Resource meters on this page are distinct from Monitoring Pro (`/premium/monitoring`).

## API

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/stats/overview` | Super Admin indicators |
| `GET` | `/api/stats/reseller-overview` | Reseller indicators |
| `GET` | `/api/stats/traffic-series` | Chart series |
| `GET` | `/api/stats/trends` | Trend cards |
| `GET` | `/api/stats/monitoring` | CPU, RAM, disk, and network snapshot |
| `GET` | `/api/stats/system` | Host information |
| `GET` | `/api/stats/onlines` | Online client list |
| `GET` | `/api/stats/diagnostics` | Diagnostic payload |
| `POST` | `/api/stats/sync` | Panel sync |
| `POST` | `/api/stats/restart-xray` | Restart Xray on a node |

<div class="hm-actions">

[Panels](/community/panels)
[Clients](/community/clients)
[Monitoring Pro](/premium/monitoring-pro)

</div>
