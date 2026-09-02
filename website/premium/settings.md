# Premium Settings

::: warning Premium
Path: `/settings/premium` · Role: `SUPER_ADMIN` · Edition must be `PREMIUM`
:::

When the bundle registers `/settings/premium`, that view replaces the Community fallback list.

| Tab | Contents |
|---|---|
| **Modules** | Enable or disable catalog rows (`branding`, `custom-domains`, `client-templates`, `store`, `external-panels`, `admin-recharge`, `monitoring-pro`, `backup-center`, `job-center`). `PATCH /api/premium-modules/:moduleId/enabled` |
| **Admin Management** | Assign BUSINESS modules to resellers; provider access for Eylan and Pasarguard |
| **Jobs** | Job Center (not a sidebar item) |
| **Telegram** | Platform Telegram test (`POST /api/settings/telegram-test`) |
| **Developer API** | Marked coming soon. No key-issuance API is published |

Community fallback (no bundle UI): a list of enabled modules.

Job Center is omitted from the sidebar (`menus: []`).

## Job Center

Poll interval: 5 seconds.

| Method | Path |
|---|---|
| `GET` | `/api/platform/jobs` |
| `GET` | `/api/platform/jobs/stats` — queued, running, completed, failed |
| `POST` | `/api/platform/jobs/:id/retry` |

## Assignment

| Method | Path |
|---|---|
| `GET` | `/api/premium-modules/assignments` or `/api/platform/premium-assignments` |
| `POST` | `/api/premium-modules/assignments` or `/api/platform/premium-assignments` |
| `DELETE` | `/api/premium-modules/assignments/:adminId/:moduleId` |
| `PATCH` | `/api/premium-modules/:moduleId/settings` |
| `GET` | `/api/premium-modules/all` |

Manifest kinds: `BUSINESS` (assignable) and `PLATFORM` (Super Admin infrastructure).

<div class="hm-actions">

[License](/premium/license)
[Modules](/premium/modules)
[Panel Plus](/premium/panel-plus)

</div>
