# Login

::: info Community
UI: `/login` · Public (no JWT)
:::

The login form posts username and password, stores tokens, then navigates to `/dashboard`. Language can be switched on this page (English / فارسی).

## Endpoints

| Method | Path | Role |
|---|---|---|
| `POST` | `/api/auth/login` | Public. Body: `{ username, password }`. Returns `accessToken`, `refreshToken`, `admin`. |
| `POST` | `/api/auth/refresh` | Body: `{ refreshToken }`. Issues a new access token. |

Nginx also has a dedicated location for `POST /api/auth/login` (same backend handler).

The frontend axios client (`frontend/src/lib/api.ts`) uses base URL `/api` and persists auth in `localStorage` key `panel-auth`. Subsequent admin calls send the JWT. On 401 it tries refresh.

Roles after login:

- `SUPER_ADMIN` — full Community sidebar including Admins, Panels, Migration, Settings
- `RESELLER` — Dashboard, Clients, Traffic (own ledger); no global Settings / Panels / Migration

## Related

- [Dashboard](/community/dashboard)
- [Install](/guide/install)
