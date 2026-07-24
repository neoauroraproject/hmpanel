# Changelog

All notable changes to this project will be documented in this file.

## Workflow for Future Versions
1. After making significant changes, commit and push them to GitHub.
2. Set the new version in the root `VERSION` file (single source of truth), then run `node scripts/sync-version.js` to sync all `package.json` files.
3. Update this `CHANGELOG.md` file by adding a new section at the top for the new version.
4. Create a GitHub Release with the new version tag (e.g., `v1.5.3`). This triggers the CI/CD pipeline to build and publish the new Docker image to GHCR.

## [1.8.6] - 2026-07-24

### Fixed
- **Backup analyze (critical):** `Failed to analyze backup` on upload — detect archive type by magic bytes (not only filename), sanitize upload names for shell safety, preserve real Nest error messages, and use `gzip -dc` + Node FS walk instead of fragile `zcat`/`find`.
- **Unified engine:** Community `BackupsService` is the single backup/restore engine (HMPanel archives + 3x-ui `getDb`/`getMigration`/`importDB`) for Settings and Premium Backup Center.
- **Restore UX:** Settings restore toast now shows the server error detail instead of a generic failure.

---

## [1.8.5] - 2026-07-24

### Fixed
- **Backup restore (critical):** Web restore now uses the uploaded archive id (not original filename), resolves host path correctly, and no longer fails health check / forced rollback after a successful restore.
- **Database restore:** `pg_dumpall` archives are restored into the `postgres` database (not `panel_db`) so DROP/CREATE DATABASE works.
- **Backup storage:** Bind-mount `./backups` so UI and `hm` CLI share the same files; update migrates legacy `hmpanel_backups` volume when needed.
- **Large uploads:** Analyze/upload uses disk storage (up to 2 GB) instead of loading the whole archive into RAM.

### Changed
- **Full backup includes premium:** `premium.tar.gz` (plugin bundle) is packed and restored with full backups, alongside DB license rows, uploads, config, and instance id.
- **Restore UX:** Clearer FA/EN messaging; longer wait before reload while the panel restarts.

---

## [1.8.4] - 2026-07-20

### Fixed
- **Connection QR modal:** Platform and Native subscription tabs now show different QR codes and URLs (was stuck on platform `/s/` link).
- **i18n:** Connection details modal, QR tabs, copy/download labels, and method badges translated (FA/EN).
- **Subscription origin:** Correct `https` public URL behind nginx via `X-Forwarded-Proto` for `/s/` links in output API.

---

## [1.8.3] - 2026-07-20

### Fixed
- **Startup crash on 1.8.2:** Circular module dependency (`PanelsModule` ↔ `ClientsModule` ↔ `StatsModule`) prevented NestJS from booting; health check timed out during `hm update`. Added `forwardRef()` on affected module imports.

---

## [1.8.2] - 2026-07-20

### Fixed
- **Traffic refund & accounting:** Verify panel `totalGB`/`enable` after updates before debiting balance; prevent sync from downgrading paid DB totals; auto-enable clients on traffic increase; fix refund policy for `TRAFFIC_LIMIT`/`EXPIRED` clients with remaining quota.
- **Deletion refunds:** Shared refund path for delete and sync orphan cleanup; cap refund to net charged; legacy clients with DEBIT but null `createdWithTrafficMode` now eligible; audit logs include `refundSkippedReason`.
- **Bulk traffic:** Charge owning admin (not caller); compensate panel when local DB fails after bulkAdjust; normalize `targetClientUuid` to Xray uuid in ledger.
- **Concurrency:** Distributed lock on client update to prevent double-debit on parallel edits.

---

## [1.8.1] - 2026-07-19

### Fixed
- **Clients page crash:** Moved `useMemo` above loading early-return (Rules of Hooks) so the page loads again.
- **Premium mobile/sidebar menu labels:** Translate premium module titles via `nav.*` instead of English API names.

### Changed
- **Dashboard:** Full FA/EN i18n for Super Admin and Reseller dashboards.
- **Settings:** Tabbed layout (General, License, SSL, Backup, About).

---

## [1.5.6] - 2026-07-08

### Fixed
- **Light mode hover states:** Corrected Tailwind classes where `dark:bg-*` was used without `dark:hover:*`, causing unreadable white/light hovers in modals, admin forms, clients, panels, and dashboard.

---

## [1.5.5] - 2026-07-08

### Fixed
- **Unlimited Traffic Dashboard:** Reseller dashboard and clients page now show ∞ / Unlimited instead of 0 B when `unlimitedTraffic` is enabled.
- **Grace Period:** Unlimited traffic admins are excluded from balance exhaustion grace period; existing grace flags are cleared on migration.
- **Bulk Assign Inbounds:** Inbound names now fall back to tag when remark is empty.

---

## [1.5.4] - 2026-07-08

### Fixed
- **CI / Docker build:** Fixed TypeScript error in admin edit modal (`admin` possibly undefined) that blocked the Publish Docker Image workflow for v1.5.2 and v1.5.3.

---

## [1.5.3] - 2026-07-08

### Fixed
- **Version Display:** Settings and diagnostics now read the app version from a single `VERSION` file at runtime (`APP_VERSION` env / `/app/VERSION`) instead of fragile relative `package.json` paths. Fixes stale version showing after updates.

