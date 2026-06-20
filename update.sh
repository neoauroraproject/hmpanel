#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  HMPanel Panel — Interactive Updater v1.0
#  https://github.com/HMPanel/panel
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

# Colors & formatting
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

log()     { echo -e "${GREEN}✔${NC}  $*"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $*"; }
error()   { echo -e "${RED}✘${NC}  $*" >&2; }
info()    { echo -e "${BLUE}ℹ${NC}  $*"; }
step()    { echo -e "\n${CYAN}${BOLD}──── $* ────${NC}"; }
die()     { error "$*"; exit 1; }

check_root() {
  if [[ $EUID -ne 0 ]]; then
    die "This updater must be run as root. Use: sudo bash update.sh"
  fi
  log "Running as root"
}

main() {
  echo -e "${CYAN}${BOLD}HMPanel Panel Updater v1.0${NC}"
  
  check_root

  # Detect installation directory
  INSTALL_DIR="/opt/hmpanel"
  if [[ ! -d "$INSTALL_DIR" ]]; then
    # Fallback to current script directory if /opt/hmpanel-panel doesn't exist
    INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  fi
  
  info "Target directory: ${INSTALL_DIR}"
  cd "$INSTALL_DIR"

  if [[ ! -f "docker-compose.yml" ]]; then
    die "docker-compose.yml not found in ${INSTALL_DIR}. Is HMPanel Panel installed?"
  fi

  # Pull changes from git if it's a git repo
  if [[ -d ".git" ]]; then
    step "Pulling Latest Updates from GitHub"
    if command -v git &>/dev/null; then
      info "Running git pull..."
      git fetch --all
      git reset --hard origin/main || git reset --hard origin/master || git pull
      log "Git repository updated"
    else
      warn "Git is not installed, skipping git pull"
    fi
  else
    info "Not a git repository, skipping pull phase"
  fi

  # Phase 5: Rollback Safety
  step "[4/7] Rollback Safety: Tagging current image as rollback baseline"
  if docker image inspect ghcr.io/neoauroraproject/hmpanel:latest &>/dev/null; then
    docker tag ghcr.io/neoauroraproject/hmpanel:latest ghcr.io/neoauroraproject/hmpanel:rollback
    log "Current image tagged as rollback."
  else
    warn "No existing latest image found to tag as rollback."
  fi

  step "[5/7] Pulling Latest Docker Images"
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
    die "Failed to pull Docker images after $max_pull attempts. Please check your network connection or configure a Docker registry mirror."
  fi

  step "[6/7] Updating Containers (Restarting Services)"
  info "Pre-flight check: Validating .env permissions for container..."
  if [ -f "${INSTALL_DIR}/.env" ]; then
    if ! docker run --rm -u 1001:1001 -v "${INSTALL_DIR}/.env:/app/.env" alpine cat /app/.env >/dev/null 2>&1; then
      warn "The .env file is not readable by the container user (UID 1001)."
      info "Attempting to repair permissions automatically..."
      chown 1001:1001 "${INSTALL_DIR}/.env"
      chmod 600 "${INSTALL_DIR}/.env"
      if ! docker run --rm -u 1001:1001 -v "${INSTALL_DIR}/.env:/app/.env" alpine cat /app/.env >/dev/null 2>&1; then
        die "FATAL: Could not grant read permissions to .env for container user 1001. Update aborted to prevent container crash."
      else
        log "Permissions repaired successfully."
      fi
    else
      log "Pre-flight permissions check passed."
    fi
  fi

  info "Re-deploying containers..."
  docker compose up -d

  step "Cleaning Up"
  info "Removing old unused Docker images and build cache to free up disk space..."
  docker image prune -a -f || true
  docker builder prune -f || true

  step "[7/7] Verifying Health & Final Verification"
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
    log "HMPanel Panel successfully updated and verified!"
  fi

  step "Final Cleanup"
  info "Running final prune to remove dangling images..."
  docker image prune -a -f || true
}

main "$@"
