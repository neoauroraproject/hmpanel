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

## What the limits mean

These numbers are the reseller’s ceiling. When they create a client, they cannot go above them. Zero means no cap.

### Global pool

All of this reseller’s panels share one pool. Traffic and client count are the same for every assigned panel — 3x-ui, Pasarguard, or Eylan. Per-client caps (max GB, concurrent users, and days) also apply everywhere.

### Per panel

Each panel has its own quota. They might have 500 GB on panel A and 100 GB on panel B; the two do not mix. Per-client caps on that panel are also separate.

### Traffic limit

The volume the reseller may give to clients. When it runs out, they cannot create volume clients until they are topped up.

### Max clients

How many accounts they may create. If you set 20, a 21st client is blocked. This is not the concurrent-user cap (IP / HWID).

### Max GB per client

The largest traffic volume the reseller may put on **one client**. If the pool is 500 GB and this cap is 100 GB, they can create several clients that add up to 500 GB, but none larger than 100 GB — and they cannot create an unlimited client. Zero means no per-client cap.

### Max client days

The longest expiry the reseller may pick when creating a client. If you set 30, they cannot create a 90-day client.

### Admin account expiry

When the reseller’s own login ends. It is not the duration of the clients they create.

### Max concurrent users (IP / HWID)

How many people may be online on **one client** at once — not how many clients the reseller may create. If you set 1 or 2, the reseller cannot pick a higher number when creating a client.

This cap applies to **every panel type**; only the field name changes:

- on **3x-ui** it is usually the IP limit
- on **Pasarguard** it is usually the HWID limit
- on **Eylan** it is that client’s concurrent-user cap

It is not limited to one panel type. It is also not the max-clients cap.

### Unlimited traffic

No volume cap; they may only create unlimited clients. Traffic refunds are off.

### Allocation accounting

Volume is deducted from the quota at the moment the client is created.

### Usage accounting

Only real consumption is charged, not the full amount written on the client.

<div class="hm-actions">

[Traffic](/community/traffic)
[Panels](/community/panels)
[Admin Recharge](/premium/admin-recharge)
[Premium Settings](/premium/settings)

</div>
