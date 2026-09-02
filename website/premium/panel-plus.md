# Panel Plus

::: warning Premium
Enable the Panel Plus module in Premium Settings.
:::

Panel Plus connects **Eylan** and **Pasarguard** to HMPanel. Those types may appear in Community, but creating or editing clients is blocked until this module is on.

Clients live on the same **Clients** page. Choose Eylan or Pasarguard from the panel selector.

## Super Admin connection

Each provider has its own card. The health strip shows online or offline.

Shared for both panels:

- Enable the connection
- Display name on the Clients selector
- Introduction text for resellers (resellers cannot edit it)
- API address and key
- Subscription domain, if needed
- Save and test

After a successful test, remote clients are loaded.

## Pasarguard

Pasarguard serves Xray / sing-box users through its own API.

After connecting you can:

- Create, edit, and delete clients
- Set traffic in GB and expiry in days
- Set concurrent-user limit (the admin cap is enforced)
- Add a note
- Enable or disable
- Bulk actions and bulk-create with a prefix
- Export subscription links and QR
- Distinguish store clients from manual clients

Reseller quota, client cap, and **allowed groups** are set in Premium Settings → Admin Management. If groups do not appear there, test this connection card first.

The Store can provision products onto Pasarguard; the destination group is chosen on the provisioning profile or the store add-on.

## Eylan

Eylan exposes four protocols through its API: **OpenVPN**, **WireGuard**, **L2TP**, and **Cisco**.

On the connection card, in addition to the shared fields:

- WireGuard instances are read from the API; if the list is empty you can type names manually
- Each instance can have a display name shown to resellers and clients

After connecting you can:

- Create a client and tick the protocols allowed for that client
- Set traffic, expiry, concurrent users, and a note
- Bulk actions, bulk-create, QR, and subscription export

In Admin Management you choose which protocols, OpenVPN nodes, and WireGuard instances the reseller may use. The reseller cannot go beyond that grant.

The Store can attach Eylan add-ons (protocol and node) to a product.

## Reseller view

The reseller sees a catalog in Panel Plus: which panels are active, remaining traffic, and the Super Admin introduction. When quota is exhausted, client creation stops until Admin Recharge or a Super Admin top-up.

The client list is still the Clients page; switch panel from the top bar.

<div class="hm-actions">

[Admin volume](/premium/settings#admin-management)
[Clients](/community/clients)
[Store](/premium/store)
[Admin Recharge](/premium/admin-recharge)

</div>
