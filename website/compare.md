# Community vs Premium

This table only lists behavior that exists in the Community UI/API or in a Premium module that ships in the licensed bundle. Eylan/Pasarguard rows can appear in Community; **writes stay frozen** until Panel Plus is licensed.

| Area | Community | Premium |
|---|---|---|
| Login `/login` | `POST /api/auth/login`, `POST /api/auth/refresh` | Same |
| Dashboard `/dashboard` | KPIs, traffic charts, CPU/RAM/disk from `GET /api/stats/*`, Xray restart / sync | Plugin slot can inject extra widgets after the bundle loads |
| Admins `/admins` | Create resellers, quotas, inbounds, refund flags | Super Admin can **assign BUSINESS modules** under Premium Settings → Admin Management |
| Clients `/clients` | CRUD, bulk, QR/output, 3x-ui groups | **With Template** uses Client Templates; Eylan/Pasarguard clients become operable with Panel Plus |
| Panels `/panels` | Full 3x-ui register/sync/logs/restart | Adding Eylan/Pasarguard as operable nodes requires **Panel Plus**; native panel extra flows live in the bundle |
| Traffic `/traffic` | Ledger + Super Admin top-up | Unchanged |
| Migration `/migration` | WhalePanel `.db` import wizard | Unchanged |
| Settings → General / SSL / Backup / About | Timezone, ACME, **manual** backup types full/database/config, GitHub update | Unchanged |
| Settings → License | Activate / deactivate / recheck / update bundle / reload plugins | Same card; status becomes `PREMIUM` |
| Cleanup `/cleanup` | Expired clients; `POST /api/clients/bulk` `action: cleanup` (no refund) | Unchanged |
| Diagnostics `/diagnostics` | `GET /api/settings/diagnostics` | Unchanged |
| Subscription page `/p/:id`, `/s/:token` | Platform vs native link tabs | Branding module replaces logos/themes on those pages |
| Reseller `/settings/portal` | Dark theme + support links on `portalSettings` | Branding module is the full white-label editor |
| Storefront `/shop/:slug`, `/portal`, `/track/:code` | Routes exist; Store APIs require the **store** module + license | Full Store admin + public checkout |
| Branding / domains / templates | Not in Community sidebar | `/premium/branding`, `/premium/domains`, `/premium/client-templates` |
| Store | — | `/premium/store` |
| Admin Recharge | — | `/premium/admin-recharge` |
| Panel Plus | UI may list Eylan/Pasarguard; writes return `premium_unavailable` | `/premium/external-panels` |
| Monitoring Pro | Dashboard bars only (`GET /api/stats/monitoring`) | `/premium/monitoring` — incidents, rules, history |
| Backups | Settings → Backup (`/api/backups`) | Backup Center scheduled/remote (`/api/plugins/backup-center`) |
| Job Center | — | Premium Settings → Jobs (`GET /api/platform/jobs`) |
| Developer API tab | — | Visible, **coming soon** — no public API keys yet |

## Buy Premium

- Channel: [t.me/hmpanel](https://t.me/hmpanel)
- Purchase / support: [t.me/hmraysupport](https://t.me/hmraysupport)
- After you have a key: [License & bundle](/premium/license)
