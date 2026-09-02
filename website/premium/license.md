# License

::: warning Premium
Path: **Settings → License** (`/settings`, tab `license`). Super Admin may activate a key from Community.
:::

Default installation is Community (`RELEASE_MODE=COMMUNITY`). Premium source is not included in the public repository. After a valid key, the panel downloads a signed bundle from `license.hmray.pro` (fallback `license.hmrayserver.com`) and loads NestJS modules together with `premium-runtime.js`.

Purchase and support: [t.me/hmraysupport](https://t.me/hmraysupport). Channel: [t.me/hmpanel](https://t.me/hmpanel).

## Card actions

- Activate — paste the license key
- Deactivate — bundle files may remain on disk
- Recheck with the license server
- Update bundle — download the current bundle for this key
- Reload plugins — not executed automatically after a failed bundle

Status: `active`, `grace`, `expired`, `invalid`, `community`. Mode: `full`, `read_only`, `disabled`. Edition: `COMMUNITY` | `PREMIUM`.

Grace period: 7 days. During grace, Premium remains mounted as **read-only**. After grace, modules are disabled.

Bundles that declare `minPanelVersion` are rejected until `hm update` raises the image.

## API

| Method | Path |
|---|---|
| `GET` | `/api/platform/license` |
| `POST` | `/api/platform/license/activate` — `{ licenseKey }` |
| `POST` | `/api/platform/license/deactivate` |
| `POST` | `/api/platform/license/recheck` |
| `POST` | `/api/platform/license/update-bundle` |
| `POST` | `/api/platform/license/reload-plugins` |
| `POST` | `/api/platform/license/diagnose-bundle` |
| `GET` | `/api/platform/license/bundle-status` |
| `GET` | `/api/platform/features` |
| `GET` | `/api/platform/premium-module-catalog` |
| `GET` | `/api/platform/premium-modules-all` |
| `GET` | `/api/premium-modules` |
| `GET` | `/api/platform/premium-assets/frontend/premium-runtime.js` |
| `GET` | `/api/platform/premium-assets/frontend/premium-runtime.css` |
| `GET` | `/api/platform/premium-assets/frontend/premium-monitoring.js` |
| `GET` | `/api/settings/license` |

Product identifier: `LICENSE_PRODUCT_ID=hmpanel`.

<div class="hm-actions">

[Premium Settings](/premium/settings)
[Modules](/premium/modules)
[Edition comparison](/compare)

</div>
