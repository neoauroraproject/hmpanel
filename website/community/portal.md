# Subscription portal

::: info Community
Public pages: `/p/:id` (themed HTML), short `/s/:token`. Admin connection modal on Clients.
:::

HMPanel can show a **platform** subscription URL (`/s/…` via this panel) and a **native** 3x-ui URL (`/sub/…` on the node). The connection UI has two tabs when both exist (`SubscriptionRenderer`: `platform` | `native`).

## Public page `/p/:id`

Frontend route `frontend/src/app/p/[id]/page.tsx`. Themes shipped in Community include Dark / Neo / Aurora / Sunset (Premium [Branding](/premium/branding) adds more themes and logos). Data comes from subscription APIs below.

## Reseller branding (Community)

UI: `/settings/portal` — **not** the Premium Branding module. Saves `portalSettings` on the admin:

- Support toggles: Telegram, WhatsApp, website, email
- Portal name, logo URL, primary color
- Theme in this Community form: **Dark** only
- Toggles: show platform QR, native QR, allow QR download, allow direct import, show support section

`PATCH /api/admins/:id` with `{ portalSettings }`. If the Super Admin disabled portal customization, the reseller gets HTTP 403 and a “Feature Disabled” card.

## Short links

Nginx: `location /s/` → backend `@Controller('s')`.

| Method | Path |
|---|---|
| `GET` | `/s/:token` — public short subscription |
| `GET` | `/api/subscriptions/:id` |
| `GET` | `/api/subscriptions/:id/output` |
| `GET` | `/api/subscriptions/:id/config` |
| `GET` | `/api/subscriptions/:id/nodes` |

Store-specific subscription URL mode (`hmpanel` vs `native`) is a Premium Store profile field — [Store](/premium/store).

3x-ui custom HTML templates (on the **3x-ui** box, not HMPanel) are described in-repo at `docs/custom-subscription-templates.md`.

## Related

- [Clients](/community/clients)
- [Branding](/premium/branding)
- [Store](/premium/store)
