# Changelog

All notable changes to this project will be documented in this file.

## Workflow for Future Versions
1. After making significant changes, commit and push them to GitHub.
2. Increment the version number according to Semantic Versioning (e.g., from `1.0.0` to `1.0.1` for bug fixes, or `1.1.0` for new features).
3. Update this `CHANGELOG.md` file by adding a new section at the top for the new version.
4. Create a GitHub Release with the new version tag (e.g., `v1.0.1`). This triggers the CI/CD pipeline to build and publish the new Docker image to GHCR.

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
