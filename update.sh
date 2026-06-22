#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  HMPanel — Master Updater v1.2
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
  echo -e "${CYAN}${BOLD}HMPanel Master Updater v1.2${NC}"
  check_root

  INSTALL_DIR="/opt/hmpanel"
  if [[ ! -d "$INSTALL_DIR" ]]; then
    die "HMPanel is not installed at ${INSTALL_DIR}. Is the panel installed?"
  fi
  
  cd "$INSTALL_DIR"
  
  REPO_URL="https://raw.githubusercontent.com/neoauroraproject/hmpanel/main"

  step "[1/7] Fetching Latest Infrastructure Files"
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
  curl -fsSL "${REPO_URL}/nginx/nginx.conf.template" -o nginx/nginx.conf.template || warn "Failed to download nginx.conf.template"

  log "Host infrastructure synced with main branch."

  step "[2/7] Updating CLI Manager"
  if [[ -f "${INSTALL_DIR}/cli.sh" ]]; then
    info "Installing updated hmpanel CLI..."
    cp "${INSTALL_DIR}/cli.sh" /usr/local/bin/hmpanel
    chmod +x /usr/local/bin/hmpanel
    ln -sf /usr/local/bin/hmpanel /usr/local/bin/hm
    log "CLI updated successfully."
  fi

  step "[3/7] Rollback Safety"
  if docker image inspect ghcr.io/neoauroraproject/hmpanel:latest &>/dev/null; then
    docker tag ghcr.io/neoauroraproject/hmpanel:latest ghcr.io/neoauroraproject/hmpanel:rollback
    log "Current image tagged as rollback."
  else
    warn "No existing latest image found to tag as rollback."
  fi

  step "[4/7] Pulling Latest Docker Images"
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

  step "[5/7] Checking Permissions"
  if [ -f "${INSTALL_DIR}/.env" ]; then
    chown 1001:1001 "${INSTALL_DIR}/.env"
    chmod 600 "${INSTALL_DIR}/.env"
  fi

  step "[6/7] Deploying Containers"
  info "Recreating containers with latest mounts and images..."
  docker compose up -d --remove-orphans

  step "[7/7] Verifying Health & Cleaning Up"
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
    log "HMPanel Panel successfully updated to latest version!"
  fi

  info "Cleaning up old images..."
  docker image prune -a -f || true
  docker builder prune -f || true
}

main "$@"
