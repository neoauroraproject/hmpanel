# ترافیک

::: info Community
UI: `/traffic` · سوپر: دفتر هر ریسلر + شارژ · ریسلر: دفتر خودش
:::

دفتر **ledger**: بستانکار (شارژ)، بدهکار (ساخت)، شارژ مصرف. چیپ مقصد وقتی سهمیه per-panel باشد (`GET /api/traffic/destinations`).

## سوپرادمین

انتخاب ریسلر، تب مقصد، فیلتر نوع، جستجو، شارژ با `POST /api/traffic/top-up/:adminId` و `{ amount, description?, panelId? }` (`amount` در API بایت است؛ UI گیگ را تبدیل می‌کند).

## ریسلر

`GET /api/traffic/ledger` بدون `:adminId`. endpoint شارژ ندارد.

حالت حسابداری روی رکورد ادمین است — [ادمین‌ها](/fa/community/admins).

## Endpointها

| متد | مسیر | نقش |
|---|---|---|
| `GET` | `/api/traffic/ledger` | دفتر خود |
| `GET` | `/api/traffic/ledger/:adminId` | سوپر |
| `GET` | `/api/traffic/destinations` | تب‌های پنل خود |
| `GET` | `/api/traffic/destinations/:adminId` | سوپر |
| `POST` | `/api/traffic/top-up/:adminId` | سوپر |

## مرتبط

- [ادمین‌ها](/fa/community/admins)
- [شارژ ادمین](/fa/premium/admin-recharge)
