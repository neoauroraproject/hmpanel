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

# Compose V2 (`docker compose`) or legacy V1 (`docker-compose`)
COMPOSE_BIN=()
resolve_compose() {
  if docker compose version &>/dev/null 2>&1; then
    COMPOSE_BIN=(docker compose)
    return 0
  fi
  if command -v docker-compose &>/dev/null; then
    COMPOSE_BIN=(docker-compose)
    return 0
  fi
  return 1
}
compose() {
  if [[ ${#COMPOSE_BIN[@]} -eq 0 ]]; then
    resolve_compose || die "Docker Compose is not available (need 'docker compose' or 'docker-compose')"
  fi
  "${COMPOSE_BIN[@]}" "$@"
}

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
    if compose pull; then
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
  info "Starting database + redis for migrations..."
  if [[ -f "${INSTALL_DIR}/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "${INSTALL_DIR}/.env"
    set +a
  fi
  compose up -d postgres redis

  info "Waiting for database to be ready..."
  local pg_ready=false
  local pg_wait=0
  while [[ $pg_wait -lt 30 ]]; do
    if docker exec hmpanel-postgres pg_isready -U "${POSTGRES_USER:-panel_user}" -d "${POSTGRES_DB:-panel_db}" &>/dev/null; then
      pg_ready=true
      break
    fi
    # Superuser socket may work even when role auth is drifted
    if docker exec hmpanel-postgres pg_isready -U "${POSTGRES_USER:-panel_user}" -d postgres &>/dev/null; then
      pg_ready=true
      break
    fi
    pg_wait=$((pg_wait + 1))
    sleep 2
  done
  if [[ "$pg_ready" != "true" ]]; then
    die "PostgreSQL did not become ready. Check: docker logs hmpanel-postgres"
  fi

  # Heal password drift from restores (pg_dumpall role password vs .env).
  local db_user="${POSTGRES_USER:-panel_user}"
  local db_pass="${POSTGRES_PASSWORD:-}"
  if [[ -n "$db_pass" ]]; then
    info "Synchronizing PostgreSQL credentials with .env..."
    local escaped_pass="${db_pass//\'/\'\'}"
    # Official image has no role "postgres" — connect as POSTGRES_USER (panel_user).
    if ! docker exec hmpanel-postgres \
      psql -U "${db_user}" -d postgres -v ON_ERROR_STOP=1 \
      -c "ALTER ROLE \"${db_user}\" WITH PASSWORD '${escaped_pass}';" >/dev/null 2>&1; then
      warn "Could not sync DB password — retrying shortly..."
      sleep 3
      docker exec hmpanel-postgres \
        psql -U "${db_user}" -d postgres -v ON_ERROR_STOP=1 \
        -c "ALTER ROLE \"${db_user}\" WITH PASSWORD '${escaped_pass}';" >/dev/null 2>&1 \
        || warn "DB password sync still failing (continuing)..."
    else
      log "PostgreSQL role password synced."
    fi
  fi
  # Recreate redis so --requirepass + healthcheck match restored .env
  info "Recreating Redis so password matches .env..."
  compose up -d --force-recreate --no-deps redis >/dev/null 2>&1 || true
  sleep 3
  local redis_wait=0
  while [[ $redis_wait -lt 20 ]]; do
    if docker exec hmpanel-redis redis-cli -a "${REDIS_PASSWORD:-redis_secret}" ping 2>/dev/null | grep -qi PONG; then
      log "Redis is healthy."
      break
    fi
    redis_wait=$((redis_wait + 1))
    sleep 2
  done
  if [[ $redis_wait -ge 20 ]]; then
    warn "Redis still not responding to ping — migration may fail."
  fi

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
  # Upgrade scripts explicitly handle legacy store drops + Brand dedupe.
  # --accept-data-loss is required by Prisma for unique-constraint / enum expansions
  # after those safe prep steps; it does not wipe unrelated business tables.
  # upgrade + ensureCriticalSchema (idempotent) → db push → custom migrations → baseline migrate history
  # baseline is best-effort (|| true) so existing prod DBs without _prisma_migrations don't fail updates
  if ! compose run --rm panel-app /bin/sh -c "node backend/dist/scripts/upgrade-legacy-store-schema.js || true; npx prisma db push --schema=/app/prisma/schema.prisma --accept-data-loss && node backend/dist/scripts/run-migrations.js && (node backend/dist/scripts/baseline-prisma-migrations.js || true)"; then
    error "MIGRATION FAILED! Executing emergency rollback..."

    # NEVER `compose down` before restore — that removes hmpanel-postgres and
    # makes `hm restore` fail with: No such container: hmpanel-postgres
    info "Reverting Docker image to previous version..."
    if docker image inspect ghcr.io/neoauroraproject/hmpanel:rollback &>/dev/null; then
      docker tag ghcr.io/neoauroraproject/hmpanel:rollback ghcr.io/neoauroraproject/hmpanel:latest
    fi

    info "Ensuring postgres/redis are up for rollback restore..."
    compose up -d postgres redis || true
    sleep 5

    if [[ -n "${BACKUP_FILE:-}" && -f "$BACKUP_FILE" ]]; then
      info "Restoring state from pre-update backup..."
      if hm restore "$BACKUP_FILE"; then
        log "Rollback restore completed."
      else
        error "hm restore failed during rollback. Bring stack up manually: cd ${INSTALL_DIR} && docker compose up -d"
      fi
    else
      warn "No backup file found to restore."
    fi

    info "Starting previous version stack..."
    compose up -d || true
    die "Update aborted due to migration failure. Attempted rollback — verify health with: docker compose -f ${INSTALL_DIR}/docker-compose.yml ps"
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

  # One-time: migrate legacy named volume hmpanel_backups → bind-mount ./backups
  mkdir -p "${INSTALL_DIR}/backups"
  if docker volume inspect hmpanel_backups &>/dev/null; then
    local vol_files
    vol_files=$(docker run --rm -v hmpanel_backups:/from alpine sh -c 'ls -A /from 2>/dev/null | wc -l' 2>/dev/null || echo 0)
    local host_files
    host_files=$(ls -A "${INSTALL_DIR}/backups" 2>/dev/null | wc -l | tr -d ' ')
    if [[ "${vol_files:-0}" -gt 0 && "${host_files:-0}" -eq 0 ]]; then
      info "Migrating backups from Docker volume to ${INSTALL_DIR}/backups ..."
      docker run --rm \
        -v hmpanel_backups:/from \
        -v "${INSTALL_DIR}/backups:/to" \
        alpine sh -c 'cp -a /from/. /to/ && ls -la /to' || warn "Backup volume migration had warnings"
      log "Backups migrated to bind mount."
    fi
  fi

  info "Recreating containers with latest mounts and images..."
  # Redis first so panel-app boots against the correct requirepass (avoids 502).
  compose up -d --remove-orphans --force-recreate redis >/dev/null 2>&1 || true
  sleep 2
  compose up -d --remove-orphans --force-recreate panel-app
  compose up -d --remove-orphans

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
    echo ""
    error "Health check timeout. Backend did not become healthy."
    echo "[UPDATE_FAILED] Health check timeout"
    warn "Attempting rollback to previous image..."
    if docker image inspect ghcr.io/neoauroraproject/hmpanel:rollback &>/dev/null; then
      docker tag ghcr.io/neoauroraproject/hmpanel:rollback ghcr.io/neoauroraproject/hmpanel:latest
      compose up -d --remove-orphans || true
      sleep 8
      if docker exec hmpanel-panel curl -sf "http://127.0.0.1:4000/health" &>/dev/null; then
        warn "Rolled back to previous image. Backend is healthy again."
      else
        warn "Rollback image started but health still failing. Check: compose logs panel-app"
      fi
    else
      warn "No rollback image available. Check logs: $( [[ ${#COMPOSE_BIN[@]} -gt 0 ]] && echo "${COMPOSE_BIN[*]}" || echo "docker compose" ) logs panel-app"
    fi
    die "Update failed: backend health check timed out."
  fi

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

  info "Cleaning up old images..."
  docker image prune -a -f || true
  docker builder prune -f || true
}

main "$@"
