# Custom Domains

::: warning Premium
Module id `custom-domains` · Feature `CUSTOM_DOMAINS` · Kind BUSINESS · UI: `/premium/domains`
:::

Per-admin (or store) hostnames with SSL. Status chips in the UI: `PENDING`, `VERIFIED`, `SSL_ACTIVE`, `SSL_FAILED`, `EXPIRED`.

## UI

- Add domain, optional assign admin, optional store slug
- Verify DNS
- Issue SSL
- Delete

Nginx templates `vhost-domain.*.template` use `${VHOST_DOMAIN}` for these vhosts (separate from the main `PANEL_DOMAIN`).

## Endpoints

| Method | Path |
|---|---|
| `GET` | `/api/domains` |
| `POST` | `/api/domains` |
| `PATCH` | `/api/domains/:id` |
| `POST` | `/api/domains/:id/verify` |
| `POST` | `/api/domains/:id/ssl` |
| `DELETE` | `/api/domains/:id` |
| `GET` | `/api/domains/resolve` — public resolve by host (`public-domains.controller`) |

Read-only when license is in grace: view/use existing SSL; writes (add/issue/change) blocked by feature manager.

## Related

- [Branding](/premium/branding)
- [Store](/premium/store)
- [Settings → SSL](/community/settings#ssl) (that tab is the **panel** hostname, not reseller vhosts)
