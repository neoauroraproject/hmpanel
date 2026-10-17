# HMPanel Admin API (v1)

یک کلید API دقیقاً جای یک ادمین کار می‌کند: هر چه آن ادمین در پنل می‌بیند و می‌تواند انجام دهد، کلیدش هم می‌تواند — نه بیشتر. نماینده (RESELLER) فقط کاربران خودش را می‌بیند؛ سوپرادمین همه را. اگر ادمین غیرفعال یا منقضی شود، کلیدهایش هم از کار می‌افتند.

A key acts exactly as one admin: it sees and does what that admin can in the panel, never more. Resellers reach only their own clients; super admins reach everyone. Disabling or expiring the admin disables their keys too.

## ساخت کلید / Creating a key

پنل ← **تنظیمات ← API** (یا **دسترسی API** در منو، `/api-keys`). هر ادمین برای خودش کلید می‌سازد؛ سوپرادمین می‌تواند برای هر ادمین دیگری هم کلید بسازد. کلید فقط یک بار نمایش داده می‌شود.

Panel → **Settings → API** (or **API access** in the menu, `/api-keys`). Every admin can create keys for themselves; a super admin can also issue keys for any admin. The key is shown once.

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

## مستندات JSON / Machine-readable docs

| | |
|---|---|
| `GET /api/v1/docs` | Links to everything below |
| `GET /api/v1/openapi.json` | OpenAPI 3 document for the key API (`/v1`) |
| `GET /api/api-json` | OpenAPI 3 document for the whole panel |
| `/api/api` | Swagger UI |

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

### Premium scopes

فقط وقتی کار می‌کنند که لایسنس پرمیوم فعال و بسته‌ی پرمیوم نصب باشد. / Only work while the Premium license is active and the premium bundle is installed.

| Scope | Grants |
|---|---|
| `store.read` | `GET /v1/premium/store…` (store, payment cards, products, orders, customers, dashboard) |
| `store.write` | `POST /v1/premium/store/orders`, `…/orders/:id/approve`, `…/orders/:id/reject` |
| `agency.read` | `GET /v1/premium/agency/catalog`, `GET /v1/premium/agency/orders…` |
| `agency.write` | `POST /v1/premium/agency/orders`, `…/receipt`, `…/approve`, `…/reject` |
| `external.read` | `GET /v1/premium/external-panels…` |
| `external.write` | `POST/PATCH/DELETE /v1/premium/external-panels/:providerId/clients…` |
| `payg.read` | `GET /v1/premium/payg/subscriptions…` |
| `payg.write` | `POST /v1/premium/payg/subscriptions/:id/suspend`, `…/resume` |
| `templates.read` | `GET /v1/premium/client-templates`, `…/pools` |

`*` covers these too.

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

## Premium (`/v1/premium`)

مسیرهای پرمیوم با همان کلیدها کار می‌کنند. هر درخواست از سه دروازه می‌گذرد:

1. **لایسنس پرمیوم فعال** و بسته‌ی پرمیوم نصب‌شده (بدون بسته این مسیرها `404` می‌دهند؛ با لایسنس غیرفعال `403`).
2. **اسکوپ کلید** (جدول بالا).
3. **ماژول همان ادمین**: سوپرادمین همه‌ی ماژول‌های فعال را دارد؛ نماینده فقط ماژول‌هایی که در **پرمیوم ← ماژول‌ها** به او داده شده. هر ماژول هم فقط داده‌ی خود آن ادمین را برمی‌گرداند: فروشگاه خودش، محصولات خودش، شماره‌کارت‌های خودش، سفارش‌های خودش.

Premium routes use the same keys. Every request passes three gates:

1. **An active Premium license** with the premium bundle installed (without the bundle these routes are `404`; with an inactive license `403`).
2. **The key's scope** (table above).
3. **That admin's module assignment**: a super admin has every enabled module; a reseller only the modules assigned under **Premium → Modules**. Each module returns only that admin's data — their store, products, payment cards and orders.

`GET /api/v1/docs` reports `premium.available`; `GET /api/v1/premium` lists the modules the key's admin can use.

### `GET /v1/premium`

