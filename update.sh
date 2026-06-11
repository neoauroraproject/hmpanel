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
  INSTALL_DIR="/opt/HMPanel-panel"
  if [[ ! -d "$INSTALL_DIR" ]]; then
    # Fallback to current script directory if /opt/HMPanel-panel doesn't exist
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

  step "Rebuilding Docker Images"
  info "Building panel app (this may take a few minutes)..."
  docker compose build --no-cache

  step "Restarting Services"
  info "Re-deploying containers..."
  docker compose up -d

  step "Verifying Health"
  local max_attempts=30
  local attempt=0
  info "Waiting for services to become healthy..."
  while [[ $attempt -lt $max_attempts ]]; do
    if docker exec HMPanel-panel curl -sf "http://localhost:4000/health" &>/dev/null; then
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
}

main "$@"
