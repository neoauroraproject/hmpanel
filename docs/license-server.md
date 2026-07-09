# License Server (external)

The license server is a **separate project**: `hm-license-manager` (Cloudflare Worker).

## Production URLs

| Role | URL |
|------|-----|
| **Primary** | `https://license.hmray.pro` |
| **Fallback** | `https://license.hmrayserver.com` |

Panel tries primary first; on network failure it automatically uses fallback.

## Panel `.env`

```env
LICENSE_SERVER_URL=https://license.hmray.pro
LICENSE_SERVER_URL_FALLBACK=https://license.hmrayserver.com
LICENSE_PRODUCT_ID=hmpanel
PREMIUM_PLUGIN_PATH=/opt/hmpanel/premium/backend/index.js
RELEASE_MODE=COMMUNITY
```

Optional: comma-separated list instead:

```env
LICENSE_SERVER_URLS=https://license.hmray.pro,https://license.hmrayserver.com
```

## Local dev

```env
LICENSE_SERVER_URL=http://127.0.0.1:8787
```

Run `wrangler dev` in `hm-license-manager` repo.

## Repo split

| Edition | GitHub repo | Contents |
|---------|-------------|----------|
| Community | `neoauroraproject/hmpanel` | Full free panel + license hooks |
| Premium | `neoauroraproject/hmpanel-premium` (private) | Premium modules only — delivered as bundle |

Community users update from `hmpanel` only. Premium code is downloaded after license activation, not cloned on the server.

## Premium bundle download flow (secure)

1. Panel calls `POST /v1/panel/activate` on the license server (license key + instance ID + server IP).
2. License server validates license, binds/checks **allowed server IP**, creates activation.
3. License server returns a **short-lived signed URL** on itself:  
   `GET /v1/panel/bundle/download?token=...` (valid ~15 minutes).
4. Panel downloads the bundle **only from the license server** — never from GitHub directly.
5. License server fetches the private GitHub release using **GITHUB_TOKEN** (stored only on the worker).

Download is rejected unless the request comes from the **licensed server IP** and the token is valid.

### License worker secrets (required for bundle delivery)

```bash
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put JWT_PRIVATE_KEY
npx wrangler secret put JWT_PUBLIC_KEY
```

`GITHUB_REPO_OWNER=neoauroraproject` and `GITHUB_REPO_NAME=hmpanel-premium` are set in `wrangler.toml`.
