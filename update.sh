#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  HMPanel — Master Updater v1.3.0
#  https://github.com/neoauroraproject/hmpanel
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()     { echo -e "${GREEN}✔${NC}  $*"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $*"; }
error()   { echo -e "${RED}✘${NC}  $*" >&2; }
info()    { echo -e "${BLUE}ℹ${NC}  $*"; }
step()    { echo -e "\n${CYAN}${BOLD}──── $* ────${NC}"; }
die()     { error "$*"; exit 1; }

check_root() {
  if [[ $EUID -ne 0 ]]; then
    die "This updater must be run as root."
  fi
}

main() {
  echo -e "${CYAN}${BOLD}HMPanel Master Updater v1.3.0${NC}"
  check_root

  INSTALL_DIR="/opt/hmpanel"
  if [[ ! -d "$INSTALL_DIR" ]]; then
    die "HMPanel is not installed at ${INSTALL_DIR}. Is the panel installed?"
  fi
  
  cd "$INSTALL_DIR"
  
  REPO_URL="https://raw.githubusercontent.com/neoauroraproject/hmpanel/main"

  step "[1/8] Fetching Latest Infrastructure Files"
  info "Downloading latest docker-compose.yml..."
  curl -fsSL "${REPO_URL}/docker-compose.yml" -o docker-compose.yml || warn "Failed to download docker-compose.yml"

  info "Downloading latest cli.sh..."
  curl -fsSL "${REPO_URL}/cli.sh" -o cli.sh || warn "Failed to download cli.sh"

  info "Downloading latest update.sh..."
  curl -fsSL "${REPO_URL}/update.sh" -o update.sh || warn "Failed to download update.sh"

  info "Downloading latest uninstall.sh..."
  curl -fsSL "${REPO_URL}/uninstall.sh" -o uninstall.sh || warn "Failed to download uninstall.sh"

  info "Downloading latest nginx templates..."
  mkdir -p nginx
  curl -fsSL "${REPO_URL}/nginx/nginx.conf.http.template" -o nginx/nginx.conf.http.template || warn "Failed to download nginx.conf.http.template"
  curl -fsSL "${REPO_URL}/nginx/nginx.conf.ssl.template" -o nginx/nginx.conf.ssl.template || warn "Failed to download nginx.conf.ssl.template"

  log "Host infrastructure synced with main branch."

  step "[2/8] Updating CLI Manager"
  if [[ -f "${INSTALL_DIR}/cli.sh" ]]; then
    info "Installing updated hmpanel CLI..."
    cp "${INSTALL_DIR}/cli.sh" /usr/local/bin/hmpanel
    chmod +x /usr/local/bin/hmpanel
    ln -sf /usr/local/bin/hmpanel /usr/local/bin/hm
    log "CLI updated successfully."
  fi

  step "[3/8] Rollback Safety & Database Backup"
  if docker image inspect ghcr.io/neoauroraproject/hmpanel:latest &>/dev/null; then
    docker tag ghcr.io/neoauroraproject/hmpanel:latest ghcr.io/neoauroraproject/hmpanel:rollback
    log "Current image tagged as rollback."
  else
    warn "No existing latest image found to tag as rollback."
  fi

  mkdir -p "${INSTALL_DIR}/backups"
  
  if docker ps | grep -q "hmpanel-postgres"; then
    info "Creating pre-update full backup..."
    BACKUP_FILE=$(hm backup create full | grep -oP "/opt/hmpanel/backups/.*\.tar\.gz" | tail -n 1) || true
    if [[ -n "$BACKUP_FILE" && -f "$BACKUP_FILE" ]]; then
      log "Full backup created at $BACKUP_FILE"
    else
      error "Failed to create pre-update backup. The update process must never execute without first creating and verifying a backup."
      die "Update aborted."
    fi
  else
    warn "Postgres container is not running. Update will proceed without a new backup, but this is extremely risky."
  fi

  step "[4/8] Pulling Latest Docker Images"
  info "Downloading prebuilt images..."
  
  local max_pull=5
  local pull_attempt=1
  local pull_success=false
  while [[ $pull_attempt -le $max_pull ]]; do
    if docker compose pull; then
      pull_success=true
      break
    else
      warn "Docker pull failed (Attempt $pull_attempt/$max_pull). Retrying in 5 seconds..."
      sleep 5
      pull_attempt=$((pull_attempt + 1))
    fi
  done

  if [[ "$pull_success" == false ]]; then
    die "Failed to pull Docker images after $max_pull attempts."
  fi

  step "[5/8] Checking Permissions"
  if [ -f "${INSTALL_DIR}/.env" ]; then
    chown 1001:1001 "${INSTALL_DIR}/.env"
    chmod 600 "${INSTALL_DIR}/.env"
  fi

  SSL_DIR="${INSTALL_DIR}/nginx/ssl"
  mkdir -p "${SSL_DIR}"

  step "[6/8] Executing Database Migrations"
  info "Starting database to apply migrations..."
  docker compose up -d postgres
  
  info "Waiting for database to be ready..."
  sleep 5 # Ensure postgres is up

  info "Applying pre-migration schema fixes for existing clients..."
  docker exec hmpanel-postgres psql -U panel_user -d panel_db -c "
DO \$\$
DECLARE
  default_panel_id TEXT;
  default_server_id TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Client' AND column_name = 'panelId') THEN
    SELECT id INTO default_panel_id FROM \"Panel\" LIMIT 1;
    IF default_panel_id IS NULL THEN
      default_server_id := gen_random_uuid()::text;
      INSERT INTO \"Server\" (id, name, \"ipAddress\") VALUES (default_server_id, 'Local', '127.0.0.1');
      default_panel_id := gen_random_uuid()::text;
      INSERT INTO \"Panel\" (id, \"serverId\", name, url) VALUES (default_panel_id, default_server_id, 'Default Panel', 'http://127.0.0.1:2053');
    END IF;
    ALTER TABLE \"Client\" ADD COLUMN \"panelId\" TEXT;
    UPDATE \"Client\" SET \"panelId\" = default_panel_id;
  END IF;
END \$\$;
" || warn "Pre-migration SQL failed, but continuing..."

  info "Running Prisma Schema Update & System Migrations..."
  if ! docker compose run --rm panel-app /bin/sh -c "npx prisma db push --accept-data-loss && node backend/dist/scripts/run-migrations.js"; then
    error "MIGRATION FAILED! Executing emergency rollback..."
    
    info "Stopping containers..."
    docker compose down
    
    if [[ -n "${BACKUP_FILE:-}" && -f "$BACKUP_FILE" ]]; then
      info "Restoring state from pre-update backup..."
      hm restore "$BACKUP_FILE"
      log "Rollback completed."
    else
      warn "No backup file found to restore."
    fi
    
    info "Reverting Docker image to previous version..."
    if docker image inspect ghcr.io/neoauroraproject/hmpanel:rollback &>/dev/null; then
      docker tag ghcr.io/neoauroraproject/hmpanel:rollback ghcr.io/neoauroraproject/hmpanel:latest
    fi
    
    info "Restarting previous version..."
    docker compose up -d
    die "Update aborted due to migration failure. The system has been rolled back."
  fi
  
  log "Migrations completed successfully."

  step "[7/8] Deploying Containers"
  info "Recreating containers with latest mounts and images..."
  docker compose up -d --remove-orphans

  step "[8/8] Verifying Health & Cleaning Up"
  local max_attempts=30
  local attempt=0
  info "Waiting for services to become healthy..."
  while [[ $attempt -lt $max_attempts ]]; do
    if docker exec hmpanel-panel curl -sf "http://127.0.0.1:4000/health" &>/dev/null; then
      log "Backend API is healthy"
      break
    fi
    attempt=$((attempt + 1))
    echo -ne "  Attempt ${attempt}/${max_attempts}...\r"
    sleep 5
  done

  if [[ $attempt -eq $max_attempts ]]; then
    warn "Health check timeout. Check logs: docker compose logs panel-app"
  else
    echo ""
    log "HMPanel Panel successfully updated to version 1.4.4!"
  fi

  info "Cleaning up old images..."
  docker image prune -a -f || true
  docker builder prune -f || true
}

main "$@"
