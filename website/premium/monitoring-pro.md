# Monitoring Pro

::: warning Premium
Enable the Monitoring module in Premium Settings. Super Admin only.
:::

This page is separate from the Dashboard CPU and memory bars. Panel health, live traffic, alerts, incidents, and automated rules sit in one workspace.

Telegram notices use the bot from Premium Settings. If that bot is not ready, finish that tab first.

## Platform overview

- Online panel count
- Live connections
- Health score
- Active alerts

A red mark on a panel means offline or an open incident. Select the panel for detail.

## Per panel

For the selected panel you see:

- API latency and uptime
- Online users, active / disabled / expired clients, inbound count
- Resources: CPU, memory, disk
- CPU and RAM percentage charts
- Upload and download in the chosen range, plus lifetime sent and received
- Traffic trend in MB/s

History range: one hour, six hours, or twenty-four hours.

## Availability

Downtime over 24 hours, 7 days, and 30 days. Total minutes down and the longest outage are shown.

## Alerts and notices

One Telegram channel, with the panel name and an anti-repeat interval:

- Traffic drop (threshold in MB/s and consecutive confirmations)
- Panel offline
- High CPU
- Memory pressure
- Resources and disk

Include all panels or only some. Unticked panels do not receive messages.

Anti-repeat is in minutes so one panel does not flood the channel.

## Alert center and incidents

Alerts at critical, warning, and info. The incident timeline lets you acknowledge, resolve, reopen, or archive. The incident graph plots traffic drops below the threshold on the same range.

## Alert rules

A new rule has a name, cooldown, condition, and action:

- Condition: traffic collapse, node offline, memory pressure, CPU and RAM exhaustion
- Action: notify only, restart Xray (dangerous), or send Telegram

<div class="hm-actions">

[Dashboard](/community/dashboard)
[Premium Settings](/premium/settings)
[Telegram bot](/premium/settings#telegram-bot)

</div>
