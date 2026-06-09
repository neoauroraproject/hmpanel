<div align="center">

# HMPanel
**Advanced 3x-ui Management Platform**

Multi-Panel • Resellers • Traffic Accounting • Bulk Operations • Subscription Management

[Installation](#installation) • [Features](#features) • [Screenshots](#screenshots) • [Architecture](#architecture)

</div>

---

HMPanel is not a generic web panel—it is a **professional management layer built specifically on top of native 3x-ui**. 
Designed from the ground up for VPN Providers, Resellers, and Administrators managing large client bases across multi-panel deployments.

---

## ⚡ Features

- **Multi-Panel Management:** Control multiple distributed 3x-ui nodes from a single centralized dashboard.
- **Reseller Management:** Multi-tier permission models (Super Admin vs Reseller) with traffic limits and client capacities.
- **Traffic Accounting:** Highly accurate real-time traffic collection, grace periods, and automatic depletion enforcement.
- **Native 3x-ui Groups Integration:** Map clients cleanly into native 3x-ui Groups without disrupting existing inbounds.
- **Subscription Management:** Clean, universal subscription links with automated configuration generation.
- **Multi-Inbound Clients:** Effortlessly assign a single client to multiple independent inbounds simultaneously.
- **Bulk Operations:** Execute bulk additions, deletions, and modifications efficiently.
- **Migration Engine:** Built-in seamless migration from legacy panels (e.g., WhalePanel), preserving all user configurations.
- **Database Backup & Restore:** Native tools to snapshot and restore your PostgreSQL data safely.
- **Custom Branding Portal:** Full white-labeling capabilities (Community Edition includes core branding features).

---

## 📊 Feature Comparison

| Feature | HMPanel (Community Edition) | Native 3x-ui |
| :--- | :---: | :---: |
| **Multi-Panel Management** | ✓ | ✗ |
| **Reseller Management** | ✓ | ✗ |
| **Traffic Accounting & Enforcement** | ✓ | ✗ |
| **Bulk Operations** | ✓ | Limited |
| **Migration Tools** | ✓ | ✗ |
| **Centralized Subscription Links** | ✓ | ✗ |

---

## 📸 Screenshots

### Super Admin Dashboard
![Dashboard](docs/images/dashboard.png)

### Client Management
![Clients](docs/images/clients.png)

### Admin & Reseller Control
![Admins](docs/images/admins.png)

---

## 🚀 Installation

HMPanel provides an interactive, one-line installation script that automatically provisions Docker, configures your database, generates secure JWT secrets, and issues a Let's Encrypt SSL certificate.

### One-Line Install Command
Execute the following on any fresh Ubuntu (20.04+) or Debian server:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/neoauroraproject/hmpanel/main/install.sh)
```

### System Requirements
- **OS**: Ubuntu (20.04+ recommended), Debian (10+).
- **Architecture**: `amd64` / `x86_64` or `arm64` / `aarch64`.
- **Hardware**: Minimum 1GB RAM and 5GB free disk space.
- **Network**: Direct public IP (A/AAAA records pointing to the server for Let's Encrypt SSL).

### Quick Start
1. Ensure your domain's DNS A/AAAA records point to your server IP.
2. Run the One-Line Install Command above as `root`.
3. Follow the interactive prompts to define your admin credentials and ports.
4. Log into `https://<your-domain>` and start attaching your 3x-ui nodes!

---

## 🔄 Management Commands

### Update
To update your installation to the latest version, run the updater script:
```bash
sudo bash /opt/hmray-panel/update.sh
```

### Uninstall
To uninstall HMPanel and optionally remove all user data, database volumes, and certificates:
```bash
sudo bash /opt/hmray-panel/uninstall.sh
```

---

## 💾 Backup & Restore

### Database Backup
To back up your entire database configuration safely:
```bash
docker exec -t hmray-postgres pg_dumpall -c -U panel_user > backup.sql
```

### Database Restore
To restore a previously backed up database file:
```bash
cat backup.sql | docker exec -i hmray-postgres psql -U panel_user -d panel_db
```

---

## 🏗️ Architecture

HMPanel is built using a modern, scalable, and secure technology stack:

- **Frontend**: Next.js (React) with TailwindCSS for a highly responsive, dynamic UI.
- **Backend**: NestJS (TypeScript) providing a robust, type-safe API architecture.
- **Database**: PostgreSQL for reliable, relational data storage and traffic accounting.
- **Cache / Events**: Redis for high-speed job queues and WebSocket synchronization.
- **Reverse Proxy**: Nginx handling SSL termination and request routing.
- **Deployment**: Multi-stage Docker & Docker Compose for isolated, reproducible environments.

---

## 📦 Migration Tools

HMPanel includes a built-in migration engine specifically designed to upgrade from legacy systems like WhalePanel smoothly:

1. **Admin Import:** Imports all legacy Admins and Resellers.
2. **Client Import:** Imports all Clients, transferring their UUIDs, expiry dates, and usage limits precisely.
3. **Native Groups Assignment:** Safely maps legacy clients into Native 3x-ui Groups seamlessly, allowing multi-inbound attachments without breaking active connections.

---

## 🌟 Community Edition

The **Community Edition** includes all core proxy management features necessary to run a highly scalable VPN operation. It provides unhindered access to multi-panel routing, traffic accounting, reseller tiers, and the migration engine. 

*Note: Premium enterprise modules (e.g., Domain Management, Store Billing, and Smart Alerts) are not included in the Community Edition.*

---

## 🛠️ Troubleshooting & FAQ

### Check Service Status
```bash
docker compose -f /opt/hmray-panel/docker-compose.yml ps
```

### View Application Logs
```bash
docker compose -f /opt/hmray-panel/docker-compose.yml logs -f panel-app
```

### FAQ
**Q: My Let's Encrypt SSL failed during installation?**
A: Ensure your domain's DNS is fully propagated and pointing directly to the server's IP address. Cloudflare Proxy (Orange Cloud) must be disabled during the initial installation.

**Q: Where are my files stored?**
A: System uploads and backups are mounted on named Docker volumes, typically found at `/var/lib/docker/volumes/hmray_uploads` and `/var/lib/docker/volumes/hmray_backups`.

---

## 🔗 Official Links & Support

- **Official GitHub**: [neoauroraproject/hmpanel](https://github.com/neoauroraproject/hmpanel)
- **Official Website**: [https://hmray.example.com](https://hmray.example.com)
- **Official Telegram Channel**: [@hmray_example](https://t.me/hmray_example)

---

<div align="center">
  <p>Released under the MIT License</p>
  <p><strong>HMPanel — Crafted with ♥ by HMray</strong></p>
</div>
