# Subscription

::: info Community
Public pages: `/p/:id`, short `/s/:token`. Administrator connection dialog on Clients.
:::

A **platform** subscription URL (`/s/…` on this panel) and a **native** 3x-ui URL (`/sub/…` on the node) may both exist. The connection interface presents two tabs when both are available (`platform` | `native`).

## Public page `/p/:id`

Community themes: Dark, Neo, Aurora, Sunset. Branding adds further themes and logos.

## Reseller portal (Community)

Path: `/settings/portal`. Distinct from Branding. Saves `portalSettings` on the administrator:

- Support: Telegram, WhatsApp, website, email
- Portal name, logo URL, primary color
- Theme in this form: **Dark**
- Toggles: platform QR, native QR, QR download, direct import, support section

`PATCH /api/admins/:id` with `{ portalSettings }`. If the Super Admin has disabled portal customization, the reseller receives HTTP 403.

## Short links

Nginx: `location /s/` → `@Controller('s')`.

| Method | Path |
|---|---|
| `GET` | `/s/:token` — public short subscription |
| `GET` | `/api/subscriptions/:id` |
| `GET` | `/api/subscriptions/:id/output` |
| `GET` | `/api/subscriptions/:id/config` |
| `GET` | `/api/subscriptions/:id/nodes` |

Store subscription URL mode (`hmpanel` or `native`) is a Store profile field.

<div class="hm-actions">

[Clients](/community/clients)
[Branding](/premium/branding)
[Store](/premium/store)

</div>
