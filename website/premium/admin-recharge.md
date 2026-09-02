# Admin Recharge

::: warning Premium
Module `admin-recharge` · Kind BUSINESS · Path: `/premium/admin-recharge`
:::

Reseller credit plans with manual payment approval. Super Admin and Reseller see different tabs.

## Super Admin

`orders` · `plans` · `payment` · `agency` · `finance`

- **Orders** — pending receipt review; approve, reject, retry. Badge: `GET .../pending-count`
- **Plans** — recharge packs (`GET/POST/PATCH/DELETE plans`, categories)
- **Payment** — `GET/PATCH settings` (alias `payment-settings`): bank cards and crypto instructions
- **Agency** — `GET agency/catalog`
- **Finance** — `GET finance`

## Reseller

`buy` · `history` — `GET catalog`, `POST orders`, upload receipt `POST orders/:id/receipt`, `GET my-orders`. Credential checks: `GET check-username`, `POST validate-credentials`.

Telegram webhook: `POST /api/premium-modules/admin-recharge/webhook/:secret`.

## API (`/api/premium-modules/admin-recharge`)

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

Eylan and Pasarguard grants for resellers are configured under Premium Settings → Admin Management (`admin-provider-access`).

<div class="hm-actions">

[Traffic](/community/traffic)
[Premium Settings](/premium/settings)

</div>