Any valid key; no scope needed.

```json
{
  "premium": true,
  "admin": { "id": "…", "role": "RESELLER" },
  "scopes": ["*"],
  "modules": [
    { "id": "store", "name": "Store", "kind": "BUSINESS", "mode": "full", "canWrite": true },
    { "id": "admin-recharge", "name": "Credit & Agency", "kind": "BUSINESS", "mode": "full", "canWrite": true }
  ]
}
```

A route whose module the admin lacks returns `403 Module "store" is not enabled for this account.`

### فروشگاه / Store — module `store`

| | Scope | |
|---|---|---|
| `GET /v1/premium/store` | `store.read` | The admin's store + payment (cards, wallets) |
| `GET /v1/premium/store/payment?surface=` | `store.read` | Payment for `store` (default), `renewal` or `add_balance` |
| `GET /v1/premium/store/dashboard` | `store.read` | Sales summary (same as the panel dashboard) |
| `GET /v1/premium/store/categories` | `store.read` | Categories |
| `GET /v1/premium/store/products?kind=` | `store.read` | Products; `kind` = `VPN` or `DIGITAL` |
| `GET /v1/premium/store/orders` | `store.read` | `page`, `limit` (≤200), `status`, `customerId`, `search` (tracking code / config name) |
| `GET /v1/premium/store/orders/:id` | `store.read` | One order + timeline + `receiptImage` |
| `POST /v1/premium/store/orders` | `store.write` | Place an order (storefront checkout) |
| `POST /v1/premium/store/orders/:id/approve` | `store.write` | Approve payment and deliver |
| `POST /v1/premium/store/orders/:id/reject` | `store.write` | `{ "reason": "…" }` |
| `GET /v1/premium/store/customers` | `store.read` | `page`, `limit`, `search` (name, Telegram, email, Telegram user id) |
| `GET /v1/premium/store/customers/:id` | `store.read` | One customer + last 20 orders |

`GET /v1/premium/store`:

```json
{
  "id": "…", "title": "Ali Store", "description": null, "slug": "ali-m3x9", "enabled": true,
  "defaultCurrency": "IRT",
  "storefrontUrl": "https://panel.example.com/shop/ali-m3x9", "customDomain": null,
  "payment": {
    "surface": "store",
    "defaultMethod": "manual_bank",
    "methods": [{ "id": "manual_bank", "label": "Card to Card", "enabled": true }, { "id": "wallet", "label": "Wallet", "enabled": true }],
    "cards": [{ "id": "card_…", "bankName": "Mellat", "cardNumber": "6104…", "cardHolder": "Ali", "iban": "IR…", "instructions": "" }],
    "wallets": [{ "id": "…", "title": "USDT", "asset": "USDT", "network": "TRC20", "address": "T…", "instructions": "" }],
    "instructions": null
  }
}
```

Only enabled cards and wallets are listed — the same ones the admin's storefront and bot show. A reseller sees their own cards, never the super admin's.

Product:

```json
{
  "id": "…", "name": "30 days · 50 GB", "description": null, "kind": "VPN",
  "category": { "id": "…", "name": "Germany" }, "providerId": "3xui", "panel": { "id": "…", "name": "DE-1" },
  "priceUsd": 2.5, "priceToman": 150000, "trafficBytes": 53687091200, "durationDays": 30,
  "status": "active", "visible": true, "featured": false, "renewable": true, "isTest": false,
  "badge": null, "maxQuantity": 1, "ipLimitOptions": [], "sortOrder": 0
}
```

Order:

```json
{
  "id": "…", "trackingCode": "HM-7K2P9Q", "status": "UNDER_REVIEW",
  "amount": 150000, "discountAmount": 0, "currency": "IRT",
  "configName": "ali-01", "isRenewal": false, "isTest": false, "limitIp": null,
  "notes": null, "rejectReason": null, "provisionError": null,
  "product": { "id": "…", "name": "30 days · 50 GB", "kind": "VPN" },
  "customer": { "id": "…", "name": "Reza", "telegram": "@reza", "telegramUsername": "reza", "email": null },
  "payment": { "method": "MANUAL_BANK", "status": "SUBMITTED", "amount": 150000, "currency": "IRT", "receiptText": "1234", "hasReceiptImage": true, "reviewedAt": null, "rejectReason": null },
  "client": null,
  "subscriptionUrl": null,
  "createdAt": "2026-10-17T10:00:00.000Z", "updatedAt": "2026-10-17T10:00:00.000Z"
}
```

