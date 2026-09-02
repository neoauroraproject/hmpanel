# Cleanup

::: info Community
UI: `/cleanup` · Authenticated admins (candidates scoped by role). Linked from Settings copy as cleanup candidates.
:::

Lists clients that have been expired longer than **Settings → General → Cleanup Candidate Threshold** (`cleanup_threshold_days`).

The page warns that cleanup is **permanent** and **does not refund** traffic. Selection + search, then `POST /api/clients/bulk` with `action: "cleanup"`.

Threshold itself is saved with `POST /api/settings`.

## Endpoints

| Method | Path |
|---|---|
| `GET` | `/api/clients/cleanup-candidates` |
| `POST` | `/api/clients/bulk` — `{ ids, action: "cleanup" }` |
| `GET` / `POST` | `/api/settings` — threshold |

Bulk delete of non-cleanup clients uses the same `/api/clients/bulk` with `action: "delete"` from the [Clients](/community/clients) page (that path *can* refund if the admin has refund-on-delete enabled). Cleanup does not.

## Related

- [Settings](/community/settings)
- [Clients](/community/clients)
