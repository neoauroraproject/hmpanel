# HMPanel Admin API (v1)

یک کلید API دقیقاً جای یک ادمین کار می‌کند: هر چه آن ادمین در پنل می‌بیند و می‌تواند انجام دهد، کلیدش هم می‌تواند — نه بیشتر. نماینده (RESELLER) فقط کاربران خودش را می‌بیند؛ سوپرادمین همه را. اگر ادمین غیرفعال یا منقضی شود، کلیدهایش هم از کار می‌افتند.

A key acts exactly as one admin: it sees and does what that admin can in the panel, never more. Resellers reach only their own clients; super admins reach everyone. Disabling or expiring the admin disables their keys too.

## ساخت کلید / Creating a key

پنل ← **دسترسی API** (`/api-keys`). هر ادمین برای خودش کلید می‌سازد؛ سوپرادمین می‌تواند برای هر ادمین دیگری هم کلید بسازد. کلید فقط یک بار نمایش داده می‌شود.

Panel → **API access** (`/api-keys`). Every admin can create keys for themselves; a super admin can also issue keys for any admin. The key is shown once.

Or with a signed-in admin JWT:

```http
POST /api/v1/keys
Authorization: Bearer <admin JWT>
Content-Type: application/json

{ "name": "NeoConfig", "scopes": ["*"], "adminId": "<optional, super admin only>" }
```

```json
{ "id": "…", "name": "NeoConfig", "keyPrefix": "hmp_AbCdEfGh", "scopes": ["*"], "apiKey": "hmp_…" }
```

| Endpoint (JWT) | |
|---|---|
| `GET /api/v1/keys` | Your keys (super admin: all keys, with owner) |
| `POST /api/v1/keys` | Create; `scopes` defaults to `["*"]` |
| `DELETE /api/v1/keys/:id` | Revoke |
| `GET /api/v1/keys/scopes` | Scope catalogue |

## احراز هویت / Authentication

```http
Authorization: Bearer hmp_xxxxxxxxxxxxxxxx
```

`X-Api-Key: hmp_…` is accepted too. Default rate limit: 60 requests/minute per key (`429` above it).

## Scopes

| Scope | Grants |
|---|---|
| `*` | Everything below |
| `account.read` | `GET /v1/account` |
| `clients.read` | `GET /v1/clients`, `/v1/clients/search`, `/v1/clients/lookup`, `/v1/clients/:id` |
| `clients.write` | `POST /v1/clients`, `PATCH /v1/clients/:id`, `DELETE /v1/clients/:id` |
| `clients.renew` | `POST /v1/clients/:id/renew`, `POST /v1/clients/:id/reset-usage` |
| `traffic.read` | `GET /v1/traffic` |
| `inbounds.read` | `GET /v1/inbounds` |
| `stats.read` | `GET /v1/stats` |
| `webhooks.manage` | `PATCH /v1/me/webhook` (see [bot-api.md](bot-api.md)) |

## Endpoints

All paths are relative to `https://<panel-domain>/api`. Sizes are bytes, times are Unix milliseconds (`0` = unlimited).

### `GET /v1/account`

```json
{
  "id": "…", "username": "ali", "email": "ali@example.com", "role": "RESELLER",
  "status": "active", "balance": 120.5, "trafficMode": "ALLOCATION",
  "unlimitedTraffic": false, "expiryTime": 0, "maxClients": 500,
  "maxDeviceLimit": 3, "maxExpireDays": 90, "maxClientTrafficGb": 200, "clientCount": 87
}
```

### `GET /v1/stats`

```json
{ "clients": { "total": 87, "enabled": 80, "disabled": 7, "expired": 5, "expiringSoon": 3 }, "usedBytes": 912345678901 }
```

### `GET /v1/inbounds`

Inbounds the admin may create clients on.

```json
{ "data": [{ "id": "…", "tag": "inbound-443", "remark": "DE", "protocol": "vless", "port": 443, "panel": { "id": "…", "name": "Germany", "panelType": "3x-ui" } }] }
```

### `GET /v1/clients/search`

Query: `page` (1), `limit` (50, max 200), `search` (email, remark, subId, token), `status` (`active` | `disabled` | `expired`), `adminId` (super admin only).

```json
{ "data": [ /* Client */ ], "page": 1, "limit": 50, "total": 87 }
```

### `GET /v1/clients/lookup?key=…`

Find one client by anything a subscription link carries: HMPanel token (the last part of `https://<panel>/s/<token>`), 3x-ui `subId`, email, uuid or provider username. `404` when it is outside the key's scope.

### `GET /v1/clients/:id`

### Client object

```json
{
  "id": "…",
  "email": "ali-01",
  "remark": "Ali",
  "subId": "a1b2c3",
  "subToken": "9f8e7d6c5b",
  "subscriptionUrl": "https://panel.example.com/s/9f8e7d6c5b",
  "enable": true,
  "disableReason": null,
  "status": "active",
  "upBytes": 1073741824,
  "downBytes": 9663676416,
  "usedBytes": 10737418240,
  "totalBytes": 53687091200,
  "remainingBytes": 42949672960,
  "expiryTime": 1767225600000,
  "limitIp": 2,
  "admin": { "id": "…", "username": "ali" },
  "panel": { "id": "…", "name": "Germany", "type": "3x-ui" },
  "lastSyncedAt": "2026-10-16T09:00:00.000Z",
  "createdAt": "2026-09-01T10:00:00.000Z",
  "updatedAt": "2026-10-16T09:00:00.000Z"
}
```

`status` is `active`, `disabled`, `expired` or `limited` (quota used up).

### `POST /v1/clients/:id/renew`

```json
{ "days": 30, "totalGb": 50, "resetUsage": true }
```

- `days` — added to the later of now and the current expiry.
- `totalGb` — new quota; `0` = unlimited. Omit to keep the current quota.
- `resetUsage` — zero the counters on the panel.

The same caps, balance deduction and panel sync as editing the client in the panel apply. Returns the updated client.

### `POST /v1/clients/:id/reset-usage`

Zeros the client's traffic. Returns the updated client.

### `POST /v1/clients`, `PATCH /v1/clients/:id`, `DELETE /v1/clients/:id`, `GET /v1/traffic`

Unchanged; documented in [bot-api.md](bot-api.md).

## Errors

| Status | Meaning |
|---|---|
| `401` | Missing/invalid key, or the admin is disabled or expired |
| `403` | The key lacks the scope (`Missing scope: clients.renew`) or the admin may not do this |
| `404` | Not found, or outside the admin's clients |
| `429` | Rate limit |

## Example

```bash
curl -s https://panel.example.com/api/v1/clients/lookup?key=9f8e7d6c5b \
  -H "Authorization: Bearer hmp_xxxxxxxx"
```

## NeoConfig

NeoConfig (the subscription-lookup PWA) connects with one of these keys: NeoConfig admin → **Panel connections** → **HMPanel**, panel URL + key. Users then see their HMPanel subscriptions, and approved renewals are applied through `POST /v1/clients/:id/renew`. A reseller's key shows only that reseller's customers.
