# Whale Panel Database Schema

*Generated from `migration/sample/backupp.db`*

## Tables

### `panels`
| Column | Type | Constraints |
|---|---|---|
| `id` | INTEGER | NOT NULL PRIMARY KEY |
| `panel_type` | VARCHAR | NOT NULL |
| `name` | VARCHAR | NOT NULL |
| `url` | VARCHAR | NOT NULL |
| `username` | VARCHAR | NOT NULL |
| `is_active` | BOOLEAN | |
| `password` | VARCHAR | NOT NULL |
| `sub_url` | VARCHAR | |
| `token` | VARCHAR | |

**Indexes**:
- `ix_panels_id` ON `panels(id)`
- `ix_panels_name` ON `panels(name)` (UNIQUE)

---

### `admins`
| Column | Type | Constraints |
|---|---|---|
| `id` | INTEGER | NOT NULL PRIMARY KEY |
| `username` | VARCHAR | NOT NULL |
| `hashed_password` | VARCHAR | NOT NULL |
| `is_active` | BOOLEAN | |
| `panel` | VARCHAR | NOT NULL |
| `inbound_id` | VARCHAR | |
| `traffic` | BIGINT | |
| `expiry_date` | DATETIME | |
| `marzban_inbounds` | VARCHAR | |
| `marzban_password` | VARCHAR | |
| `inbound_flow` | VARCHAR | |
| `update_return_traffic` | BOOLEAN | DEFAULT 0 |
| `delete_return_traffic` | BOOLEAN | DEFAULT 0 |

**Indexes**:
- `ix_admins_id` ON `admins(id)`
- `ix_admins_username` ON `admins(username)` (UNIQUE)

---

### `sanaei_users`
| Column | Type | Constraints |
|---|---|---|
| `id` | INTEGER | NOT NULL PRIMARY KEY |
| `username` | VARCHAR | NOT NULL |
| `owner` | VARCHAR | NOT NULL |

**Indexes**:
- `ix_sanaei_users_id` ON `sanaei_users(id)`
- `ix_sanaei_users_username` ON `sanaei_users(username)` (UNIQUE)

---

### `news`
| Column | Type | Constraints |
|---|---|---|
| `id` | INTEGER | NOT NULL PRIMARY KEY |
| `message` | VARCHAR | |
| `created_at` | DATETIME | |

**Indexes**:
- `ix_news_id` ON `news(id)`

---

### `alembic_version`
| Column | Type | Constraints |
|---|---|---|
| `version_num` | VARCHAR(32) | NOT NULL PRIMARY KEY |

## Relationships

1. **Admins -> Panels**
   - The `admins.panel` column stores the `panels.name` as a string reference.
2. **Clients -> Admins**
   - The `sanaei_users.owner` column references the `admins.username` to track client ownership.
