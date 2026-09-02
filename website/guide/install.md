# Installation

::: info Community
Supported hosts: Ubuntu 20.04 or later, and Debian. A public IPv4 address is required to issue a Let’s Encrypt certificate for the panel domain.
:::

Official installer:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/neoauroraproject/hmpanel/main/install.sh)
```

The installer collects the following values:

- Panel domain
- Administrator username (default `admin`)
- Administrator password (minimum eight characters)
- Contact address, recorded as `admin@<domain>`

Minimum resources: **1 GB RAM**, **5 GB** disk.

Services are deployed with Docker Compose: `panel-app` (NestJS and Next.js), PostgreSQL 15, Redis 7, and Nginx. Container image: `ghcr.io/neoauroraproject/hmpanel`.

Host administration after installation is available through `sudo hm`.

<div class="hm-actions">

[Sign-in](/guide/login)
[Command line](/guide/cli)
[TLS](/community/settings#ssl)
[License](/premium/license)

</div>
