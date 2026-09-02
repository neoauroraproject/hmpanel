# Panels

::: info Community
Path: `/panels` · Role: `SUPER_ADMIN`
:::

Register and operate **3x-ui** nodes. The form also accepts types **3x-ui**, **Eylan**, and **Pasarguard**. Eylan and Pasarguard use Panel Plus connection fields. Write operations for those types remain blocked in Community (`premium_unavailable`) until Panel Plus is active.

## 3x-ui operations

- Register: name, URL, optional `subUrl`, `apiToken` or username and password
- Test connection before save
- Synchronize inbounds and clients from the remote API
- Scan capabilities against the bundled OpenAPI specifications
- Restart Xray
- View recent logs
- Live inbounds: `GET /api/panels/:id/inbounds`
- Edit and delete

Actions that the remote API does not support are hidden or disabled.

## API

| Method | Path |
|---|---|
| `GET` | `/api/panels` |
| `POST` | `/api/panels` |
| `GET` | `/api/panels/:id` |
| `PATCH` | `/api/panels/:id` |
| `DELETE` | `/api/panels/:id` |
| `POST` | `/api/panels/test-connection` — `{ url, apiToken?, panelId? }` |
| `GET` | `/api/panels/online-ips` — also available to `RESELLER` |
| `GET` | `/api/panels/:id/inbounds` |
| `POST` | `/api/panels/:id/scan-capabilities` |
| `POST` | `/api/panels/:id/sync` |
| `POST` | `/api/panels/:id/restart-xray` |
| `GET` | `/api/panels/:id/logs` |

Licensed bundle (not Community): `POST /api/premium-modules/native-panels` for native-panel helpers.

<div class="hm-actions">

[Dashboard](/community/dashboard)
[Clients](/community/clients)
[Admins](/community/admins)
[Traffic](/community/traffic)
[Migration](/community/migration)
[Panel Plus](/premium/panel-plus)

</div>
