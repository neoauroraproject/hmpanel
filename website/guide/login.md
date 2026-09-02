# Sign-in

::: info Community
Path: `/login` · Authentication: public
:::

The sign-in form submits the username and password, stores the issued tokens, and opens `/dashboard`. English and فارسی are selectable on this page.

## API

| Method | Path | Access |
|---|---|---|
| `POST` | `/api/auth/login` | Public. Body: `{ username, password }`. Response includes `accessToken`, `refreshToken`, and `admin`. |
| `POST` | `/api/auth/refresh` | Body: `{ refreshToken }`. Issues a new access token. |

Nginx forwards `POST /api/auth/login` to the same handler.

The client uses base URL `/api` and persists the session in `localStorage` under `panel-auth`. Subsequent requests send the access token. A `401` response attempts refresh.

Roles after authentication:

- `SUPER_ADMIN` — Community navigation including Admins, Panels, Migration, and Settings
- `RESELLER` — Dashboard, Clients, and the operator’s own traffic ledger. Settings, Panels, and Migration are not available

<div class="hm-actions">

[Dashboard](/community/dashboard)
[Installation](/guide/install)

</div>
