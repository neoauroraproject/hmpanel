# Changelog

All notable changes to this project will be documented in this file.

## Workflow for Future Versions
1. After making significant changes, commit and push them to GitHub.
2. Increment the version number according to Semantic Versioning (e.g., from `1.0.0` to `1.0.1` for bug fixes, or `1.1.0` for new features).
3. Update this `CHANGELOG.md` file by adding a new section at the top for the new version.
4. Create a GitHub Release with the new version tag (e.g., `v1.0.1`). This triggers the CI/CD pipeline to build and publish the new Docker image to GHCR.

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
