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
