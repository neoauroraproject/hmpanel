# Command line

::: info Community
Host utility `cli.sh`, installed as `hm`. This is not an HTTP API.
:::

Title: **HMPanel CLI Manager — Community Edition**.

| # | Item | Function |
|---|---|---|
| 1 | Panel Status | Container health |
| 2 | Panel Information | Install path and TLS path |
| 3 | Update HMPanel | Pulls the current GitHub release |
| 4 | Create Backup | `full`, `database`, or `config` — the same types as Settings → Backup |
| 5 | Restore Backup | Restores the PostgreSQL payload into `panel_db` |
| 6 | Restart Services | All, `panel-app`, nginx, postgres, or redis |
| 7 | View Logs | Follow Compose logs |
| 8 | SSL Management | See below |
| 9 | System Cleanup | Host cleanup |
| 10 | Uninstall HMPanel | Removal wizard |
| 11 | Heal Panel | Emergency repair for 502 and authentication drift |
| 0 | Exit | |

### TLS submenu

| # | Item |
|---|---|
| 1 | Issue / Renew SSL |
| 2 | Enable HTTPS |
| 3 | Disable HTTPS (HTTP Mode) — certificates are retained; `.ssl_disabled` is set |
| 4 | Renew Existing Certificate |
| 5 | Check SSL Status |
| 6 | Test Domain & DNS |
| 7 | Repair SSL |
| 8 | Change Panel Domain |
| 0 | Back |

Settings → SSL drives the same host workflows through `GET`/`POST /api/settings/ssl*` and `GET /api/settings/ssl/stream` (SSE).

Backup retention after backup or update: `HMPANEL_BACKUP_KEEP` (default `5`).

<div class="hm-actions">

[Settings](/community/settings)
[Backup Center](/premium/backup-center)

</div>
