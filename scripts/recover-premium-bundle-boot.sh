#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  Recover panel when update health-check hangs (broken premium bundle).
#
#  Typical case: panel updated but premium volume still on 1.8.72 while
#  license D1 points at 1.8.73 — backend crash-loops or never becomes healthy.
#
#  Usage (on the server as root):
#    curl -fsSL https://raw.githubusercontent.com/neoauroraproject/hmpanel/main/scripts/recover-premium-bundle-boot.sh | bash
#
#  Or with a local tarball already downloaded:
#    BUNDLE_TAR=/tmp/premium-bundle-1.8.73.tar.gz bash scripts/recover-premium-bundle-boot.sh
#
#  Skip bundle install (schema + restart only):
#    SKIP_BUNDLE=1 bash scripts/recover-premium-bundle-boot.sh
#
#  Temporarily disable premium so Community boots, then update from UI:
#    DISABLE_PREMIUM=1 bash scripts/recover-premium-bundle-boot.sh
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/hmpanel}"
BUNDLE_VERSION="${BUNDLE_VERSION:-1.8.73}"
BUNDLE_TAR="${BUNDLE_TAR:-}"
SKIP_BUNDLE="${SKIP_BUNDLE:-0}"
DISABLE_PREMIUM="${DISABLE_PREMIUM:-0}"
GITHUB_BUNDLE_URL="${GITHUB_BUNDLE_URL:-https://github.com/neoauroraproject/hmpanel-premium/releases/download/v${BUNDLE_VERSION}/premium-bundle-${BUNDLE_VERSION}.tar.gz}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${GREEN}✔${NC}  $*"; }
warn() { echo -e "${YELLOW}⚠${NC}  $*"; }
info() { echo -e "${BLUE}ℹ${NC}  $*"; }
die()  { echo -e "${RED}✘${NC}  $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run as root."
[[ -d "$INSTALL_DIR" ]] || die "HMPanel not found at $INSTALL_DIR"
cd "$INSTALL_DIR"
[[ -f .env ]] || die "Missing $INSTALL_DIR/.env"

if docker compose version &>/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose &>/dev/null; then
  COMPOSE=(docker-compose)
else
  die "Docker Compose not available"
fi
compose() { "${COMPOSE[@]}" "$@"; }

set -a
# shellcheck disable=SC1091
source .env
set +a

db_user="${POSTGRES_USER:-panel_user}"
db_name="${POSTGRES_DB:-panel_db}"

info "Recovery at $INSTALL_DIR (target bundle ${BUNDLE_VERSION})"

info "Ensuring postgres is up..."
compose up -d postgres redis >/dev/null 2>&1 || true
sleep 4

info "Applying premium schema patches (name pools, grants, isTest)..."
docker exec hmpanel-postgres psql -U "$db_user" -d "$db_name" -v ON_ERROR_STOP=0 <<'SQL'
ALTER TABLE "StoreOrder" ADD COLUMN IF NOT EXISTS "isTest" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "ClientNamePool" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "prefix" TEXT NOT NULL,
  "separator" TEXT NOT NULL DEFAULT '-',
  "startNumber" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClientNamePool_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ClientNamePool_adminId_idx" ON "ClientNamePool"("adminId");

CREATE TABLE IF NOT EXISTS "StoreAddonGrant" (
  "id" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "granterAdminId" TEXT NOT NULL,
  "granteeAdminId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "trafficQuotaBytes" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoreAddonGrant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StoreAddonGrant_providerId_granteeAdminId_key"
  ON "StoreAddonGrant"("providerId", "granteeAdminId");
CREATE INDEX IF NOT EXISTS "StoreAddonGrant_granterAdminId_idx" ON "StoreAddonGrant"("granterAdminId");
CREATE INDEX IF NOT EXISTS "StoreAddonGrant_granteeAdminId_idx" ON "StoreAddonGrant"("granteeAdminId");

CREATE TABLE IF NOT EXISTS "StoreReferralReward" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "trigger" TEXT NOT NULL DEFAULT 'join',
  "minCount" INTEGER NOT NULL DEFAULT 3,
  "discountType" TEXT NOT NULL DEFAULT 'percent',
  "discountValue" DOUBLE PRECISION NOT NULL DEFAULT 10,
  "discountValueUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "discountValueToman" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "productIds" JSONB DEFAULT '[]',
  "categoryIds" JSONB DEFAULT '[]',
  "telegramMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoreReferralReward_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "StoreReferralReward_adminId_enabled_idx"
  ON "StoreReferralReward"("adminId", "enabled");

CREATE TABLE IF NOT EXISTS "StoreReferralRewardGrant" (
  "id" TEXT NOT NULL,
  "rewardId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "couponId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoreReferralRewardGrant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StoreReferralRewardGrant_rewardId_customerId_key"
  ON "StoreReferralRewardGrant"("rewardId", "customerId");
CREATE INDEX IF NOT EXISTS "StoreReferralRewardGrant_customerId_idx" ON "StoreReferralRewardGrant"("customerId");
SQL
log "Database schema patched."

if [[ "$DISABLE_PREMIUM" == "1" ]]; then
  info "Disabling premium bundle on volume (Community-only boot)..."
  docker run --rm -v hmpanel_premium:/p alpine sh -c '
    set -e
    ts=$(date +%Y%m%d%H%M%S)
    if [ -f /p/manifest.json ] || [ -f /p/backend/index.js ]; then
      mkdir -p "/p.disabled-${ts}"
      cp -a /p/. "/p.disabled-${ts}/" 2>/dev/null || true
      rm -rf /p/backend /p/frontend /p/manifest.json /p/prisma 2>/dev/null || true
    fi
  '
  log "Premium bundle moved aside inside volume."
elif [[ "$SKIP_BUNDLE" != "1" ]]; then
  tmp_tar="${BUNDLE_TAR:-/tmp/premium-bundle-${BUNDLE_VERSION}.tar.gz}"
  if [[ ! -f "$tmp_tar" ]]; then
    info "Downloading premium bundle ${BUNDLE_VERSION}..."
    if ! curl -fsSL "$GITHUB_BUNDLE_URL" -o "$tmp_tar"; then
      warn "GitHub download failed (private repo?). Set BUNDLE_TAR=/path/to/premium-bundle-${BUNDLE_VERSION}.tar.gz"
      warn "Or use DISABLE_PREMIUM=1 to boot without premium, then Update bundle in Settings."
      exit 1
    fi
  fi
  info "Installing bundle into premium volume..."
  docker run --rm -v hmpanel_premium:/p -v "$(dirname "$tmp_tar"):/bundle:ro" alpine sh -c "
    set -e
    rm -rf /p/*
    tar xzf /bundle/$(basename "$tmp_tar") -C /p
    test -f /p/manifest.json
    test -f /p/backend/index.js
  "
  log "Premium bundle ${BUNDLE_VERSION} installed."
fi

info "Recreating panel-app..."
compose up -d --force-recreate panel-app nginx >/dev/null 2>&1 || compose up -d --force-recreate panel-app
sleep 6

info "Waiting for backend /health..."
ok=false
for i in $(seq 1 36); do
  if docker exec hmpanel-panel curl -sf http://127.0.0.1:4000/health &>/dev/null; then
    ok=true
    break
  fi
  echo -ne "  attempt $i/36...\r"
  sleep 5
done
echo ""

if [[ "$ok" != "true" ]]; then
  warn "Health still failing. Last log lines:"
  docker logs hmpanel-panel --tail 60 2>&1 || true
  die "Recovery incomplete — send the logs above."
fi

log "Panel is healthy."
if docker exec hmpanel-panel test -f /opt/hmpanel/premium/manifest.json 2>/dev/null; then
  docker exec hmpanel-panel cat /opt/hmpanel/premium/manifest.json 2>/dev/null | head -c 200 || true
  echo ""
fi

if [[ "$DISABLE_PREMIUM" == "1" ]]; then
  warn "Premium is disabled. Open Settings → Update premium bundle, then restart panel-app."
else
  log "Hard-refresh browser (Ctrl+Shift+R). Client templates + name pools should work."
fi
