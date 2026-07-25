#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  HMPanel — Emergency heal (bring panel back after failed update/restore)
#  Usage:  curl -fsSL https://raw.githubusercontent.com/neoauroraproject/hmpanel/main/scripts/heal-panel.sh | bash
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/hmpanel}"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${GREEN}✔${NC}  $*"; }
warn() { echo -e "${YELLOW}⚠${NC}  $*"; }
info() { echo -e "${BLUE}ℹ${NC}  $*"; }
die()  { echo -e "${RED}✘${NC}  $*" >&2; exit 1; }

if [[ $EUID -ne 0 ]]; then
  die "Run as root."
fi
[[ -d "$INSTALL_DIR" ]] || die "HMPanel not found at $INSTALL_DIR"
cd "$INSTALL_DIR"

# Compose helper
if docker compose version &>/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose &>/dev/null; then
  COMPOSE=(docker-compose)
else
  die "Docker Compose not available"
fi
compose() { "${COMPOSE[@]}" "$@"; }

info "Healing HMPanel at $INSTALL_DIR ..."

# Ensure compose file exists
if [[ ! -f docker-compose.yml ]]; then
  info "Downloading docker-compose.yml..."
  curl -fsSL https://raw.githubusercontent.com/neoauroraproject/hmpanel/main/docker-compose.yml -o docker-compose.yml \
    || die "Failed to download docker-compose.yml"
fi

[[ -f .env ]] || die "Missing $INSTALL_DIR/.env"

set -a
# shellcheck disable=SC1091
source .env
set +a

info "Starting postgres + redis..."
compose up -d postgres redis
sleep 5

db_user="${POSTGRES_USER:-panel_user}"
db_pass="${POSTGRES_PASSWORD:-}"
if [[ -n "$db_pass" ]]; then
  info "Syncing PostgreSQL password to .env..."
  escaped_pass="${db_pass//\'/\'\'}"
  for i in 1 2 3 4 5; do
    if docker exec -u postgres hmpanel-postgres \
      psql -d postgres -v ON_ERROR_STOP=1 \
      -c "ALTER ROLE \"${db_user}\" WITH PASSWORD '${escaped_pass}';" >/dev/null 2>&1; then
      log "PostgreSQL password synced."
      break
    fi
    sleep 2
    [[ $i -eq 5 ]] && warn "Could not ALTER ROLE (volume may still be starting)."
  done
fi

info "Recreating redis (match REDIS_PASSWORD)..."
compose up -d --force-recreate --no-deps redis
sleep 3

info "Recreating panel-app (reload DATABASE_URL)..."
compose up -d --force-recreate --no-deps panel-app
sleep 5

info "Starting nginx + remaining services..."
compose up -d --remove-orphans

info "Waiting for backend health..."
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

if [[ "$ok" == "true" ]]; then
  log "Panel is healthy again."
  docker exec hmpanel-panel curl -sf http://127.0.0.1:4000/health || true
  echo ""
  log "Done. Open the panel in your browser."
else
  warn "Health check timed out. Check logs:"
  echo "  ${COMPOSE[*]} -f ${INSTALL_DIR}/docker-compose.yml logs --tail 80 panel-app"
  echo "  ${COMPOSE[*]} -f ${INSTALL_DIR}/docker-compose.yml logs --tail 40 postgres"
  echo "  ${COMPOSE[*]} -f ${INSTALL_DIR}/docker-compose.yml logs --tail 40 redis"
  exit 1
fi
