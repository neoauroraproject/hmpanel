# Backup Center

::: warning Premium
Module `backup-center` · Kind PLATFORM · Feature `REMOTE_BACKUPS` · Path: `/premium/backups` · Super Admin
:::

Scheduled backup and restore. Distinct from Settings → Backup (`/api/backups`), which is on-demand only.

- Dashboard metrics
- Frequencies: `hourly`, `6h`, `12h`, `daily`, `3d`, `weekly`
- Types: `full`, `database`, `config`
- History: download, restore, delete
- Telegram delivery log
- Upload, analyze, apply (including restoring a 3x-ui SQLite onto a selected panel)

## API (`/api/plugins/backup-center`)

| Method | Path |
|---|---|
| `GET` | `dashboard` · `backups` · `telegram-log` |
| `POST` | `backups` |
| `GET` | `backups/:id/download` |
| `DELETE` | `backups/:id` |
| `POST` | `backups/:id/restore` |
| `POST` | `restore/analyze` · `restore/apply` |
| `GET/PUT` | `schedule` |

Scheduler: `scheduled-backup` on queue `platform-jobs` every 5 minutes when write is allowed.

Long-running backup and TLS jobs appear under Premium Settings → Jobs.

<div class="hm-actions">

[Settings → Backup](/community/settings#backup)
[Command line](/guide/cli)

</div>
