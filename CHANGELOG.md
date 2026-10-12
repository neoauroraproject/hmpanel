# Changelog

All notable changes to this project will be documented in this file.

## Workflow for Future Versions
1. After making significant changes, commit and push them to GitHub.
2. Set the new version in the root `VERSION` file (single source of truth), then run `node scripts/sync-version.js` to sync all `package.json` files.
3. Update this `CHANGELOG.md` file by adding a new section at the top for the new version.
4. Create a GitHub Release with the new version tag (e.g., `v1.5.3`). This triggers the CI/CD pipeline to build and publish the new Docker image to GHCR.

## [2.5.6] - 2026-10-13

### Added
- **3x-ui node health in volume diagnostics:** each sync reads the panel's node list and flags nodes that are offline, report a last error, or run a different 3x-ui version than the master. These are named in the "volume reverted" warning and shown in the Panels → volume conflicts window. A node older than the master (or enrolled with an admin API token before 3x-ui 3.10) accepts master pushes without applying them, and its snapshot then sets volumes back to unlimited (MHSanaei/3x-ui#6786).

## [2.5.5] - 2026-10-13

### Fixed
- **About showed an old version (e.g. 2.5.0) after updating:** Settings → About now reads `/api/public/app-version` (image `VERSION` file) instead of the cached GitHub update check; runtime version prefers `/app/VERSION` over a stale `APP_VERSION` env.
- **Stale frontend after update (missing Panel Ports card):** Docker frontend build now bakes `APP_VERSION` / `NEXT_PUBLIC_APP_VERSION` and writes `public/VERSION.txt`; nginx serves HTML with `Cache-Control: no-store` so browsers pick up new `/_next/static` chunks; `hm update` force-recreates nginx; PWA reloads once when UI build ≠ runtime version.
- **Panel Ports card** remains on Settings → SSL/TLS (below the SSL manager).

## [2.5.4] - 2026-10-13

