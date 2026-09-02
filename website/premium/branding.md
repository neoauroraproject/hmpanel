# Branding

::: warning Premium
Module id `branding` · Feature `WHITE_LABEL` · Kind BUSINESS · UI: `/premium/branding`
:::

White-label for subscription / store-facing appearance. Community’s [portal settings](/community/portal) remain a smaller Dark-theme editor on `portalSettings`.

## UI

Themes in `BrandingPage`: **Aurora, Dark, Light, Eclipse, Sunset, Glass, Vibrant**. Logo / logo-dark upload, name, description, colors, Telegram/support links (`normalizeTelegramLink`). Reset to defaults.

Public logo files are also served under `GET /api/platform/premium-assets/branding/:adminId/:file`.

## Endpoints

| Method | Path |
|---|---|
| `GET` | `/api/premium-modules/branding` |
| `PUT` | `/api/premium-modules/branding` |
| `POST` | `/api/premium-modules/branding/upload/:kind` |
| `POST` | `/api/premium-modules/branding/reset` |

Depends on: none. Store lists `branding` as a dependency in the manifest.

## Related

- [Subscription portal](/community/portal)
- [Custom Domains](/premium/custom-domains)
- [Store](/premium/store)
