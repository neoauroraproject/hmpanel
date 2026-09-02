# Premium Settings

::: warning Premium
Available to Super Admin after the license is activated.
:::

Open Settings, then Premium. Five tabs.

## Modules

Every Premium capability. Turn each row on or off.

- **Platform:** Monitoring Pro, Backup Center, Job Center
- **Business:** Store, Branding, Custom Domains, Client Templates, Admin Recharge, Panel Plus

A module stays out of the menu until it is enabled.

## Admin Management

This tab is where reseller accounts, traffic volume, and external-panel access are controlled. Expand an admin to edit the details.

### Account and modules

- Enable or disable the account
- Grant Premium modules one by one — Store only, or Store with Branding and domains
- Turn Custom Domains on for the whole installation from this tab

### Volume on 3x-ui

Choose one accounting mode for 3x-ui traffic:

- **Allocation:** volume is deducted from the admin quota when a client is created
- **Usage:** charging follows real consumption

This selector applies to 3x-ui only. Eylan and Pasarguard each have their own mode.

### Volume on Pasarguard

Per reseller:

- Enable or disable access
- Traffic quota in GB
- Maximum clients
- Maximum service days and concurrent users (IP) — zero means no cap
- Separate accounting mode (allocation or usage)
- **Allowed groups** on Pasarguard; the reseller can create clients only in those groups

If no groups appear, test the Super Admin connection in Panel Plus first.

### Volume on Eylan

Per reseller:

- Access, traffic quota, client cap, max days, and max IP
- Separate accounting mode
- Allowed protocols: **OpenVPN**, **WireGuard**, **L2TP**, **Cisco**
- For OpenVPN: allowed nodes
- For WireGuard: default WG1 and extra instances (wg2 and later)

The reseller only sees the protocols and nodes ticked here.

When the quota is exhausted, new clients cannot be created until credit is increased — from the traffic ledger or Admin Recharge.

## Job Center

Queue for backups, SSL, sync, and monitoring scans. Each job has a status. Failed jobs can be retried.

## Telegram bot

Bot token and chat identifier. Backup notices and alert notices are separate switches. Optional SOCKS or HTTP proxy. The test action sends a message.

The same bot is used by Monitoring Pro and Backup Center.

## Developer API

Marked coming soon. Key issuance is not in the panel yet.

<div class="hm-actions">

[Panel Plus](/premium/panel-plus)
[Monitoring Pro](/premium/monitoring-pro)
[Admin Recharge](/premium/admin-recharge)
[Buy license](https://t.me/hmraysupport)

</div>