### Changed
- **Release Workflow:** `VERSION` is the single source of truth; `node scripts/sync-version.js` syncs all `package.json` files. `update.sh` success message and CLI status read the running container version dynamically.

---

## [1.5.2] - 2026-07-08

### Added
- **Unlimited Traffic Admins:** New `unlimitedTraffic` flag for resellers. When enabled, traffic limits and refunds are disabled, traffic UI is hidden, and only unlimited-traffic clients can be created.
- **Admin Traffic Adjustment:** Edit Admin now supports both setting absolute available traffic and relative +/- GB adjustments.
- **Panel API Version Routing:** Bulk client APIs (`bulkCreate`, `bulkAdjust`, `bulkEnable`, `bulkDisable`) are selected by detected panel version (`>= 3.4.2`) with legacy sequential fallback for older panels.

### Fixed
- **Edit Admin Mobile Layout:** Form fields appear before the stats sidebar on mobile — no more scrolling past stats to reach inputs.
- **Admin Traffic Display:** Sidebar and info box now correctly show available traffic (`balance`), total allocated (`totalAssigned`), and days remaining instead of a misleading calendar date.

### Changed
- **Database Migration:** `update.sh` / `install.sh` apply the `Admin.unlimitedTraffic` schema via `prisma db push` and run the `v1.5.2-admin-unlimited-traffic` system migration on upgrade.

---

## [1.5.1] - 2026-07-07

### Fixed
- **3x-ui 3.4.2 Client Edit:** Fixed client update failures caused by `allowedIPs` type mismatch between GET (`ClientRecord`, string) and UPDATE (`Client`, array). Payload is now normalized before posting to the panel API. Backward compatible with 3.3.1 panels.
- **Deletion Traffic Refund:** Manually disabled clients now correctly refund unused allocation to resellers on delete. System-enforced disables (`TRAFFIC_LIMIT`, `EXPIRED`, `BALANCE_EXHAUSTED`) no longer refund. Legacy clients without `balanceDeducted` are covered via debit transaction lookup.

---

## [1.4.0] - 2026-06-30

### Added
- **Bulk Operations 3.4.2 API Support:** HMPanel now automatically detects and utilizes the new optimized bulk endpoints (`/bulkEnable`, `/bulkDisable`, `/export`) when connected to 3.4.2 panels, significantly improving performance for operations on hundreds of clients at once. Operations seamlessly fall back to sequential execution for 3.3.1 panels.
- **Export Subscription Links:** Added a new "Export Subs" bulk action that generates a downloadable `.txt` file containing email addresses and subscription URLs for all selected clients.

---

## [1.0.4] - 2026-06-12

### Added
- **Auto-Sync on Boot:** The backend now automatically synchronizes all connected 3x-ui panels in the background upon startup to prevent offline panel false positives.
- **System Resources Monitoring:** Added a live Host Node widget to the Super Admin dashboard displaying CPU, RAM, and Disk usage of the server hosting the panel.
- **Docker Auto-Cleanup:** The `update.sh` script now automatically runs `docker image prune` to delete dangling images and prevent disk space exhaustion across multiple updates.
- **Auto-Enable Clients:** Editing a disabled client and providing valid traffic/time limits will now automatically activate (enable) the client in the same action.

### Fixed
- **Sub Link Base URL:** Fixed a bug where subscription link fetching failed because the base URL was not prepended correctly in production.
- **Subscription Assets Proxy:** Migrated `/sub/assets` routing directly to the backend to prevent 404 errors with hashed files in production deployments.
- **Search Input Focus Loss:** Refactored the search box in the Clients list to preserve input focus while typing by implementing React Query data retention.
- **Postgres Healthcheck Crash:** Reverted the Postgres container healthcheck to use native Unix sockets, fixing an issue on low-spec VPS servers where TCP loopback failed.
- **Database Connection Optimization:** Increased Prisma connection timeout limits and optimized configuration for slower VPS environments.

---

## [1.0.1] - 2026-06-11

### Fixed
- **Installer Bug:** Fixed a critical bug in `install.sh` where database password synchronization failed because it targeted the incorrect container name (`postgres` instead of `hmpanel-postgres`). The installer now correctly detects and overrides the PostgreSQL password when a pre-existing volume is present.

---

## [1.0.0] - Community Edition

### Added
- **Multi-panel 3x-ui management:** Seamlessly connect and manage multiple 3x-ui instances from a central dashboard.
- **Admin and reseller system:** Comprehensive role-based access control with Super Admin and Reseller tiers.
- **Client management:** Advanced tooling for creating, updating, and managing user subscriptions.
- **Traffic management:** Flexible traffic allocation, monitoring, and reset capabilities.
- **Subscription support:** Automated tracking of expirations and subscription lifecycles.
- **QR code generation:** Instant QR code and subscription link generation for V2Ray clients.
- **Dashboard analytics:** Real-time metrics and system health overviews.
- **Migration tools:** Utilities to seamlessly migrate from legacy panels or standalone 3x-ui deployments.
- **Backup and restore:** Local database snapshot functionality for disaster recovery.
- **Docker deployment:** Production-ready containerized environment with Nginx and SSL.
- **Interactive installer:** Streamlined setup process with automated dependency resolution.
- **CLI manager:** Dedicated command-line interface for maintenance and administration.

### Changed
- Complete rebranding and architectural refactor to **HMPanel Community Edition**.
- Streamlined mobile-responsive UI for optimal administration on any device.
