# مقایسهٔ نسخه‌ها

نسخهٔ Community در توزیع عمومی ارائه می‌شود. ماژول‌های Premium پس از فعال‌سازی کلید مجوز بارگذاری می‌گردند.

عملیات نوشتن روی ایلان و پاسارگارد تا زمان مجوز داشتن Panel Plus غیرفعال است؛ حتی اگر نوع پنل در رابط Community نمایش داده شود.

| بخش | Community | Premium |
|---|---|---|
| ورود `/login` | `POST /api/auth/login`، `POST /api/auth/refresh` | یکسان |
| داشبورد `/dashboard` | شاخص‌ها و منابع میزبان از `GET /api/stats/*` | ویجت اختیاری پس از بارگذاری باندل |
| ادمین‌ها `/admins` | ریسلر، سهمیه، اینباند | تخصیص ماژول BUSINESS در تنظیمات پرمیوم |
| کلاینت‌ها `/clients` | ایجاد، ویرایش، عملیات گروهی، QR | قالب کلاینت؛ ایلان/پاسارگارد با Panel Plus |
| پنل‌ها `/panels` | عملیات کامل 3x-ui | ایلان/پاسارگارد عملیاتی نیازمند Panel Plus |
| ترافیک `/traffic` | دفتر حساب و شارژ سوپرادمین | یکسان |
| مهاجرت `/migration` | ورود از فایل `.db` | یکسان |
| تنظیمات | منطقهٔ زمانی، ACME، پشتیبان درخواستی، به‌روزرسانی | یکسان |
| لایسنس | فعال‌سازی کلید | وضعیت `PREMIUM` |
| پاکسازی `/cleanup` | `action: cleanup` بدون استرداد ترافیک | یکسان |
| عیب‌یابی `/diagnostics` | `GET /api/settings/diagnostics` | یکسان |
| اشتراک `/p/:id`، `/s/:token` | زبانهٔ پیوند سامانه و نیتیو | جایگزینی لوگو و قالب با Branding |
| `/settings/portal` | قالب Dark و پیوند پشتیبانی | ویرایشگر کامل Branding |
| فروشگاه عمومی | مسیرها موجود است؛ API نیازمند ماژول store | مدیریت و تسویهٔ کامل |
| برندینگ، دامنه، قالب | موجود نیست | `/premium/branding`، `/premium/domains`، `/premium/client-templates` |
| فروشگاه | — | `/premium/store` |
| شارژ ادمین | — | `/premium/admin-recharge` |
| Panel Plus | پاسخ `premium_unavailable` | `/premium/external-panels` |
| پایش | نوارهای داشبورد | `/premium/monitoring` |
| پشتیبان | تنظیمات → Backup | Backup Center |
| Job Center | — | تنظیمات پرمیوم → Jobs |
| Developer API | — | زبانه موجود است؛ coming soon. صدور کلید ارائه نشده است |

<div class="hm-actions">

[فعال‌سازی مجوز](/fa/premium/license)
[خرید مجوز](https://t.me/hmraysupport)
[کانال تلگرام](https://t.me/hmpanel)

</div>
