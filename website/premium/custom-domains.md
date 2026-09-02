# Custom Domains

::: warning Premium
Module `custom-domains` · Feature `CUSTOM_DOMAINS` · Kind BUSINESS · Path: `/premium/domains`
:::

Per-administrator (or store) hostnames with TLS. Status: `PENDING`, `VERIFIED`, `SSL_ACTIVE`, `SSL_FAILED`, `EXPIRED`.

- Add domain, optional administrator assignment, optional store slug
- Verify DNS
- Issue TLS
- Delete

Nginx templates `vhost-domain.*.template` use `${VHOST_DOMAIN}` for these virtual hosts, separate from `PANEL_DOMAIN`.

## API

| Method | Path |
|---|---|
| `GET` | `/api/domains` |
| `POST` | `/api/domains` |
| `PATCH` | `/api/domains/:id` |
| `POST` | `/api/domains/:id/verify` |
| `POST` | `/api/domains/:id/ssl` |
| `DELETE` | `/api/domains/:id` |
| `GET` | `/api/domains/resolve` — public resolve by host |

During license grace: existing TLS may be viewed and used; add, issue, and change are blocked.

<div class="hm-actions">

[Branding](/premium/branding)
[Store](/premium/store)
[Panel TLS](/community/settings#ssl)

</div>
