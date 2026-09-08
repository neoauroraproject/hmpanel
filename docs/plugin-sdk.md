# HMPanel Plugin SDK (skeleton)

Ordinary plugins are **Premium-only** and **declarative**. They may not run arbitrary server code (`eval`, dynamic Nest modules, shell, or raw SQL).

## Manifest

```json
{
  "id": "notify.telegram",
  "version": "1.0.0",
  "name": "Telegram notifications",
  "permissions": ["events.read"],
  "configuration": {},
  "dependencies": [],
  "slots": ["notification.telegram"]
}
```

Install / enable / disable / uninstall are stored as JSON settings. The host flag `plugin_host_v1` defaults **off**.

## Allowed slots (future marketplace)

- `payment.gateway`
- `notification.sms`
- `notification.whatsapp`
- `notification.telegram`
- `webhook.consumer`
- `analytics`
- `crm`
- `automation`

Plugins consume Core **API**, **events**, and **UI slots**. They do not access the database or secrets directly.

First-party Premium modules (store, monitoring, backup-center) stay on the existing bundle loader — this host is the third-party contract.
