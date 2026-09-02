# پاکسازی

::: info Community
مسیر: `/cleanup` · مدیران احراز هویت‌شده (نامزدها بر اساس نقش محدود می‌شوند)
:::

کلاینت‌هایی را فهرست می‌کند که بیش از **Settings → General → Cleanup Candidate Threshold** (`cleanup_threshold_days`) منقضی شده‌اند.

پاکسازی دائمی است و ترافیک را مسترد نمی‌کند. پس از انتخاب، `POST /api/clients/bulk` با `action: "cleanup"`.

آستانه با `POST /api/settings` ذخیره می‌شود.

## API

| روش | مسیر |
|---|---|
| `GET` | `/api/clients/cleanup-candidates` |
| `POST` | `/api/clients/bulk` — `{ ids, action: "cleanup" }` |
| `GET` / `POST` | `/api/settings` — آستانه |

حذف گروهی سایر کلاینت‌ها همان `/api/clients/bulk` را با `action: "delete"` از صفحهٔ کلاینت‌ها به‌کار می‌برد. آن مسیر در صورت فعال بودن استرداد هنگام حذف ممکن است ترافیک را بازگرداند. پاکسازی استرداد نمی‌کند.

<div class="hm-actions">

[تنظیمات](/fa/community/settings)
[کلاینت‌ها](/fa/community/clients)

</div>
