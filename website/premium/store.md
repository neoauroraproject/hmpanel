# Store

::: warning Premium
Module `store` · Feature `CUSTOM_SUBSCRIPTION_PORTAL` · Depends on branding · Path: `/premium/store`
:::

Administrator store, public shop, customer portal, and Telegram Mini App. The Community tree includes a subset of Store controllers. The licensed bundle adds coupons, wallet, IP limits, analytics, broadcast, and add-ons.

## Administrator tabs

| Tab | Contents |
|---|---|
| Overview | Summary (`GET .../dashboard`), Analytics (`GET .../analytics`) |
| Commerce | Orders, Products, Categories, Provisioning profiles, Coupons, Wallet deposits, IP limits |
| Customers | Directory, Telegram broadcast |
| Settings | Store profile, Telegram bot, product add-ons (Eylan / Pasarguard) |

Orders: approve, reject, provision, cancel, manual-deliver. Customers: attach and update services.

Public routes (no administrator JWT): `/shop/:slug`, `/shop/:slug/portal`, `/portal`, `/portal/dashboard`, `/track/:code`. Customer portal: **home / orders / alerts**. Mini App: **home / services / shop / orders / alerts**.

Checkout (guest, portal, Mini App): category → products → name and add-ons → payment. Coupons may be limited to `both`, `new`, or `renewal`.

## Administrator API (`/api/premium-modules/store`)

Guards: JWT, Premium, module `store`.

| Area | Methods |
|---|---|
| Dashboard / profile | `GET dashboard`, `GET/PUT profile` |
| Categories | `GET/POST categories`, `POST categories/reorder`, `PATCH/DELETE categories/:id` |
| Profiles | `GET profiles`, `GET provisioning-options`, `POST/PATCH/DELETE profiles/:id` |
| Templates | `GET/POST templates`, `PATCH/DELETE templates/:id`, `POST templates/:id/clone` |
| Products | `GET/POST products`, `POST products/reorder`, `PATCH/DELETE products/:id` |
| IP limits | `GET/POST ip-limits`, `DELETE ip-limits/:id`, `POST ip-limits/migrate-legacy` |
| Add-ons | `GET/POST product-addons`, `DELETE product-addons/:id`; Eylan/Pasarguard `GET/PUT addons/:provider`, test, options, grants |
| Orders | `GET orders`, `GET orders/:id`, `POST orders/:id/approve\|reject\|provision\|cancel\|manual-deliver`, `PATCH orders/:id` |
| Customers | `GET customers`, `GET customers/:id`, `POST customers/:id/services/attach`, `PATCH customers/:id/services/:clientId` |
| Telegram | `GET/PUT telegram`, `POST telegram/test`, `POST telegram/activate`, `GET telegram/broadcast/preview`, `POST telegram/broadcast` |
| Coupons | `GET/POST coupons`, `DELETE coupons/:id` |
| Referral | `GET/POST referral-rewards`, `DELETE referral-rewards/:id` |
| Wallet | `GET wallet/deposits`, `POST wallet/deposits/:id/approve\|reject`, `POST wallet/customers/:customerId/adjust` |
| Analytics | `GET analytics` |

## Public API (`/api/store`)

| Method | Path |
|---|---|
| `GET` | `/api/store/public/:slug` |
| `GET` | `/api/store/public/by-domain` |
| `POST` | `/api/store/public/:slug/customer` |
| `POST` | `/api/store/public/:slug/order` |
| `POST` | `/api/store/public/:slug/coupon/validate` |
| `POST` | `/api/store/public/:slug/coupons/applicable` |
| `GET` | `/api/store/track/:code` |
| `POST` | `/api/store/customer/session` |
| `GET` | `/api/store/customer/session` |
| `POST` | `/api/store/customer/logout` |
| `POST` | `/api/store/customer/order` |
| `POST` | `/api/store/customer/renew` |
| `POST` | `/api/store/customer/orders/:id/cancel` |
| `POST` | `/api/store/customer/services/claim` |
| `GET` | `/api/store/portal/:token` |
| `POST` | `/api/store/portal/:token/renew` |
| `POST` | `/api/store/telegram/session` |
| `POST` | `/api/store/telegram/webhook/:slug/:secret` |
| `GET` | `/api/store/customer/wallet` |
| `POST` | `/api/store/customer/wallet/deposit` |

Customer session header: `x-customer-session`.

<div class="hm-actions">

[Branding](/premium/branding)
[Custom Domains](/premium/custom-domains)
[Panel Plus](/premium/panel-plus)

</div>
