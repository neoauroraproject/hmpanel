# HMray Panel — Version 1.0 (Community Edition)

Bilingual documentation: [English](#english) | [فارسی](#farsi)

---

<a name="english"></a>
# English Documentation

HMray Panel is a modern, fast, and secure monorepo-based web panel designed to manage proxy protocols and server configurations. The Community Edition provides essential core features for system administrators and developers.

## Features

- **Dashboard**: Real-time server status, monitoring, traffic usage, and metrics.
- **Admin Management**: Multiple admin levels with customizable permissions.
- **Client Management**: Create, edit, and monitor clients and their data usage limits.
- **Panel Control**: Start, stop, and configure proxy core protocols.
- **Traffic Monitoring**: Accurate real-time traffic collection and limits enforcement.
- **Subscriptions**: Clean subscription links and automatic configuration generation.
- **QR Codes**: Fast connection links via QR codes for client ease.
- **Migration & Backup**: Built-in import/export tools for migration and database backups.

## System Requirements

- **OS**: Ubuntu (20.04+ recommended), Debian (10+), CentOS/RHEL (8+).
- **Architecture**: `amd64` / `x86_64` or `arm64` / `aarch64`.
- **Hardware**: Minimum 1GB RAM and 5GB free disk space.
- **Network**: Direct public IP (A/AAAA records pointing to the server for Let's Encrypt SSL).

## Installation

You can install HMray Panel in one step using the interactive single-command installer:

```bash
curl -fsSL https://raw.githubusercontent.com/hmray/panel/main/install.sh | sudo bash
```

*(Alternatively, clone the repository and run `sudo bash install.sh` locally).*

### The Installer will:
1. Verify system requirements (RAM, OS, Arch).
2. Install Docker, Docker Compose, Certbot, and openssl (if missing).
3. Interactively ask for your domain, admin email/password, ports, and SSL preference.
4. Auto-generate strong security secrets for database and JWT token.
5. Create a secure local `.env` configuration file.
6. Obtain a Let's Encrypt SSL certificate (or fall back to self-signed/HTTP if domain is unresolvable).
7. Build the multi-stage optimized monorepo Docker image.
8. Start the Postgres, Redis, Nginx, and Panel App containers.
9. Configure auto-start on boot via a systemd service.

---

## Update

To update your installation to the latest version, run the updater script:

```bash
sudo bash /opt/hmray-panel/update.sh
```

This will pull the latest code from GitHub, rebuild the Docker images, run any database schema migrations, restart the services, and verify health.

---

## Backup & Restore

### Database Backup
To back up your entire database configuration:

```bash
docker exec -t hmray-postgres pg_dumpall -c -U panel_user > backup.sql
```

### Database Restore
To restore a previously backed up database file:

```bash
cat backup.sql | docker exec -i hmray-postgres psql -U panel_user -d panel_db
```

### File Uploads & Backups
System upload folders and backups are mounted on named Docker volumes. They are stored on the host under:
- `/var/lib/docker/volumes/hmray_uploads`
- `/var/lib/docker/volumes/hmray_backups`

---

## Troubleshooting

### Check Service Status
```bash
docker compose -f /opt/hmray-panel/docker-compose.yml ps
```

### View Application Logs
```bash
docker compose -f /opt/hmray-panel/docker-compose.yml logs -f panel-app
```

### View Nginx Reverse Proxy Logs
```bash
docker compose -f /opt/hmray-panel/docker-compose.yml logs -f nginx
```

---

## Uninstallation

To uninstall HMray Panel and optionally remove all user data, database volumes, and certificates:

```bash
sudo bash /opt/hmray-panel/uninstall.sh
```

---

## License

This project is released under the MIT License.

---

# HMray Panel | [Official Website Placeholder](https://hmray.example.com) | [Official Channel Placeholder](https://t.me/hmray_example)

---

<a name="farsi"></a>
# راهنمای فارسی (Persian Documentation)

پنل HMray یک پنل تحت وب مدرن، سریع و امن بر پایه ساختار monorepo برای مدیریت پروتکل‌های پروکسی و پیکربندی سرورها است. نسخه Community (جامعه) قابلیت‌های اصلی و اساسی را برای مدیران سیستم و توسعه‌دهندگان فراهم می‌کند.

## قابلیت‌ها

- **داشبورد**: مشاهده وضعیت سرور، مانیتورینگ منابع، میزان مصرف ترافیک و آمارهای زنده.
- **مدیریت مدیران (Admins)**: سطوح چندگانه ادمین با دسترسی‌های قابل تنظیم.
- **مدیریت کاربران (Clients)**: ایجاد، ویرایش و مانیتورینگ کاربران همراه با اعمال محدودیت حجم مصرفی.
- **کنترل پنل**: راه اندازی، توقف و پیکربندی هسته اصلی پروتکل‌ها.
- **مانیتورینگ ترافیک**: محاسبه دقیق ترافیک به صورت زنده و اعمال محدودیت‌ها.
- **لینک‌های سابسکریپشن**: ساخت لینک‌های اشتراک مرتب و تولید خودکار کانفیگ‌ها.
- **کدهای QR**: تولید سریع کد QR برای اتصال آسان کاربران.
- **انتقال و بک‌آپ**: ابزارهای پیش‌فرض ایمپورت/اکسپورت برای انتقال اطلاعات و بک‌آپ دیتابیس.

## پیش‌نیازهای سیستم

- **سیستم عامل**: اوبونتو (ترجیحاً نسخه 20.04 به بالا)، دبیان (10 به بالا)، CentOS/RHEL (نسخه 8 به بالا).
- **معماری**: `amd64` / `x86_64` یا `arm64` / `aarch64`.
- **سخت‌افزار**: حداقل ۱ گیگابایت رم و ۵ گیگابایت فضای خالی دیسک.
- **شبکه**: آی‌پی عمومی متصل (رکورد A/AAAA متصل به سرور جهت دریافت SSL از Let's Encrypt).

## نصب و راه‌اندازی

شما می‌توانید پنل HMray را با اجرای یک دستور ساده و به صورت تعاملی نصب کنید:

```bash
curl -fsSL https://raw.githubusercontent.com/hmray/panel/main/install.sh | sudo bash
```

*(یا به عنوان جایگزین، مخزن را کلون کرده و فایل `sudo bash install.sh` را به صورت محلی اجرا کنید).*

### مراحل اجرای نصب‌کننده:
۱. بررسی پیش‌نیازهای سیستم (رم، سیستم‌عامل، معماری).
۲. نصب خودکار Docker، Docker Compose، Certbot و openssl (در صورت عدم وجود).
۳. دریافت تعاملی اطلاعاتی نظیر دامنه، ایمیل و رمز ادمین، پورت‌ها و ترجیحات SSL.
۴. تولید کلیدها و پسوردهای تصادفی و امن برای دیتابیس و JWT.
۵. ایجاد فایل پیکربندی محلی و امن `.env`.
۶. دریافت گواهینامه SSL Let's Encrypt (یا سلف‌سایند/HTTP در صورت عدم اتصال دامنه).
۷. ساخت ایمیج چندمرحله‌ای و بهینه‌شده Docker برای پنل.
۸. اجرای کانتینرهای Postgres، Redis، Nginx و Panel App.
۹. پیکربندی اجرای خودکار پنل هنگام روشن شدن سرور از طریق سرویس systemd.

---

## بروزرسانی

جهت آپدیت پنل به آخرین نسخه منتشر شده، اسکریپت بروزرسانی را اجرا کنید:

```bash
sudo bash /opt/hmray-panel/update.sh
```

این اسکریپت کدهای جدید را از گیت‌هاب دریافت کرده، کانتینرها را بازسازی می‌کند، مایگریشن‌های دیتابیس را اعمال کرده و پس از راه‌اندازی مجدد، سلامت سرویس را تایید می‌کند.

---

## پشتیبان‌گیری و بازگردانی (Backup & Restore)

### پشتیبان‌گیری از دیتابیس
جهت گرفتن خروجی و پشتیبان‌گیری کامل از دیتابیس:

```bash
docker exec -t hmray-postgres pg_dumpall -c -U panel_user > backup.sql
```

### بازگردانی دیتابیس
جهت ایمپورت و بازگرداندن فایل پشتیبان به دیتابیس:

```bash
cat backup.sql | docker exec -i hmray-postgres psql -U panel_user -d panel_db
```

### فایل‌ها و آپلودها
پوشه فایل‌های آپلود شده و بک‌آپ‌ها روی دایرکتوری‌های Docker Volume ذخیره می‌شوند. این دایرکتوری‌ها در آدرس‌های زیر در سرور میزبان قرار دارند:
- `/var/lib/docker/volumes/hmray_uploads`
- `/var/lib/docker/volumes/hmray_backups`

---

## عیب‌یابی و بررسی وضعیت (Troubleshooting)

### بررسی وضعیت کانتینرها
```bash
docker compose -f /opt/hmray-panel/docker-compose.yml ps
```

### مشاهده لاگ‌های برنامه
```bash
docker compose -f /opt/hmray-panel/docker-compose.yml logs -f panel-app
```

### مشاهده لاگ‌های وب‌سرور Nginx
```bash
docker compose -f /opt/hmray-panel/docker-compose.yml logs -f nginx
```

---

## حذف پنل (Uninstall)

جهت پاکسازی کامل پنل و (در صورت تمایل) حذف تمامی داده‌ها، ولوم‌های دیتابیس و گواهینامه‌ها دستور زیر را وارد کنید:

```bash
sudo bash /opt/hmray-panel/uninstall.sh
```

---

## لایسنس

این پروژه تحت لایسنس MIT منتشر شده است.

---

# HMray Panel | [وبسایت رسمی پنل (فرضی)](https://hmray.example.com) | [کانال رسمی تلگرام (فرضی)](https://t.me/hmray_example)
