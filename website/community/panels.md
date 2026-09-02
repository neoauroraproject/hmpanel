# Panels

::: info Community
UI: `/panels` · Role: `SUPER_ADMIN`
:::

Register and operate **3x-ui** nodes. The add/edit form also lets you pick type **3x-ui / Eylan / Pasarguard**. Eylan and Pasarguard use Panel Plus connection fields; **client/panel writes for those types stay frozen** in Community (`panel-operation-gate.ts` → `premium_unavailable`) until [Panel Plus](/premium/panel-plus) is active.

## List and actions (3x-ui)

- Register: name, URL, optional `subUrl`, `apiToken` or username/password
- Test connection before save
- Sync inbounds/clients from the remote API
- Scan capabilities against the bundled OpenAPI specs (`docs/api*.json`)
- Restart Xray on the node
- View recent logs
- Live inbounds: `GET /api/panels/:id/inbounds`
- Edit / delete

Capability-aware UI: Clients, Panels, monitoring, and backup hide or freeze actions the remote API does not support instead of showing fake zeros.

## Endpoints

| Method | Path |
|---|---|
| `GET` | `/api/panels` |
| `POST` | `/api/panels` |
| `GET` | `/api/panels/:id` |
| `PATCH` | `/api/panels/:id` |
| `DELETE` | `/api/panels/:id` |
| `POST` | `/api/panels/test-connection` — `{ url, apiToken?, panelId? }` |
| `GET` | `/api/panels/online-ips` — also allowed for `RESELLER` |
| `GET` | `/api/panels/:id/inbounds` |
| `POST` | `/api/panels/:id/scan-capabilities` |
| `POST` | `/api/panels/:id/sync` |
| `POST` | `/api/panels/:id/restart-xray` |
| `GET` | `/api/panels/:id/logs` |

Premium bundle extra (not Community): `POST /api/premium-modules/native-panels` test/sync/disconnect/reconnect for native-panel helpers.

## Related

- [Dashboard](/community/dashboard)
- [Clients](/community/clients)
- [Panel Plus](/premium/panel-plus)
