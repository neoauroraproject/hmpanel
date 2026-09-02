# Backup Center

::: warning Premium
Module id `backup-center` · Kind PLATFORM · Feature `REMOTE_BACKUPS` · UI: `/premium/backups` · Super Admin
:::

**Scheduled** backups and restore UI. Distinct from [Settings → Backup](/community/settings#backup) (`/api/backups`), which is on-demand only.

## UI

- Dashboard metrics
- Schedule frequencies in the page: `hourly`, `6h`, `12h`, `daily`, `3d`, `weekly`
- Types: `full`, `database`, `config` (same names as Community)
- History: download, restore, delete
- Telegram delivery log
- Upload → analyze → apply (including restoring a 3x-ui SQLite onto a chosen panel when the archive is a panel-db)

## Endpoints (`/api/plugins/backup-center`)

| Method | Path |
|---|---|
| `GET` | `dashboard` · `backups` · `telegram-log` |
| `POST` | `backups` |
| `GET` | `backups/:id/download` |
| `DELETE` | `backups/:id` |
| `POST` | `backups/:id/restore` |
| `POST` | `restore/analyze` · `restore/apply` |
| `GET/PUT` | `schedule` |

Manifest scheduler: `scheduled-backup` on queue `platform-jobs` every 5 minutes when write is allowed.

Jobs for long-running backup/SSL work show up under [Premium Settings → Jobs](/premium/settings#job-center).

## Related

- [Settings → Backup](/community/settings#backup)
- [CLI backup](/guide/cli)
