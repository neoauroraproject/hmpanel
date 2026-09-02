# Installation

::: info Community
Hosts: Ubuntu 20.04 or later, and Debian. A public IP address is required for Let’s Encrypt on the panel domain.
:::

Official installer:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/neoauroraproject/hmpanel/main/install.sh)
```

The installer asks for:

- Panel domain
- Administrator username (default `admin`)
- Password (at least eight characters)
- Contact email

Minimum resources: 1 GB RAM and 5 GB disk.

After installation, host administration is available with `sudo hm`.

<div class="hm-actions">

[Sign-in](/guide/login)
[Command line](/guide/cli)
[SSL](/community/settings#ssl)
[License](/premium/license)

</div>