`status`: `PENDING_PAYMENT`, `PAYMENT_SUBMITTED`, `UNDER_REVIEW`, `APPROVED`, `PROVISIONING`, `PROVISION_FAILED`, `ACTIVE`, `REJECTED`, `CANCELLED`, `EXPIRED`, `RENEWED`. Once delivered, `client` and `subscriptionUrl` are filled. Customer tokens are never listed.

`POST /v1/premium/store/orders` runs the storefront checkout on the admin's own store (the store must be enabled):

```json
{
  "productId": "…",
  "name": "Reza", "telegram": "@reza", "telegramUserId": "123456789",
  "paymentMethod": "MANUAL_BANK",
  "receiptText": "tracking 1234", "receiptImage": "data:image/jpeg;base64,…",
  "couponCode": "OFF10", "limitIp": 2,
  "isRenewal": false, "renewClientId": null,
  "customerToken": "<optional: reuse an existing customer>"
}
```

```json
{ "orderId": "…", "trackingCode": "HM-7K2P9Q", "customerToken": "…", "status": "UNDER_REVIEW", "amount": 150000, "discountAmount": 0, "paymentMethod": "MANUAL_BANK" }
```

Prices, coupons, test-product limits, wallet charges, auto-delivery and Telegram notices behave as on the storefront. Keep `customerToken` to place later orders for the same customer.

### نمایندگی و شارژ / Agency & credit — module `admin-recharge`

