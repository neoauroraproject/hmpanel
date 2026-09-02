# Diagnostics

::: info Community
Path: `/diagnostics` · Role: `SUPER_ADMIN`
:::

- **Version** — installed version, running image tag, latest GitHub release
- **Host** — hostname, CPU, memory, disk
- Docker and GitHub API reachability
- Note when `/var/run/docker.sock` is not mounted (host management and automatic-update tracking disabled)
- Capability matrix, TLS detection, certificate analysis, host diagnostics, automatic-update flags

Refresh interval: 15 seconds.

## API

| Method | Path |
|---|---|
| `GET` | `/api/settings/diagnostics` |
| `GET` | `/api/stats/diagnostics` |

<div class="hm-actions">

[Settings](/community/settings#about)
[Dashboard](/community/dashboard)

</div>
