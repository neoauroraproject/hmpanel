# Settings

::: info Community
Path: `/settings` · Role: `SUPER_ADMIN`
:::

Tabs: **General**, **License**, **SSL**, **Backup**, **About**.

Cleanup and Diagnostics are separate routes (`/cleanup`, `/diagnostics`).

## General

- Cleanup candidate threshold (days after expiry) — `POST /api/settings`
- Display timezone (default Asia/Tehran) — used for interface dates and Telegram alert clocks
- Display calendar: Jalali or Gregorian (independent of interface language)
- Panel language (also switchable from the sidebar)

| Method | Path |
|---|---|
| `GET` | `/api/settings` |
| `POST` | `/api/settings` — settings map (`cleanup_threshold_days`, `display_timezone`, `display_calendar`, …) |
| `GET` | `/api/settings/display-timezone` — any authenticated administrator |

## License

The same card as License. A Community installation can activate a key here.

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

Views: status, issue (Let’s Encrypt or self-signed), change domain, progress (SSE).

| Method | Path |
|---|---|
| `GET` | `/api/settings/ssl` |
| `POST` | `/api/settings/ssl/issue` — `{ domain, email, selfSigned? }` |
| `POST` | `/api/settings/ssl/renew` |
| `POST` | `/api/settings/ssl/switch` — `{ enableHttps }` |
| `POST` | `/api/settings/ssl/change-domain` — `{ domain, email }` |
| `POST` | `/api/settings/ssl/repair` |
| `GET` | `/api/settings/ssl/stream` — SSE progress |
| `GET` | `/api/settings/ssl-diagnostic` |

Host equivalent: command-line TLS menu.

## Backup

On-demand snapshot. Distinct from Backup Center.

Types (identical to `hm` backup):

- `full` — database, configuration, uploads, and premium
- `database`
- `config` — `.env`, nginx, and ACME

Flow: generate then download; or upload an archive, analyze, and confirm restore.

| Method | Path |
|---|---|
| `POST` | `/api/backups` — `{ type: 'full' \| 'database' \| 'config' }` |
| `GET` | `/api/backups/:id/download` |
| `POST` | `/api/backups/analyze-upload` — multipart `file` |
| `POST` | `/api/backups/restore-apply` — `{ id, fileName, panelId? }` |

## About

Panel version, edition label, Telegram channel, and GitHub update check and apply.

| Method | Path |
|---|---|
| `GET` | `/api/settings/check-update` |
| `POST` | `/api/settings/update-panel` |
| `GET` | `/api/settings/update-logs` |

<div class="hm-actions">

[Cleanup](/community/cleanup)
[Diagnostics](/community/diagnostics)
[Subscription](/community/portal)
[Command line](/guide/cli)

</div>
