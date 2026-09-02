# Premium Settings

::: warning Premium
UI: `/settings/premium` · Role: `SUPER_ADMIN` · License must be Premium (`edition === PREMIUM`, not community/disabled)
:::

If the bundle’s `/settings/premium` route is registered, that component replaces the Community fallback list. Tabs in `PremiumSettingsPage`:

| Tab | What it is |
|---|---|
| **Modules** | Enable/disable catalog rows (`branding`, `custom-domains`, `client-templates`, `store`, `external-panels`, `admin-recharge`, `monitoring-pro`, `backup-center`, `job-center`). `PATCH /api/premium-modules/:moduleId/enabled` (fallback `/api/platform/premium-modules/:moduleId/enabled`) |
| **Admin Management** | Assign **BUSINESS** modules to resellers; provider access for Eylan/Pasarguard |
| **Jobs** | Embeds [Job Center](#job-center) (not a sidebar item) |
| **Telegram** | Platform Telegram test (`POST /api/settings/telegram-test`) — Super Admin |
| **Developer API** | **Coming soon** in the UI. Badge + placeholder bullets (API keys, scopes, agency). No create-key endpoint. Points at private `docs/future-api/*.md` — those files are **not** a public API |

Community fallback (no bundle UI): a list of enabled modules linking to `frontendPath`.

Job Center is hidden from the sidebar (`menus: []` on the `job-center` manifest).

## Job Center

UI: this tab (also `/premium/jobs` if routed). Polls every 5s.

| Method | Path |
|---|---|
| `GET` | `/api/platform/jobs` |
| `GET` | `/api/platform/jobs/stats` — queued / running / completed / failed |
| `POST` | `/api/platform/jobs/:id/retry` |

## Assignment endpoints

| Method | Path |
|---|---|
| `GET` | `/api/premium-modules/assignments` or `/api/platform/premium-assignments` |
| `POST` | `/api/premium-modules/assignments` or `/api/platform/premium-assignments` |
| `DELETE` | `/api/premium-modules/assignments/:adminId/:moduleId` |
| `PATCH` | `/api/premium-modules/:moduleId/settings` |
| `GET` | `/api/premium-modules/all` |

Manifest kinds: `BUSINESS` (assignable) vs `PLATFORM` (Super Admin infrastructure).

## Related

- [License](/premium/license)
- [Panel Plus](/premium/panel-plus)
