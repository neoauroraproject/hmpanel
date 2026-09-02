---
layout: home
hero:
  name: HMPanel
  text: Operator wiki
  tagline: Community and Premium documented from the real admin UI and NestJS APIs — not marketing copy.
  actions:
    - theme: brand
      text: Install
      link: /guide/install
    - theme: alt
      text: Community features
      link: /community/dashboard
    - theme: alt
      text: Premium features
      link: /premium/license
    - theme: alt
      text: Compare editions
      link: /compare
features:
  - title: Community
    details: Dashboard, resellers, 3x-ui panels, clients, traffic ledger, migration, SSL, manual backup, cleanup, diagnostics, and the public subscription page.
  - title: Premium
    details: Licensed modules loaded as a bundle — branding, custom domains, store, admin recharge, Panel Plus (Eylan / Pasarguard), Monitoring Pro, Backup Center.
  - title: Buy a license
    details: Channel t.me/hmpanel · support and purchase t.me/hmraysupport · source github.com/neoauroraproject/hmpanel
---

## How this wiki is written

Every page lists:

- **Edition** — Community (ships in this repo) or Premium (downloaded after license activation)
- **UI path** and which role can open it (`SUPER_ADMIN` / `RESELLER`)
- **Tabs and actions** as they appear in the panel
- **HTTP endpoints** the UI actually calls (browser path `/api/...`; nginx strips `/api` before Nest)

If a tab exists but the API is not shipped yet, the page says so. Example: Premium Settings → Developer API is labeled coming soon in the UI.

## Editions

| | Community | Premium |
|---|---|---|
| Repo | [neoauroraproject/hmpanel](https://github.com/neoauroraproject/hmpanel) (public) | Private bundle `hmpanel-premium`, not cloned on the server |
| Default after install | `RELEASE_MODE=COMMUNITY` | Activate a key under **Settings → License** |
| After expiry | — | 7-day **grace** (`read_only`), then premium modules disable |

## Links

- Source: [github.com/neoauroraproject/hmpanel](https://github.com/neoauroraproject/hmpanel)
- Channel: [t.me/hmpanel](https://t.me/hmpanel)
- License purchase / support: [t.me/hmraysupport](https://t.me/hmraysupport)
