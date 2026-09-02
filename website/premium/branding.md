# Branding

::: warning Premium
Module `branding` · Feature `WHITE_LABEL` · Kind BUSINESS · Path: `/premium/branding`
:::

White-label appearance for subscription and store-facing pages. Community portal settings remain a Dark-theme editor on `portalSettings`.

Themes: **Aurora, Dark, Light, Eclipse, Sunset, Glass, Vibrant**. Logo and dark-logo upload, name, description, colors, Telegram and support links. Reset to defaults.

Public logo files: `GET /api/platform/premium-assets/branding/:adminId/:file`.

## API

| Method | Path |
|---|---|
| `GET` | `/api/premium-modules/branding` |
| `PUT` | `/api/premium-modules/branding` |
| `POST` | `/api/premium-modules/branding/upload/:kind` |
| `POST` | `/api/premium-modules/branding/reset` |

Store lists `branding` as a dependency.

<div class="hm-actions">

[Subscription](/community/portal)
[Custom Domains](/premium/custom-domains)
[Store](/premium/store)

</div>