### Fixed
- **Volume restore no longer hammers 3x-ui every minute.** When 3x-ui sets a restored volume back to unlimited (3x-ui 3.10 merges a node's snapshot over the master, so a node that still carries 0 overwrites it), HMPanel tries twice, logs one clear warning naming the cause, then retries every 30 minutes.
- **Stale UI after updates:** the service worker no longer serves the cached page of the previous build when the network is slower than 3s; cached pages are used only when offline.
- Misleading `re-enabling` wording removed from the panel-side disable diagnostic.

## [2.5.3] - 2026-10-13

### Fixed
- **New clients became unlimited on 3x-ui (2.5.2):** the post-create check read the volume from the wrong place and sent `totalGB=0` right after every create. New and edited clients now keep exactly the volume that was set.
- **Volumes no longer change on their own.** Sync never writes HMPanel's volume over 3x-ui and never lowers HMPanel's volume from 3x-ui (2.5.2 pushed HMPanel's value over volumes changed in 3x-ui).
- **One-time repair of volumes broken by 2.5.1:** right after updating, clients of usage-billed admins that were created with a volume but show unlimited (0) in 3x-ui get HMPanel's volume back, once per panel (ends when none remain or after 24h). Volumes that were simply changed in 3x-ui are left alone, and a later 0 set in 3x-ui is respected.
- One-shot repair claims no longer log unique-constraint errors in Postgres on every boot.

### Added
- **Panels → volume conflicts button:** lists clients whose 3x-ui volume is lower than HMPanel's (unlimited shown in red) and, only for the clients you select and confirm, writes HMPanel's volume to 3x-ui. Nothing else on the client changes; each push is audit-logged.

## [2.5.2] - 2026-10-13

### Fixed
- **USAGE-mode clients became unlimited on 3x-ui (regression in 2.5.1):** creates, edits and the sync "repair" sent `totalGB=0` for clients of usage-billed admins, so nothing enforced each client's own volume. The client's volume is now always the 3x-ui cap; the USAGE pool only decides when a pool-suspended client may come back on.
- **Automatic recovery:** sync now restores the real cap on 3x-ui from the panel database for clients whose cap was zeroed (up to 200 per panel per cycle), and switches off clients that already used their volume (`TRAFFIC_LIMIT`).
- **Per-panel ALLOCATION panels treated as USAGE:** a panel quota set to ALLOCATION is no longer overridden by the account-level USAGE mode; removed the boot-time ALLOCATION→USAGE rewrite of `AdminPanelQuota` and the top-up re-stamping.

### Notes
- Panel quota rows already rewritten to USAGE by 2.5.1 cannot be told apart automatically. Review mixed PER_PANEL admins in **Admins** and set ALLOCATION panels back by hand.

## [2.5.1] - 2026-10-12

### Added
- **Panel HTTP/HTTPS ports:** Settings UI and API to change published ports; nginx/`PUBLIC_HTTPS_PORT` wiring; install/update/`cli.sh` support.
- **Store loyalty / referral schema:** Prisma + critical-schema foundation for loyalty discounts and referral reward `batchIndex` (runtime UI remains Premium).
- **3x-ui api390 reference:** `docs/api390.json` for panel API parity notes.

### Fixed
- **USAGE / 3x-ui sync:** stronger panel sync and usage-mode helpers so clients stay enabled and quotas heal correctly.
- **Subscription feed / browser navigation:** more reliable config sourcing and host/transport handling.
- **PWA / SSL settings:** install-shell and SSL manager polish for production installs.

### Notes
- Full Store loyalty checkout, admin-confirmed referral rewards, and Telegram broadcast dedupe ship in Premium bundle.

## [2.5.0] - 2026-09-27

### Added
- Installable PWA, storefront/portal overhaul, and mobile app chrome for all themes (version bump release).

## [2.4.0] - 2026-09-27

### Added
- **Installable app (PWA) for Android and iOS:** web manifest (`/api/public/manifest.webmanifest`), service worker with app-shell caching and an offline page, iOS home-screen metadata, safe-area aware shell.
- **Auto-update on relaunch:** the app compares panel + premium versions (`/api/public/app-version`) on launch and when resumed, clears cached assets and reloads once when a new version is deployed. Premium runtime assets are now versioned.
- **Installed-app bottom navigation:** minimal tab bar (shown only in the installed app on mobile); the top bar and hamburger menu stay.
- **Install prompt:** one-tap install on Android, guided Add to Home Screen sheet on iOS.
- **Agency brand everywhere:** the Premium reseller-menu logo and name (`/api/public/app-brand`) now brand the login page, sidebar, mobile header, tab title and the app icon.
- **Faster start:** small dashboard/license summaries are persisted for instant first paint; login form works with iOS Keychain / Android password managers.

## [2.3.3] - 2026-09-20

### Added
- **PAYG device tiers schema:** `PaygPlan.deviceTiers`, subscription `limitIp` / `unitPriceExtra`.
- **Digital product messages:** `digitalOrderMessage`, `digitalGuideMessage` columns.

### Notes
- Runtime PAYG bot/UI and Digital Goods admin ship in Premium bundle 2.3.2.

## [2.3.2] - 2026-09-20

### Fixed
- **Docker build:** exclude `premium-modules/store-payg` from `tsconfig.build.json` so Community image compile no longer pulls the incomplete store graph (regression from 2.3.0/2.3.1). Full PAYG runtime remains in Premium bundle.

## [2.3.1] - 2026-09-20

### Added
- **Store bot buy labels:** `botBuyVpnLabel` / `botBuyDigitalLabel` on StoreProfile (migration) for configurable Buy hub button text.
- **Digital delivery message:** schema field for per-product / profile digital delivery text.

### Changed
- **PAYG metering:** clearer insufficient-wallet error payload; low-balance / suspend customer notifications from meter tick.

### Notes
- Full Telegram buy-hub, wallet ledger aggregation, and PAYG top-up UX ship in Premium bundle 2.3.1.

## [2.3.0] - 2026-09-20

### Added
- **Store Digital Goods & PAYG nav:** platform manifests and sidebar entitlements for `store-digital` / `store-payg` (activated via Premium license modules).
- **PAYG schema foundation:** Prisma models and migration for Pay As You Go settings, categories, plans, subscriptions, and usage ledger; community `store-payg` metering stubs.

### Fixed
- **Customer service attach:** search and subscription-link resolve run before category selection so attach-by-link works reliably.

### Notes
- Full Digital Goods / PAYG UI and fulfillment ship in Premium bundle 2.3.0. Service renew updates volume/expiry only and leaves manual inbounds untouched.

## [2.2.24] - 2026-09-19

### Changed
- **Panel sync CPU/RAM:** global sync is non-overlapping; traffic sync ~every minute and full structural sync ~every 5 minutes. Unchanged clients/inbounds are skipped; client updates are batched.
- **Monitoring:** server-status poll/broadcast interval raised from 3s to 5s.
- **Admin client caps:** typing `0` in create/edit sets unlimited (empty still means no change).

### Fixed
- Failed panel client updates enter a 5-minute cooldown so suspension retries do not hammer the panel.
- **Store bot `/admin`:** only the Chat ID saved in store bot settings can open the admin menu.
- **Forced channel gate:** after joining, `/start` and «عضو شدم» re-check membership; View channel + I joined buttons.

## [2.2.23] - 2026-09-16

### Added
- **Store bot forced channel:** stores can require Telegram channel membership before the bot responds. Non-members get a localized join prompt; membership verdicts are cached and the store admin bypasses the gate.
- **Customer block / restrict:** new customer status with `PATCH /premium-modules/store/customers/:id/status`. Blocked customers are ignored by the bot and locked out of storefront/Mini-App login. Restricted customers keep browsing but receipts never auto-approve.

### Fixed
- Provisioning: the 3x-ui driver now sends the client `id` (uuid) on create.
- Client updates no longer send the numeric `ClientRecord.id` to panels that bind `id` as the uuid string.
- Registered the missing `test.created` store bot i18n key.

## [2.2.22] - 2026-09-14

### Added
- **3x-ui 3.8.0:** bundled `docs/api380.json` is used when the connected panel reports 3.8.x. Happ-link / Discord-test / HWID-status flags are detected from that spec.
- **Bulk allowed users:** on 3.8+ panels, selected clients can set HWID/device limit in one `bulkAdjust` call (not per-client). Hidden on older panels.
- **Portal themes:** existing subscription templates show allowed HWID count when the panel is 3.8+.

### Changed
- Live onlines/IPs prefer documented 3.7+ paths (`/clients/onlines`, `GET /server/clientIps`) with the old inbound routes as fallback.
- Panel sync stores 3x-ui `limitHwid` into local `limitIp` so allowed-user counts stay aligned.
- Capability resolver no longer assigns a newer OpenAPI spec to an older unmatched panel version.

## [2.2.21] - 2026-09-14

### Fixed
- **Agency buy/renew:** creating or topping up a reseller no longer fails with `AdminInbound_inboundId_fkey` when the plan still points at inbound UUIDs that panel sync deleted. Live inbounds are resolved (current id, `panelInboundId`, or the panel’s current inbound set) before insert.
- **Unlimited traffic placement:** GLOBAL toggle is on the shared volume card; PER_PANEL is per panel in Permissions.

## [2.2.20] - 2026-09-13

### Fixed
- **Docker / login prerender:** auth persist hydration no longer crashes Next.js `next build` (`hasHydrated` on undefined).
- **Per-panel limits:** unlimited traffic no longer deletes `AdminPanelQuota` rows; client/day/device caps stay per panel.
- **Grace period:** reseller remaining stock is read from panel quotas, not the unused account-wide `balance`.
- **Extra Super Admin:** session admin is synced after login so they get the Super Admin shell; install owner cannot be deleted.
- **Payment owner:** add-balance cards/wallets resolve to the install owner, not an extra Super Admin with empty payment settings.

## [2.2.14] - 2026-09-12

### Fixed
- **Client suspend/reactivate:** traffic-balance scheduler now enables and disables clients on each panel by email via `updateClientOnPanel`, instead of the deprecated UUID `updateClient` path that 404s and logs `Failed to suspend client`.

## [2.2.5] - 2026-09-08

### Fixed
- **Reseller admin grants:** creating or editing a reseller now persists per-panel traffic (e.g. 10 GB on Eylan) and assigned native resources (OpenVPN / instances / Pasarguard groups) so the dashboard and Add Client form match what Super Admin ticked.
- **Inbound assignment:** editing a reseller no longer wipes Eylan/Pasarguard inbounds when only 3x-ui inbound ids are sent.

### Changed
- **Reseller dashboard:** calmer, mobile-first KPI and destination cards; traffic used is shown on the available-traffic card.
- **Add Client:** small Select all / Select none control on the inbound list.

## [2.2.4] - 2026-09-07

### Fixed
- **Storefront UI:** JSX syntax error in `StoreShell` header that broke Next.js / Docker builds.

## [2.2.3] - 2026-09-07

### Added
- **Theme Studio:** storefront starter skins (Atelier / Noir), theme assign/create/import/clone/export, and branding-aware shop skins.

### Fixed
- **Storefront branding:** published theme CSS variables apply on the Community shop page.

## [2.2.2] - 2026-09-07

### Fixed
- **Store order badge:** cancelled / rejected / expired orders no longer keep the “needs review” notification; sticky `pendingReview` rows are cleared on cancel and via schema ensure.
- **Admin traffic mode:** allocation vs usage is configured per panel (not only account-wide).

### Changed
- **Admin nav:** denser shared sidebar / mobile nav composition.

## [2.2.0] - 2026-09-06

### Added
- **Platform architecture baseline:** adapter/capability catalog for 3x-ui, Eylan, and Pasarguard; permission, policy Reserve/Commit, and feature entitlement engines; Core domain nav with Premium remaining a separate menu block.
- **Theme + payment structure:** Theme/ThemeVersion/ThemeAsset tables with import/export, payment gateway registry (`manual_bank`, `wallet`, plus stubs), and Admin Hub slots for provider access.
- **Platform scaffolding:** SchemaMigrationAdapter, Telegram Core, Bot API v1 (`hmp_` keys), Domain Event Bus, Job Center, and unified monitoring hub.
- **Feature flags:** `adapter_xui_v1`, `permission_engine_v1`, and `policy_reserve_v1` default **off** so createClient/traffic stay on the current path until explicitly enabled. `nav_v2`, `theme_marketplace_v1`, and `payment_plugins_v1` default on.

## [2.1.1] - 2026-09-04

### Added
- **Extra Super Admins (Community):** the installation owner can create or promote Super Admins with full panel access and no traffic, client, expiry, or inbound limits. Only that owner can delete or demote them; the owner account cannot be deleted, disabled, or demoted.

## [2.0.0] - 2026-08-31

### Added
- **Native multi-panel:** first-class `Panel` identity (`panelKey`, connection health, capability matrix) so 3x-ui, Eylan, and Pasarguard can coexist. 3x-ui path is unchanged; Eylan/Pasarguard need Premium `external-panels`.
- **Capability-aware UI:** Clients, Panels, monitoring, and backup hide or freeze actions the remote API does not support instead of faking zeros.

### Fixed
- Inbound/client sync metadata for external panels (`remoteUsername`, `remoteResourceId`) and safer freeze when Premium is unavailable.
- Docker image build: native panel orchestrator no longer imports Premium-only incident constants.
- Panels page: choose 3x-ui / Eylan / Pasarguard on add and edit; Eylan/Pasarguard use Panel Plus connection fields. Dashboard no longer reports Xray-stopped for native panels.
- Panels page: Eylan/Pasarguard use Panel Plus connection fields; panel type can be selected on add/edit; dashboard no longer reports Xray stopped for native panels.

## [1.8.32] - 2026-08-29

### Added
- **External panels (Premium):** schema for `StoreAddonGrant` extensions (`maxClients`, `allowedScope`), `ExternalClientRegistry`, and `external-panels` module manifest (Eylan + Pasarguard).
- **Admin branding:** HM Panel logo and favicon on admin routes (`/login`, app shell); store/portal keep user branding.
- **3x-ui API 3.7.0:** OpenAPI docs resolution, capability flags, and Dockerfile `docs/` copy.

### Fixed
- **Admin session security:** JWT `tokenVersion` revocation on disable, password change, and expiry.
- **Panel URL consistency:** `apiBaseUrl` / `webBasePath` sync on panel update and boot backfill.
- **Storefront checkout:** coupon type matching and auto-apply at checkout; Docker build typecheck fixes.
- **Admin update:** BigInt `expiryTime` comparison in reseller update path.

## [1.8.31] - 2026-08-19

### Changed
- **Unified storefront checkout:** guest shop, customer portal, and TMA now share the same buy/renew steps — category → products → name + add-ons → payment with a clear payable total and selectable coupons.

### Added
- **Coupon order type:** `StoreCoupon.checkoutKind` (`both` / `new` / `renewal`) so discount codes can be limited to first purchase or renewals.

## [1.8.30] - 2026-08-17

### Fixed
- **Premium update 502 loop:** Settings no longer auto-calls Reload plugins when the bundle fails to boot. A failed premium bootstrap keeps the panel in Community fallback instead of `process.exit` looping `/api/health`.
- **Unsafe bundle install:** premium bundles that declare `minPanelVersion` are rejected until `hm update` brings the panel image high enough.

### Changed
- Reload plugins is a manual button only. After Update bundle the backend still restarts once to load the new files.

## [1.8.25] - 2026-08-07

### Fixed
- **Cleanup / bulk delete:** expired-client cleanup and bulk delete now call 3x-ui `POST /panel/api/clients/bulkDel` **once per panel** (emails grouped by `Client.panelId`) instead of one HTTP delete per user. Legacy panels without `bulkDel` still fall back to sequential deletes. Cleanup remains no-refund.

### Added
- **Clients panel selector:** a clear chip/tab bar above the clients list for All panels + each accessible panel (super-admin and reseller). Create / bulk-create modals require choosing a panel when more than one is available, then show only that panel’s inbounds.
- **Admin multi-panel access:** create/edit reseller can enable multiple panels and tick inbounds under each panel (stored via existing `AdminInbound`).

## [1.8.24] - 2026-08-07

### Fixed
- **Inbound NODE attribution:** sync now resolves node names by both `nodeId` and node `guid`, correctly attributes transitive sub-nodes (projected with id 0), preserves the last known node name when `/panel/api/nodes/list` fails, and clears node fields when the panel reports zero registered nodes — so local master inbounds stay badge-free and remote nodes show real names (Turkey/Dubai/…) instead of a generic NODE label.

## [1.8.23] - 2026-08-07

### Fixed
- **Every inbound showed a blue "NODE" badge:** the badge now checks `nodeId > 0` only — local master-panel inbounds no longer show a badge, and remote node inbounds show the resolved node name (synced from `/panel/api/nodes/list`) instead of a generic label. `Inbound.nodeId` / `nodeName` / `originNodeGuid` are now persisted from the 3x-ui sync so the frontend can tell local and node-hosted inbounds apart.
- **Storefront categories appeared before "New Order":** the customer portal login page and the store landing page (before the customer even clicks سفارش جدید) both rendered a full category grid. Categories now only appear inside the actual order/renew flow, once the customer has started a new order.

## [1.8.19] - 2026-07-26

### Added
- **Subscription portals:** copy actions now offer both **Panel link** (`/s/…`) and **Native link** (`/sub/…`) across themes and the connection modal.
- **Store schema:** `StoreProfile.subscriptionLinkMode` (`hmpanel` | `native`) for per-store subscription URL delivery (used by Premium store).
- **Backup retention:** after each backup and after a successful update, keep only the newest archives (`HMPANEL_BACKUP_KEEP`, default 5) to avoid filling the disk.

### Fixed
- **Telegram support links:** bare `t.me/…` or `@username` no longer become relative `/p/T.me/…` URLs; branding/portal settings accept `@username` and normalize to `https://t.me/…`.
- **Reseller dashboard (RTL):** attention card icons no longer sit under the large numbers in Persian layout.

## [1.8.18] - 2026-07-25

### Fixed
- **Panel went offline during SSL issuance / domain change:** the workflow stopped Nginx before contacting the CA, so the panel (and the progress stream) died for the whole ACME run. Certificates are now obtained over the webroot Nginx already serves at `/.well-known/acme-challenge/`, and Nginx is only stopped as a last resort if webroot fails.
- **Domain change did not survive a restart:** `.env` was updated but the Nginx container keeps `PANEL_DOMAIN` from when it was created, and its entrypoint regenerates `nginx.conf` on every start — so any restart or reboot silently rebuilt the config with the previous domain. The container is now recreated instead of reloaded.
- **UI reported success while the panel was unreachable:** the post-issue verification in `ssl_transactional` was dead code because `ssl_issue` exited first. Issue, change-domain, enable, self-signed and repair now wait for `/api/health` on the target domain and automatically revert to HTTP if Nginx will not serve the certificate, so the panel is never left dark.
- **"Disable HTTPS" came back by itself** after any Nginx restart, because the config is generated from cert presence alone. A `.ssl_disabled` marker now persists the choice, and certificates are kept on disk instead of deleted (re-enabling no longer needs a new CA order and cannot hit rate limits).
- **`PORT_BUSY` on servers without `lsof`:** our own Nginx holding port 80 is what the webroot challenge needs, so it is no longer treated as a conflict.
- **`server_name localhost` after Enable HTTPS:** `hm ssl enable` never sourced `.env`, so the config was regenerated with an empty domain. The domain is now always resolved from `.env`.
- **Renewals for certificates first issued standalone** failed because Nginx owns port 80; renew now retries over the webroot.
- **Self-signed selected in the Change Domain wizard** silently ran ACME instead; it now adopts the new domain through the self-signed path.
- Failures return a human-readable `reason` (DNS not resolving, port 80 unreachable, invalid domain), and invalid domains are rejected before any change is made.

### Added
- `hm ssl` menu option **8) Change Panel Domain** — moves the domain from the terminal when the UI is unreachable.

---

## [1.8.17] - 2026-07-25

### Fixed
- **Restore never replaced the database (root cause):** `POSTGRES_USER` (`panel_user`) is the cluster **bootstrap superuser**, so `DROP ROLE panel_user` inside a `pg_dumpall --clean` archive can never succeed — not even as another superuser (`cannot drop role panel_user because it is required by the database system`). Every restore therefore aborted right after `DROP DATABASE`, leaving the panel with no `panel_db` and, after rollback, the old data.
- **New restore engine:** the dump's cluster-level statements are no longer executed. HMPanel now extracts only the `panel_db` payload, drops the database with `WITH (FORCE)`, recreates it owned by `POSTGRES_USER`, and loads the payload in a single transaction. Roles and passwords stay owned by `.env`.
- **`--clean` object drops:** `DROP TABLE` / `ALTER TABLE … DROP CONSTRAINT` lines are stripped, since the target database is created empty. `COPY … FROM stdin` blocks are passed through byte-for-byte so row data is never filtered.
- **Foreign roles in `GRANT`:** any non-bootstrap role named in the archive is recreated (login-less) before loading so grants resolve instead of aborting the restore.
- **Legacy `.sql` / `.sql.gz` restores** now go through the same engine, giving them true replace semantics instead of loading on top of existing rows.
- Removed the temporary-superuser workaround (`_hmpanel_restore_su`) — it could not work by design.

---

## [1.8.16] - 2026-07-25

### Fixed
- **Restore `current user cannot be dropped`:** `pg_dumpall -c` includes `DROP ROLE panel_user` while restore connected as `panel_user`. Restore now applies the dump via a temporary superuser (`_hmpanel_restore_su`), then drops it.
- **`panel_db` missing after failed restore:** If DROP DATABASE ran before DROP ROLE failed, heal/restore recreate an empty `panel_db` so the stack can recover and retry.
- **`BLUE: unbound variable`:** Added missing `BLUE` color in CLI.

---

## [1.8.15] - 2026-07-25

### Fixed
- **`hm restore` silent no-op:** CLI restore used `silent=true` and printed nothing on failure (looked like it did nothing). Human `hm restore` is now always verbose; errors always go to stderr.
- **Premium license missing after restore:** Premium/uploads are restored via Docker named volumes directly (no dependency on a healthy panel-app). Instance id is written to the host backups dir.
- **`scripts/restore-backup.sh`:** One-shot verbose restore that refreshes CLI then runs restore with full logs.

---

## [1.8.14] - 2026-07-25

### Fixed
- **Restore `role "postgres" does not exist`:** HMPanel uses `POSTGRES_USER=panel_user` (no DB role named `postgres`). Restore/heal/update now always connect with `-U panel_user` instead of assuming a `postgres` superuser role.

---

## [1.8.13] - 2026-07-25

### Fixed
- **Restore kept old data (critical):** While `panel-app` stayed connected, `pg_dumpall --clean` could not `DROP DATABASE panel_db`. Restore continued and applied **config only** (SSL domain changed) while admins/panels/clients stayed on the old DB. Restore now stops `panel-app`, terminates DB sessions, restores as postgres superuser with `ON_ERROR_STOP`, verifies Admin/Panel/Client counts, and refuses config-only success when a DB dump was present.
- **Headless `hm restore --json`:** Now returns real success/failure JSON and correct exit codes (previously always `exit 0`).
- **Heal:** Refreshes host `hm` CLI from GitHub so restore fixes apply without waiting for a Docker image rebuild.

---

## [1.8.12] - 2026-07-25

### Fixed
- **Update rollback crash:** On migration failure, `update.sh` ran `compose down` then `hm restore`, which failed with `No such container: hmpanel-postgres`. Rollback now keeps/starts postgres+redis first, then restores.
- **Update Redis unhealthy:** Before migrations, recreate Redis so `requirepass` matches `.env` (avoids `dependency redis failed to start` after restore).
- **Emergency heal:** `scripts/heal-panel.sh` and `hm heal` bring the stack back (sync DB password, recreate redis/panel/nginx) without a full update.

---

## [1.8.11] - 2026-07-25

### Fixed
- **Empty panel after restore (critical):** If health check failed after a successful DB restore, auto-rollback re-applied the *pre-restore* snapshot and wiped restored admins/clients/panels. Restore now keeps the restored database, verifies Admin row counts, uses `psql -v ON_ERROR_STOP=1`, and only rolls back when the database was never applied.

---

## [1.8.10] - 2026-07-25

### Fixed
- **502 after restore:** Credential sync recreated `panel-app` before Redis, so Nest could crash-loop while nginx stayed up (`502 Bad Gateway`). Now recreates Redis → panel-app → nginx, waits longer for health, and retries sync once if health is slow.

---

## [1.8.9] - 2026-07-25

### Fixed
- **Backup restore (critical):** After restore, Postgres role password from `pg_dumpall` and panel `DATABASE_URL` (frozen at container create) could diverge from `.env` → `password authentication failed for user "panel_user"` and `ERR_CONNECTION_REFUSED`. Restore now syncs `ALTER ROLE` to final `.env` and `compose up --force-recreate panel-app` (restart alone is not enough). `hm update` / `update.sh` also heals this drift before migrations.
- **In-panel update false success:** UI treated image-prune lines (`Total reclaimed space`) as success even when `/health` never came up. Completion now requires healthy backend; health timeout rolls back to previous image.
- **In-panel updater:** Runs `update.sh` on the host via `nsenter` so Docker Compose / `hm` are available (previously ran inside `docker:latest` without Compose).
- **Super Admin traffic:** Store approve / renew / client edits no longer fail with `Insufficient traffic balance` for Super Admin; clients overview shows unlimited.

---

## [1.8.8] - 2026-07-25

### Fixed
- **Backup analyze 413:** Nginx `client_max_body_size` raised from 50M to 2048M (matches backend upload limit) so full backups can be uploaded for restore analysis; longer proxy timeouts for large uploads.
- **Default sub portal:** Persian UI + FA/EN language toggle; default language Persian.
- **Subscription import:** Stop treating Mozilla-like VPN client User-Agents as browsers (HTML redirect broke some v2ray apps while v2box worked); copy/QR links use `?raw=1`; safer Clash YAML passthrough and `profile-title` headers.

---

## [1.8.7] - 2026-07-24

### Fixed
- **Premium bundle update:** `No active activation for this instance` when updating the bundle after panel recreate / restore — `updateBundle` now re-registers the instance with the license server and retries (same recovery as download path).

---

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
