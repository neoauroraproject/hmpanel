# Admin Recharge

::: warning Premium
Module id `admin-recharge` · Kind BUSINESS · UI: `/premium/admin-recharge`
:::

Reseller **credit top-up plans** with **manual payment approval**. Super Admin and Reseller see different tabs.

## Super Admin tabs

`orders` · `plans` · `payment` · `agency` · `finance` (`AdminRechargePage`).

- **Orders** — pending receipt review, approve / reject / retry. Sidebar badge uses `GET .../pending-count`
- **Plans** — catalog of recharge packs (`GET/POST/PATCH/DELETE plans`, categories)
- **Payment** — `GET/PATCH settings` (alias `payment-settings`): bank cards / crypto instructions
- **Agency** — agency catalog (`GET agency/catalog`)
- **Finance** — `GET finance`

## Reseller tabs

`buy` · `history` — browse `GET catalog`, `POST orders`, upload receipt `POST orders/:id/receipt`, `GET my-orders`. Username/credential checks: `GET check-username`, `POST validate-credentials`.

Telegram webhook for this module: `POST /api/premium-modules/admin-recharge/webhook/:secret`.

## Endpoints (`/api/premium-modules/admin-recharge`)

| Method | Path |
|---|---|
| `GET` | `pending-count` / `my-pending-count` |
| `GET/POST` | `categories` · `PATCH/DELETE categories/:id` |
| `GET` | `agency/catalog` |
| `GET` | `check-username` |
| `POST` | `validate-credentials` |
| `GET/PATCH` | `settings` or `payment-settings` |
| `GET/POST` | `plans` · `PATCH/DELETE plans/:id` |
| `GET` | `catalog` |
| `POST` | `orders` |
| `POST` | `orders/:id/receipt` |
| `GET` | `my-orders` · `orders` |
| `POST` | `orders/:id/approve` · `retry` · `reject` |
| `GET` | `finance` |

Provider access (Eylan/Pasarguard grants for resellers) lives under `admin-provider-access` (`GET/PUT :adminId`, catalog resources). Wired from Premium Settings → Admin Management, not this page’s main tabs.

## Related

- [Traffic](/community/traffic) (Super Admin still top-ups via ledger)
- [Premium Settings](/premium/settings)
