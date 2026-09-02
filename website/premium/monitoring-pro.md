# Monitoring Pro

::: warning Premium
Module id `monitoring-pro` · Kind PLATFORM · Features `ADVANCED_ANALYTICS`, `SMART_ALERTS`, `XRAY_PRO` · UI: `/premium/monitoring` · Super Admin
:::

This is **not** the CPU/RAM bars on [Dashboard](/community/dashboard) (`GET /api/stats/monitoring`). Monitoring Pro is a separate page loaded via `/api/platform/premium-assets/frontend/premium-monitoring.js`.

The page (`MonitoringProPage`) is a single workspace: platform overview, per-panel metrics, history ranges **1h / 6h / 24h**, availability, active alerts, incident lifecycle, and an **alert rules** manager.

## Endpoints (`/api/plugins/monitoring`)

Guards: JWT, Premium, Super Admin, module `monitoring-pro`, read-only guard in grace.

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

Scheduler in the manifest (write required): poll-tier-1 every 5s, poll-tier-2 every 30s.

## Related

- [Dashboard](/community/dashboard)
- [Premium Settings](/premium/settings) (enable module)
