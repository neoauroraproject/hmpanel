# HMPanel Bot API (v1)

Base path: `/v1`. Authenticate with header `Authorization: Bearer hmp_...` (API key) unless noted.

## Scopes

| Scope | Endpoints |
| --- | --- |
| `clients.read` | `GET /v1/clients` |
| `clients.write` | `POST /v1/clients`, `PATCH /v1/clients/:id`, `DELETE /v1/clients/:id` |
| `traffic.read` | `GET /v1/traffic` |
| `webhooks.manage` | `PATCH /v1/me/webhook` and outbound delivery |

Super-admin JWT manages keys at `GET/POST /v1/api-clients` and `DELETE /v1/api-clients/:id`.

## Webhook payload

When `outbound_webhooks_v1` is enabled, signed POSTs go to the client's `webhookUrl`.

```json
{
  "type": "payment.completed",
  "occurredAt": "2026-01-01T00:00:00.000Z",
  "payload": { "orderId": "ord_123" }
}
```

Header `x-hmpanel-signature: sha256=<hmac_sha256(keyHash, body)>`.

Aliases (same payload, extra type): `payment.verified` → `payment.completed`, `client.created` → `user.created` / `subscription.created`, `order.paid` → `order.completed`.
