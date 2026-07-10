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

read_app_version() {
  local dir="${1:-.}"
  if [[ -f "${dir}/VERSION" ]]; then
    tr -d '\r\n' < "${dir}/VERSION"
    return
  fi
  if [[ -f "${dir}/package.json" ]]; then
    sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "${dir}/package.json" | head -n 1
    return
  fi
  echo "unknown"
}

read_running_app_version() {
  if docker exec hmpanel-panel sh -c 'test -f /app/VERSION' &>/dev/null; then
    docker exec hmpanel-panel sh -c 'tr -d "\r\n" < /app/VERSION' 2>/dev/null && return
  fi
  if docker exec hmpanel-panel printenv APP_VERSION &>/dev/null; then
    local v
    v=$(docker exec hmpanel-panel printenv APP_VERSION 2>/dev/null | tr -d '\r')
    if [[ -n "$v" ]]; then echo "$v"; return; fi
  fi
  read_app_version "."
}

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
  
  cd "$INSTALL_DIR" || die "Failed to enter installation directory $INSTALL_DIR"
  
  REPO_URL="https://raw.githubusercontent.com/neoauroraproject/hmpanel/main"

  step "[1/8] Fetching Latest Infrastructure Files"
  info "Downloading latest docker-compose.yml..."
  curl -fsSL "${REPO_URL}/docker-compose.yml" -o docker-compose.yml || warn "Failed to download docker-compose.yml"

  info "Downloading latest cli.sh..."
  curl -fsSL "${REPO_URL}/cli.sh" -o cli.sh || warn "Failed to download cli.sh"

  info "Downloading latest update.sh..."
  curl -fsSL "${REPO_URL}/update.sh" -o update.sh || warn "Failed to download update.sh"

  info "Downloading VERSION manifest..."
  curl -fsSL "${REPO_URL}/VERSION" -o VERSION || warn "Failed to download VERSION"

  info "Downloading latest uninstall.sh..."
  curl -fsSL "${REPO_URL}/uninstall.sh" -o uninstall.sh || warn "Failed to download uninstall.sh"

  info "Downloading latest nginx templates..."
  mkdir -p nginx
  curl -fsSL "${REPO_URL}/nginx/nginx.conf.http.template" -o nginx/nginx.conf.http.template || warn "Failed to download nginx.conf.http.template"
  curl -fsSL "${REPO_URL}/nginx/nginx.conf.ssl.template" -o nginx/nginx.conf.ssl.template || warn "Failed to download nginx.conf.ssl.template"
  
  if [ -d "nginx/generate_config.sh" ]; then
    docker stop hmpanel-nginx >/dev/null 2>&1 || true
    docker rm -f hmpanel-nginx >/dev/null 2>&1 || true
    rm -rf "nginx/generate_config.sh"
  fi
  curl -fsSL "${REPO_URL}/nginx/generate_config.sh" -o nginx/generate_config.sh || warn "Failed to download generate_config.sh"
  chmod +x nginx/generate_config.sh 2>/dev/null || true

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
    BACKUP_FILE=$(hm backup create full | grep -E -o "/opt/hmpanel/backups/[a-zA-Z0-9_.-]+\.tar\.gz" | tail -n 1) || true
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

  # Migrate legacy certbot certificates if the volume exists and we don't have certs yet
  if [[ ! -f "${SSL_DIR}/fullchain.pem" ]]; then
    CERTBOT_VOLUME="hmpanel_certbot_certs"
    if docker volume inspect "$CERTBOT_VOLUME" &>/dev/null; then
      info "Found legacy certbot certificates. Migrating to new SSL directory..."
      docker run --rm -v "${CERTBOT_VOLUME}:/certs" -v "${SSL_DIR}:/dest" alpine sh -c '
        DOMAIN_DIR=$(find /certs/live -mindepth 1 -maxdepth 1 -type d | head -n 1)
        if [ -n "$DOMAIN_DIR" ]; then
          if [ -f "$DOMAIN_DIR/fullchain.pem" ] && [ -f "$DOMAIN_DIR/privkey.pem" ]; then
            cp -L "$DOMAIN_DIR/fullchain.pem" /dest/fullchain.pem
            cp -L "$DOMAIN_DIR/privkey.pem" /dest/privkey.pem
            echo "Successfully migrated certificates from legacy certbot volume."
          fi
        fi
      ' || warn "Failed to migrate legacy certificates."
    fi
  fi
  if [[ ! -f "${SSL_DIR}/fullchain.pem" || ! -f "${SSL_DIR}/privkey.pem" ]]; then
    info "Generating self-signed SSL certificates to prevent Nginx crash..."
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
      -keyout "${SSL_DIR}/privkey.pem" -out "${SSL_DIR}/fullchain.pem" \
      -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost" 2>/dev/null || true
    log "Self-signed SSL certificates generated."
  fi

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
  if ! docker compose run --rm panel-app /bin/sh -c "npx prisma db push && node backend/dist/scripts/run-migrations.js"; then
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

  # Clean up legacy nginx files to avoid mount conflicts
  if [ -e "${INSTALL_DIR}/nginx/nginx.conf.template" ]; then
    rm -rf "${INSTALL_DIR}/nginx/nginx.conf.template"
  fi

  # Forcefully remove old nginx container to prevent mount cache issues during upgrade
  if docker ps -a --format '{{.Names}}' | grep -Eq "^hmpanel-nginx$"; then
    info "Removing old Nginx container to ensure clean mount configuration..."
    docker rm -f hmpanel-nginx &>/dev/null || true
  fi

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
    
    # -------------------------------------------------------------
    # Post-Update Seamless SSL Auto-Repair & Renewal
    # -------------------------------------------------------------
    if [[ -f "${INSTALL_DIR}/.env" ]]; then
      source "${INSTALL_DIR}/.env"
      if [[ -n "${PANEL_DOMAIN:-}" && "${PANEL_DOMAIN}" != "localhost" && ! "${PANEL_DOMAIN}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        info "Running post-update SSL maintenance for domain ${PANEL_DOMAIN}..."
        
        local needs_renewal=false
        local cert_file="${INSTALL_DIR}/nginx/ssl/fullchain.pem"
        
        if [[ ! -f "$cert_file" ]]; then
          needs_renewal=true
        elif ! openssl x509 -checkend 86400 -noout -in "$cert_file" >/dev/null 2>&1; then
          # Certificate is expired or expires in < 1 day
          needs_renewal=true
        fi
        
        if [[ "$needs_renewal" == "true" ]]; then
          info "SSL certificate is missing or expiring. Attempting automatic issuance..."
          HEADLESS=true hm ssl issue "${PANEL_DOMAIN}" "admin@${PANEL_DOMAIN}" >/dev/null 2>&1 || warn "Auto SSL issue failed. You can run 'hm ssl issue' later."
        else
          info "Valid SSL certificate detected. Re-applying Nginx configuration..."
          HEADLESS=true hm ssl repair >/dev/null 2>&1 || true
        fi
        log "SSL configuration successfully synchronized."
      fi
    fi

    log "HMPanel Panel successfully updated to version $(read_running_app_version)!"
  fi

  info "Cleaning up old images..."
  docker image prune -a -f || true
  docker builder prune -f || true
}

main "$@"
