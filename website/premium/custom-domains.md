# Custom Domains

::: warning Premium
Enable the Custom Domains module in Premium Settings.
:::

Each admin or store can have a separate hostname with its own TLS certificate. That hostname is distinct from the main panel domain.

Typical steps:

1. Add the domain and, if needed, attach it to an admin or a store slug
2. Verify DNS
3. Issue the certificate
4. Delete the domain when it is no longer required

Row status is one of: pending, verified, certificate active, issuance failed, expired.

During license grace, existing domains remain usable. Adding a domain or reissuing a certificate is blocked.

The panel’s own certificate is managed under **Settings → SSL**, not on this page.

<div class="hm-actions">

[Branding](/premium/branding)
[Store](/premium/store)
[Panel SSL](/community/settings#ssl)

</div>
