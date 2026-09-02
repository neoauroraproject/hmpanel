# Install

::: info Community
Runs on a fresh Ubuntu 20.04+ or Debian host. Needs a public IP if you want Let's Encrypt on the panel domain.
:::

Official one-liner from [neoauroraproject/hmpanel](https://github.com/neoauroraproject/hmpanel):

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/neoauroraproject/hmpanel/main/install.sh)
```

`install.sh` (interactive) asks for:

- Panel domain
- Admin username (default `admin`)
- Admin password (minimum 8 characters)
- Email used as `admin@<domain>`

Requirements stated in the product README: about **1 GB RAM**, **5 GB disk**, public IP for ACME.

The installer deploys Docker Compose services: `panel-app` (Nest + Next), PostgreSQL 15, Redis 7, Nginx. Image: `ghcr.io/neoauroraproject/hmpanel`.

After install, CLI is `sudo hm` — see [CLI](/guide/cli).

## Related

- [Login](/guide/login)
- [Settings → SSL](/community/settings#ssl)
- [License](/premium/license) if you already have a Premium key