| | Scope | |
|---|---|---|
| `GET /v1/premium/agency/catalog` | `agency.read` | Top-up plans + where to pay (the super admin's cards/wallets) |
| `GET /v1/premium/agency/orders` | `agency.read` | `page`, `limit`, `status`, `orderKind`; super admin: everyone's, `adminId` filters |
| `GET /v1/premium/agency/orders/:id` | `agency.read` | One order + timeline + `receiptImage` |
| `POST /v1/premium/agency/orders` | `agency.write` | Order a top-up for this admin |
| `POST /v1/premium/agency/orders/:id/receipt` | `agency.write` | `{ "receiptText": "…", "receiptImage": "data:…" }` |
| `POST /v1/premium/agency/orders/:id/approve` | `agency.write` | Super admin only: approve and credit |
| `POST /v1/premium/agency/orders/:id/reject` | `agency.write` | Super admin only: `{ "reason": "…" }` |

`GET /v1/premium/agency/catalog`:

```json
{
  "plans": [ /* enabled TOP_UP plans, as in the panel */ ],
  "categories": [ /* … */ ],
  "admin": { "quotaMode": "GLOBAL", "unlimitedTraffic": false, "panels": [{ "id": "…", "name": "DE-1" }], "ownedProviders": ["3xui"] },
  "payment": {
    "methods": { "manual_bank": true },
    "cards": [{ "id": "…", "bankName": "Mellat", "cardNumber": "6104…", "cardHolder": "Owner", "iban": "IR…", "instructions": "" }],
    "wallets": []
  },
  "support": { "telegram": "@support", "text": null }
}
```

`POST /v1/premium/agency/orders`:

```json
{ "planId": "…", "panelId": "<for per-panel plans>", "paymentMethod": "manual_bank", "receiptText": "1234", "receiptImage": "data:image/jpeg;base64,…" }
```

or several plans: `{ "items": [{ "planId": "…", "panelId": "…" }] }`. Returns the order (below) plus `invoiceUrl` / `starsAmount` for Telegram payments.

```json
{
  "id": "…", "trackingCode": "AR-…", "orderKind": "TOP_UP", "status": "PAYMENT_SUBMITTED",
  "amount": 500000, "currency": "IRT", "trafficBytes": 107374182400, "expiryDays": 30, "maxClientsDelta": 0,
  "plan": { "id": "…", "name": "100 GB", "planKind": "TOP_UP" }, "panel": null,
  "admin": { "id": "…", "username": "ali" }, "targetAdmin": { "id": "…", "username": "ali" },
  "requestedUsername": null, "paymentMethod": "manual_bank",
  "receiptText": "1234", "hasReceiptImage": true,
  "rejectReason": null, "provisionError": null, "reviewedAt": null, "creditedAt": null,
  "createdAt": "…", "updatedAt": "…"
}
```

`status`: `PENDING_PAYMENT`, `PAYMENT_SUBMITTED`, `PROVISIONING`, `PROVISION_FAILED`, `PARTIAL_SUCCESS`, `APPROVED`, `REJECTED`, `CANCELLED`.

### پنل‌های خارجی / External panels — module `external-panels`

`providerId` is `eylan` or `pasarguard`. A reseller reaches only the providers granted to them, and only their own users there.

| | Scope | |
|---|---|---|
| `GET /v1/premium/external-panels` | `external.read` | `{ "providers": [{ "id": "pasarguard", "label": "…" }], "canManageConnections": false, "xuiEnabled": true }` |
| `GET /v1/premium/external-panels/:providerId/clients` | `external.read` | `offset`, `limit` (≤200), `search` |
| `GET /v1/premium/external-panels/:providerId/clients/:username` | `external.read` | One user |
| `GET /v1/premium/external-panels/:providerId/clients/:username/output` | `external.read` | Subscription link, configs, QR text |
| `POST /v1/premium/external-panels/:providerId/clients` | `external.write` | `{ "username", "dataLimitGb", "expiryDays", "note", "groupIds", "hwidLimit", "enabled" }` |
| `PATCH /v1/premium/external-panels/:providerId/clients/:username` | `external.write` | Same fields, all optional |
| `DELETE /v1/premium/external-panels/:providerId/clients/:username` | `external.write` | |

Caps, quota and the admin's traffic are applied exactly as in the panel.

### پرداخت به‌اندازه مصرف / Pay-as-you-go — module `store-payg`

| | Scope | |
|---|---|---|
| `GET /v1/premium/payg/subscriptions` | `payg.read` | `status`, `customerId`, `planId`, `q` |
| `GET /v1/premium/payg/subscriptions/:id` | `payg.read` | |
| `GET /v1/premium/payg/subscriptions/:id/usage` | `payg.read` | |
| `POST /v1/premium/payg/subscriptions/:id/suspend` | `payg.write` | |
| `POST /v1/premium/payg/subscriptions/:id/resume` | `payg.write` | |

### قالب کاربر / Client templates — module `client-templates`

| | Scope | |
|---|---|---|
| `GET /v1/premium/client-templates` | `templates.read` | The admin's templates |
| `GET /v1/premium/client-templates/pools` | `templates.read` | Name pools |

### Premium example

```bash
# Cards a reseller's bot should show for payment
curl -s https://panel.example.com/api/v1/premium/store/payment \
  -H "Authorization: Bearer hmp_xxxxxxxx"

# Orders waiting for review
curl -s "https://panel.example.com/api/v1/premium/store/orders?status=UNDER_REVIEW" \
  -H "Authorization: Bearer hmp_xxxxxxxx"
```

## Errors

| Status | Meaning |
|---|---|
| `401` | Missing/invalid key, or the admin is disabled or expired |
| `403` | The key lacks the scope (`Missing scope: clients.renew`), the admin may not do this, the Premium license is inactive, or the admin lacks the premium module |
| `404` | Not found, outside the admin's data, or (`/v1/premium/*`) the premium bundle is not installed |
| `429` | Rate limit |

## Example

```bash
curl -s https://panel.example.com/api/v1/clients/lookup?key=9f8e7d6c5b \
  -H "Authorization: Bearer hmp_xxxxxxxx"
```

## NeoConfig

NeoConfig (the subscription-lookup PWA) connects with one of these keys: NeoConfig admin → **Panel connections** → **HMPanel**, panel URL + key. Users then see their HMPanel subscriptions, and approved renewals are applied through `POST /v1/clients/:id/renew`. A reseller's key shows only that reseller's customers.
