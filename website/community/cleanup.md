# Cleanup

::: info Community
Path: `/cleanup` · Authenticated administrators (candidates scoped by role)
:::

Lists clients expired longer than **Settings → General → Cleanup Candidate Threshold** (`cleanup_threshold_days`).

Cleanup is permanent and does not refund traffic. After selection, `POST /api/clients/bulk` with `action: "cleanup"`.

The threshold is stored with `POST /api/settings`.

## API

| Method | Path |
|---|---|
| `GET` | `/api/clients/cleanup-candidates` |
| `POST` | `/api/clients/bulk` — `{ ids, action: "cleanup" }` |
| `GET` / `POST` | `/api/settings` — threshold |

Bulk delete of other clients uses the same `/api/clients/bulk` with `action: "delete"` from Clients. That path may refund if refund-on-delete is enabled. Cleanup does not refund.

<div class="hm-actions">

[Settings](/community/settings)
[Clients](/community/clients)

</div>
