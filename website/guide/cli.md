# CLI (`sudo hm`)

::: info Community
Host script `cli.sh`, installed as `hm`. Not an HTTP API.
:::

Header in the script: **HMPanel CLI Manager — Community Edition**. Main menu (`cli.sh`):

| # | Item | What it does |
|---|---|---|
| 1 | Panel Status | Container health |
| 2 | Panel Information | Install path, SSL path |
| 3 | Update HMPanel | Pulls latest from GitHub (`update.sh` / image) |
| 4 | Create Backup | Submenu: **full** / **database** / **config** — same three types as Settings → Backup |
| 5 | Restore Backup | Restores PostgreSQL payload into `panel_db` (does not run `DROP ROLE panel_user`) |
| 6 | Restart Services | All / panel-app / nginx / postgres / redis |
| 7 | View Logs | Follow compose logs (all, panel-app, nginx, postgres, redis) |
| 8 | SSL Management | See below |
| 9 | System Cleanup | Host cleanup |
| 10 | Uninstall HMPanel | Removal wizard |
| 11 | Heal Panel (fix 502 / auth drift) | Emergency repair |
| 0 | Exit | |

### SSL submenu

| # | Item |
|---|---|
| 1 | Issue / Renew SSL |
| 2 | Enable HTTPS |
| 3 | Disable HTTPS (HTTP Mode) — keeps certs; sets `.ssl_disabled` |
| 4 | Renew Existing Certificate |
| 5 | Check SSL Status |
| 6 | Test Domain & DNS |
| 7 | Repair SSL |
| 8 | Change Panel Domain |
| 0 | Back |

The Settings → SSL modal drives the same host workflows over `GET/POST /api/settings/ssl*` plus `GET /api/settings/ssl/stream` (SSE).

Backup retention after backup/update: `HMPANEL_BACKUP_KEEP` (default 5).

## Related

- [Settings](/community/settings)
- [Backup Center](/premium/backup-center) (Premium scheduled backups — different UI)
