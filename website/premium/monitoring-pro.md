# Monitoring Pro

::: warning Premium
Module `monitoring-pro` · Kind PLATFORM · Features `ADVANCED_ANALYTICS`, `SMART_ALERTS`, `XRAY_PRO` · Path: `/premium/monitoring` · Super Admin
:::

Distinct from the resource meters on Dashboard (`GET /api/stats/monitoring`). This module is loaded via `/api/platform/premium-assets/frontend/premium-monitoring.js`.

Workspace: platform overview, per-panel metrics, history ranges **1h / 6h / 24h**, availability, active alerts, incident lifecycle, and alert rules.

## API (`/api/plugins/monitoring`)

Guards: JWT, Premium, Super Admin, module `monitoring-pro`, read-only during grace.

| Method | Path |
|---|---|
| `GET` | `platform-overview` · `dashboard` · `availability` |
| `GET` | `panels/:id` · `panels/:id/outbounds` · `panels/:id/traffic-windows` |
| `GET` | `realtime/:panelId` |
| `GET` | `history` |
| `GET` | `alerts/active` |
| `GET/PUT` | `settings` |
| `GET/POST` | `rules` · `PUT/DELETE rules/:id` |
| `GET` | `incidents` · `incidents/:id/timeline` |
| `POST` | `incidents/:id/acknowledge` · `resolve` · `reopen` · `archive` |

Scheduler: poll-tier-1 every 5 seconds, poll-tier-2 every 30 seconds (write required).

<div class="hm-actions">

[Dashboard](/community/dashboard)
[Premium Settings](/premium/settings)

</div>
