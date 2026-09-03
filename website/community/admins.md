# Admins

::: info Community
Super Admin only.
:::

Create and edit reseller operators here. The Super Admin created during installation (the owner) can also tick **Super Admin** when adding or editing an account. That grants the same panel access as the owner — settings, panels, clients, and resellers — and turns off traffic, client, expiry, and inbound limits.

Only the installation owner can:

- Create or promote extra Super Admins
- Demote an extra Super Admin back to a reseller (at least one inbound is required after demotion)
- Delete an extra Super Admin

The owner account itself cannot be deleted, disabled, or demoted.

For each reseller you set:

- Username and password (renaming also renames that admin’s group on 3x-ui panels)
- Allowed panels and inbounds; at least one inbound is required
- Client cap (zero means unlimited)
- Traffic cap and quota mode: one global pool, or separate per panel
- Unlimited traffic — refunds are off and only unlimited clients can be created
- Expiry days (zero means unlimited)
- Accounting: deduct on create, or charge real consumption
- Refund on delete or edit
- Whether the account is enabled

An admin who still has clients cannot be deleted.

Refund audit and post-migration repair are on this page as well.

Store, Branding, and Eylan / Pasarguard quotas are assigned under **Premium Settings → Admin Management**.

<div class="hm-actions">

[Traffic](/community/traffic)
[Panels](/community/panels)
[Admin Recharge](/premium/admin-recharge)
[Premium Settings](/premium/settings)

</div>
