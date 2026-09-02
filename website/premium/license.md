# License and bundle

::: warning Premium
UI: **Settings → License** (`/settings`, tab `license`). Any Super Admin can open the card in Community to **upgrade**.
:::

Default install is Community (`RELEASE_MODE=COMMUNITY`). Premium code is **not** in the public git clone. After a valid key, the panel downloads a signed bundle from the license server (`license.hmray.pro`, fallback `license.hmrayserver.com`) and loads Nest modules + `premium-runtime.js`.

Support / purchase: [t.me/hmraysupport](https://t.me/hmraysupport). Channel: [t.me/hmpanel](https://t.me/hmpanel).

## Card actions

From `LicenseSettingsCard`:

- Paste license key → Activate
- Deactivate (bundle files can remain on disk)
- Recheck with license server
- Update bundle (download latest for this key)
- Reload plugins (does **not** auto-run after a failed bundle; Settings will not loop 502)

Status values: `active`, `grace`, `expired`, `invalid`, `community`. Mode: `full`, `read_only`, `disabled`. Edition: `COMMUNITY` | `PREMIUM`.

**Grace:** `GRACE_DAYS = 7` in `license-manager.service.ts`. During grace, premium stays mounted in **read-only** (`mode: read_only`). After grace, modules disable.

Bundles that declare `minPanelVersion` are rejected until `hm update` raises the image.

## Endpoints

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

Product id on the worker: `LICENSE_PRODUCT_ID=hmpanel`.

## Related

- [Premium Settings](/premium/settings)
- [Compare](/compare)
