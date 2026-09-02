# Diagnostics

::: info Community
UI: `/diagnostics` · Role: `SUPER_ADMIN` (`GET /api/settings/diagnostics` is Super Admin only)
:::

Cards on the page (`frontend/src/app/(app)/diagnostics/page.tsx`):

- **Version** — installed version, running image tag, latest GitHub release
- **Host** — hostname, CPU, memory, disk
- **Docker / GitHub API** reachability
- Note when `/var/run/docker.sock` is not mounted (host management / auto-update tracking disabled)
- **Capability matrix**, SSL detection, certificate analysis, host diagnostics, auto-update flags

Refresh interval in the UI: 15 seconds.

## Endpoints

| Method | Path |
|---|---|
| `GET` | `/api/settings/diagnostics` |
| `GET` | `/api/stats/diagnostics` |

## Related

- [Settings → About](/community/settings#about)
- [Dashboard](/community/dashboard)
