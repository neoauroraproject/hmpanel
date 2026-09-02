# Migration

::: info Community
Path: `/migration` · Role: `SUPER_ADMIN`
:::

Import from a WhalePanel-style SQLite `backupp.db`. The interface accepts a `.db` file.

1. **Upload backup** — `POST /api/migration/upload`
2. **Validate schema** — panels, admins, and `sanaei_users`
3. **Preview entities** — `POST /api/migration/preview`
4. **Import architecture** — `POST /api/migration/import` (panels and admins; client map retained in memory)
5. **Post-import sync** — `POST /api/migration/sync` (connect to imported 3x-ui panels, fetch live clients, optionally create native groups)

After import, **Fix migration** on Admins (`POST /api/admins/:id/fix-migration`) repairs inbound mapping or balance if required.

## API

| Method | Path |
|---|---|
| `POST` | `/api/migration/upload` |
| `POST` | `/api/migration/preview` |
| `POST` | `/api/migration/import` |
| `POST` | `/api/migration/sync` |

<div class="hm-actions">

[Admins](/community/admins)
[Panels](/community/panels)

</div>
