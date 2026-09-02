# Migration

::: info Community
UI: `/migration` · Role: `SUPER_ADMIN`
:::

Import from a legacy **WhalePanel-style** SQLite `backupp.db` (the UI asks for a `.db` file). Wizard steps in the page:

1. **Upload backup** — `POST /api/migration/upload`
2. **Validate schema** — panels / admins / `sanaei_users` tables
3. **Preview entities** — `POST /api/migration/preview`
4. **Import architecture** — `POST /api/migration/import` (panels + admins; client map kept in memory)
5. **Post-import sync** — `POST /api/migration/sync` (connect to imported 3x-ui panels, fetch live clients, optionally create native groups)

After import, use **Fix migration** on [Admins](/community/admins) (`POST /api/admins/:id/fix-migration`) if inbound mapping or balance needs a repair.

## Endpoints

| Method | Path |
|---|---|
| `POST` | `/api/migration/upload` |
| `POST` | `/api/migration/preview` |
| `POST` | `/api/migration/import` |
| `POST` | `/api/migration/sync` |

## Related

- [Admins](/community/admins)
- [Panels](/community/panels)
