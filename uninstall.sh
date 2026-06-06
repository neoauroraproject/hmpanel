#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  HMray Panel — Uninstaller v1.0
#  https://github.com/hmray/panel
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
    die "This uninstaller must be run as root. Use: sudo bash uninstall.sh"
  fi
  log "Running as root"
}

main() {
  echo -e "${RED}${BOLD}HMray Panel Uninstaller v1.0${NC}"
  warn "This script will stop and remove HMray Panel."
  echo ""

  check_root

  # Detect installation directory
  INSTALL_DIR="/opt/hmray-panel"
  if [[ ! -d "$INSTALL_DIR" ]]; then
    INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  fi

  info "Detected install directory: ${INSTALL_DIR}"
  
  # Ask for confirmation
  read -rp "  Are you sure you want to uninstall HMray Panel? [y/N]: " CONFIRM_UNINSTALL
  if [[ "${CONFIRM_UNINSTALL,,}" != "y" ]]; then
    die "Uninstall cancelled."
  fi

  # Ask about database and user data
  REMOVE_DATA="n"
  echo ""
  echo -e "${YELLOW}${BOLD}  WARNING: Removing data is irreversible!${NC}"
  echo -e "  Do you want to delete all persistent data? This includes:"
  echo -e "    - PostgreSQL Database (hmray_pgdata)"
  echo -e "    - Redis cache data (hmray_redisdata)"
  echo -e "    - Uploaded files & logs (hmray_uploads, hmray_logs)"
  echo -e "    - Backups (hmray_backups)"
  echo -e "    - SSL Certificates (hmray_certbot_certs)"
  read -rp "  Delete all persistent data? [y/N]: " REMOVE_DATA_CHOICE
  if [[ "${REMOVE_DATA_CHOICE,,}" == "y" ]]; then
    REMOVE_DATA="y"
  fi

  step "Stopping Services"
  if [[ -f "${INSTALL_DIR}/docker-compose.yml" ]]; then
    cd "$INSTALL_DIR"
    info "Stopping docker containers..."
    if [[ "$REMOVE_DATA" == "y" ]]; then
      # Down and remove volumes
      docker compose down -v --rmi local || true
      log "Docker containers, images, and volumes stopped and removed"
    else
      docker compose down || true
      log "Docker containers stopped"
    fi
  else
    warn "docker-compose.yml not found. Skipping container teardown."
  fi

  step "Removing Systemd Service"
  if [[ -f /etc/systemd/system/hmray-panel.service ]]; then
    info "Disabling and removing systemd service..."
    systemctl stop hmray-panel || true
    systemctl disable hmray-panel || true
    rm -f /etc/systemd/system/hmray-panel.service
    systemctl daemon-reload
    log "Systemd service removed"
  else
    log "No systemd service found"
  fi

  if [[ "$REMOVE_DATA" == "y" ]]; then
    step "Removing Files & Folders"
    info "Deleting installation folder: ${INSTALL_DIR}..."
    rm -rf "$INSTALL_DIR"
    log "Files deleted"

    # Force delete named volumes just in case they weren't cleaned up by docker compose down -v
    info "Cleaning up leftover Docker volumes..."
    docker volume rm hmray_pgdata hmray_redisdata hmray_uploads hmray_backups hmray_logs hmray_certbot_certs hmray_certbot_www &>/dev/null || true
    log "Docker volumes cleaned"
  else
    step "Keeping Files & Folders"
    info "Installation folder preserved at: ${INSTALL_DIR}"
    info "Persistent Docker volumes preserved."
  fi

  echo ""
  log "HMray Panel uninstalled successfully!"
}

main "$@"
