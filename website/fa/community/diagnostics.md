# عیب‌یابی

::: info Community
مسیر: `/diagnostics` · نقش: `SUPER_ADMIN`
:::

- **Version** — نسخهٔ نصب‌شده، برچسب تصویر در حال اجرا، آخرین انتشار GitHub
- **Host** — نام میزبان، CPU، حافظه، دیسک
- دسترسی به Docker و GitHub API
- یادداشت در صورت عدم اتصال `/var/run/docker.sock` (مدیریت میزبان و ردگیری به‌روزرسانی خودکار غیرفعال است)
- ماتریس قابلیت، تشخیص TLS، تحلیل گواهی، تشخیص میزبان، پرچم به‌روزرسانی خودکار

بازهٔ نوسازی: ۱۵ ثانیه.

## API

| روش | مسیر |
|---|---|
| `GET` | `/api/settings/diagnostics` |
| `GET` | `/api/stats/diagnostics` |

<div class="hm-actions">

[تنظیمات](/fa/community/settings#about)
[داشبورد](/fa/community/dashboard)

</div>
