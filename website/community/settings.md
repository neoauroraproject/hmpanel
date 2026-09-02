# Settings

::: info Community
UI: `/settings` · Role: `SUPER_ADMIN`
:::

Five tabs in `frontend/src/app/(app)/settings/page.tsx`: **General**, **License**, **SSL**, **Backup**, **About**.

Cleanup and Diagnostics are separate routes linked from this area of the UI (`/cleanup`, `/diagnostics`).

## General

- Cleanup candidate threshold (days after expiry) — stored via `POST /api/settings`
- Display timezone (default Asia/Tehran) — used for admin UI dates and Telegram alert clocks
- Display calendar: Jalali or Gregorian (independent of UI language)
- Panel language (also switchable from the sidebar)

| Method | Path |
|---|---|
| `GET` | `/api/settings` |
| `POST` | `/api/settings` — body is a settings map (`cleanup_threshold_days`, `display_timezone`, `display_calendar`, …) |
| `GET` | `/api/settings/display-timezone` — any authenticated admin (clocks) |

## License

Same card as [License & bundle](/premium/license). Community can activate a key here.

| Method | Path |
|---|---|
| `GET` | `/api/platform/license` |
| `POST` | `/api/platform/license/activate` — `{ licenseKey }` |
| `POST` | `/api/platform/license/deactivate` |
| `POST` | `/api/platform/license/recheck` |
| `POST` | `/api/platform/license/update-bundle` |
| `POST` | `/api/platform/license/reload-plugins` |
| `POST` | `/api/platform/license/diagnose-bundle` |
| `GET` | `/api/platform/license/bundle-status` |
| `GET` | `/api/settings/license` — feature flags for any authenticated user |

## SSL

Opens `SslManagerModal`. Views: status, issue (Let’s Encrypt or self-signed), change domain, progress (SSE).

| Method | Path |
|---|---|
| `GET` | `/api/settings/ssl` |
| `POST` | `/api/settings/ssl/issue` — `{ domain, email, selfSigned? }` |
| `POST` | `/api/settings/ssl/renew` |
| `POST` | `/api/settings/ssl/switch` — `{ enableHttps }` |
| `POST` | `/api/settings/ssl/change-domain` — `{ domain, email }` |
| `POST` | `/api/settings/ssl/repair` |
| `GET` | `/api/settings/ssl/stream` — SSE progress (`@Sse('stream')`) |
| `GET` | `/api/settings/ssl-diagnostic` |

Host equivalent: [CLI SSL menu](/guide/cli).

## Backup

**Manual** snapshot from the UI — not [Backup Center](/premium/backup-center).

Types (same as `hm` backup submenu):

- `full` — database + config + uploads + premium
- `database`
- `config` — `.env` + nginx + acme

Flow: generate → download; or upload archive → analyze → confirm restore.

| Method | Path |
|---|---|
| `POST` | `/api/backups` — `{ type: 'full' \| 'database' \| 'config' }` |
| `GET` | `/api/backups/:id/download` |
| `POST` | `/api/backups/analyze-upload` — multipart `file` |
| `POST` | `/api/backups/restore-apply` — `{ id, fileName, panelId? }` |

## About

Panel version, edition label, Telegram channel link, GitHub update check and apply.

| Method | Path |
|---|---|
| `GET` | `/api/settings/check-update` |
| `POST` | `/api/settings/update-panel` |
| `GET` | `/api/settings/update-logs` |

## Related

- [Cleanup](/community/cleanup)
- [Diagnostics](/community/diagnostics)
- [CLI](/guide/cli)
