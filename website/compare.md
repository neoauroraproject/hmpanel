# Edition comparison

The Community edition is included in the public distribution. Premium modules are loaded after a license key is activated.

Writes to Eylan and Pasarguard remain disabled until Panel Plus is licensed, even if those panel types appear in the Community interface.

| Area | Community | Premium |
|---|---|---|
| Sign-in `/login` | `POST /api/auth/login`, `POST /api/auth/refresh` | Identical |
| Dashboard `/dashboard` | KPIs and host metrics via `GET /api/stats/*` | Optional widgets after the bundle loads |
| Admins `/admins` | Reseller accounts, quotas, inbounds | Assignment of BUSINESS modules in Premium Settings |
| Clients `/clients` | Create, update, bulk actions, QR | Client Templates; Eylan/Pasarguard become operable with Panel Plus |
| Panels `/panels` | Full 3x-ui operations | Operable Eylan/Pasarguard nodes require Panel Plus |
| Traffic `/traffic` | Ledger and Super Admin top-up | Identical |
| Migration `/migration` | Import from a WhalePanel `.db` file | Identical |
| Settings | Timezone, ACME, on-demand backup, updates | Identical |
| License | Key activation | Status `PREMIUM` |
| Cleanup `/cleanup` | `POST /api/clients/bulk` with `action: cleanup` (no refund) | Identical |
| Diagnostics `/diagnostics` | `GET /api/settings/diagnostics` | Identical |
| Subscription `/p/:id`, `/s/:token` | Platform and native link tabs | Branding replaces logos and themes |
| `/settings/portal` | Dark theme and support links | Full Branding editor |
| Storefront | Routes exist; APIs require the store module | Full administration and checkout |
| Branding, domains, templates | Not present | `/premium/branding`, `/premium/domains`, `/premium/client-templates` |
| Store | — | `/premium/store` |
| Admin Recharge | — | `/premium/admin-recharge` |
| Panel Plus | Writes return `premium_unavailable` | `/premium/external-panels` |
| Monitoring | Dashboard bars (`GET /api/stats/monitoring`) | `/premium/monitoring` |
| Backup | Settings → Backup (`/api/backups`) | Backup Center (`/api/plugins/backup-center`) |
| Job Center | — | Premium Settings → Jobs |
| Developer API | — | Tab present; marked coming soon. No key-issuance API |

<div class="hm-actions">

[License activation](/premium/license)
[Purchase a license](https://t.me/hmraysupport)
[Telegram channel](https://t.me/hmpanel)

</div>
