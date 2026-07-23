#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  HMPanel Panel — Uninstaller v2.0
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
    resolve_compose || return 1
  fi
  "${COMPOSE_BIN[@]}" "$@"
}

check_root() {
  if [[ $EUID -ne 0 ]]; then
    die "This uninstaller must be run as root. Use: sudo bash uninstall.sh"
  fi
}

remove_cron_and_aliases() {
  info "Checking for cron jobs..."
  if crontab -l &>/dev/null; then
    crontab -l | grep -v "acme.sh" | crontab - || true
    log "acme.sh cron jobs removed"
  fi

  info "Checking for shell aliases..."
  if [[ -f ~/.bashrc ]]; then
    sed -i '/alias hm=/d' ~/.bashrc
    sed -i '/alias hmpanel=/d' ~/.bashrc
    log "Shell aliases removed"
  fi
}

verify_uninstallation() {
  step "Auditing Uninstallation"
  local remaining_artifacts=0

  echo -e "${BOLD}Checking for remaining artifacts...${NC}"

  if [[ -f /usr/local/bin/hmpanel ]]; then
    warn "/usr/local/bin/hmpanel still exists."
    remaining_artifacts=$((remaining_artifacts+1))
  fi

  if [[ -f /usr/local/bin/hm ]]; then
    warn "/usr/local/bin/hm still exists."
    remaining_artifacts=$((remaining_artifacts+1))
  fi

  if systemctl list-units --full -all | grep -Fq "hmpanel-panel.service"; then
    warn "hmpanel-panel.service still exists in systemd."
    remaining_artifacts=$((remaining_artifacts+1))
  fi

  if docker ps -a --format '{{.Names}}' | grep -Eq "^(panel-app|panel-frontend|postgres|redis)$"; then
    warn "Docker containers (panel-app, panel-frontend, postgres, redis) still exist."
    remaining_artifacts=$((remaining_artifacts+1))
  fi

  if docker network ls --format '{{.Name}}' | grep -Fq "hmpanel_default"; then
    warn "Docker network 'hmpanel_default' still exists."
    remaining_artifacts=$((remaining_artifacts+1))
  fi

  if [[ "$1" == "complete" ]]; then
    if [[ -d "/opt/hmpanel" ]]; then
      warn "Installation directory /opt/hmpanel still exists."
      remaining_artifacts=$((remaining_artifacts+1))
    fi

    if docker volume ls --format '{{.Name}}' | grep -Eq "^hmpanel_"; then
      warn "Docker volumes (hmpanel_*) still exist."
      remaining_artifacts=$((remaining_artifacts+1))
    fi
  fi

  if [[ $remaining_artifacts -eq 0 ]]; then
    echo ""
    log "Audit passed! No remaining artifacts found."
    echo -e "${GREEN}${BOLD}HMPanel Panel has been successfully uninstalled.${NC}"
  else
    echo ""
    error "Audit failed! Found $remaining_artifacts remaining artifacts."
    echo -e "${YELLOW}Please remove them manually or run the script again.${NC}"
  fi
}

main() {
  echo -e "${RED}${BOLD}HMPanel Panel Uninstaller v2.0${NC}"
  warn "This script will stop and remove HMPanel Panel."
  echo ""

  check_root

  # Detect installation directory
  INSTALL_DIR="/opt/hmpanel"
  if [[ ! -d "$INSTALL_DIR" ]]; then
    INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  fi

  info "Detected install directory: ${INSTALL_DIR}"
  
  echo -e "${CYAN}${BOLD}Select Uninstall Mode:${NC}"
  echo -e "  1. ${BOLD}Standard Uninstall${NC} - Removes application only. Preserves database, backups, and user data."
  echo -e "  2. ${BOLD}Complete Removal${NC} - Removes EVERYTHING including database, volumes, backups, and configuration."
  echo -e "  3. Cancel"
  echo ""
  read -rp "Select an option [1-3]: " UNINSTALL_MODE

  case $UNINSTALL_MODE in
    1)
      REMOVE_DATA="n"
      log "Selected: Standard Uninstall"
      ;;
    2)
      echo ""
      echo -e "${YELLOW}${BOLD}  WARNING: Complete Removal is irreversible!${NC}"
      echo -e "  This will permanently delete all persistent data, including:"
      echo -e "    - PostgreSQL Database"
      echo -e "    - Redis cache data"
      echo -e "    - Uploaded files & logs"
      echo -e "    - All Backups"
      echo -e "    - SSL Certificates"
      echo ""
      read -rp "  Are you absolutely sure you want to proceed with Complete Removal? [y/N]: " CONFIRM_COMPLETE
      if [[ "${CONFIRM_COMPLETE,,}" != "y" ]]; then
        die "Uninstall cancelled."
      fi
      REMOVE_DATA="y"
      log "Selected: Complete Removal"
      ;;
    3|*)
      die "Uninstall cancelled."
      ;;
  esac

  step "Stopping Services"
  if [[ -f "${INSTALL_DIR}/docker-compose.yml" ]]; then
    cd "$INSTALL_DIR"
    info "Stopping docker containers..."
    if [[ "$REMOVE_DATA" == "y" ]]; then
      compose down -v --rmi all || true
      log "Docker containers, networks, volumes, and images stopped and removed."
    else
      compose down || true
      log "Docker containers and networks stopped."
    fi
  else
    warn "docker-compose.yml not found. Attempting manual container stop..."
    docker stop panel-app panel-frontend postgres redis &>/dev/null || true
    docker rm panel-app panel-frontend postgres redis &>/dev/null || true
  fi

  step "Removing Systemd Service"
  if systemctl list-units --full -all | grep -Fq "hmpanel-panel.service"; then
    info "Disabling and removing systemd service..."
    systemctl stop hmpanel-panel || true
    systemctl disable hmpanel-panel || true
    rm -f /etc/systemd/system/hmpanel-panel.service
    systemctl daemon-reload
    log "Systemd service removed"
  else
    log "No systemd service found"
  fi

  step "Removing CLI Binaries"
  rm -f /usr/local/bin/hmpanel
  rm -f /usr/local/bin/hm
  log "CLI binaries removed"

  if [[ "$REMOVE_DATA" == "y" ]]; then
    remove_cron_and_aliases
  fi

  step "Removing Installation Files"
  if [[ "$REMOVE_DATA" == "y" ]]; then
    info "Deleting installation folder: ${INSTALL_DIR}..."
    rm -rf "$INSTALL_DIR"
    log "Installation files deleted"

    info "Cleaning up leftover Docker volumes..."
    docker volume rm hmpanel_pgdata hmpanel_redisdata hmpanel_uploads hmpanel_backups hmpanel_logs hmpanel_certbot_certs hmpanel_certbot_www &>/dev/null || true
    log "Docker volumes cleaned"
  else
    info "Cleaning up application files in ${INSTALL_DIR}..."
    if [[ -d "${INSTALL_DIR}/backups" ]]; then
      mv "${INSTALL_DIR}/backups" /tmp/hmpanel_backups_save
    fi
    if [[ -f "${INSTALL_DIR}/.env" ]]; then
      mv "${INSTALL_DIR}/.env" /tmp/hmpanel_env_save
    fi
    
    rm -rf "$INSTALL_DIR"
    mkdir -p "$INSTALL_DIR"
    
    if [[ -d /tmp/hmpanel_backups_save ]]; then
      mv /tmp/hmpanel_backups_save "${INSTALL_DIR}/backups"
    fi
    if [[ -f /tmp/hmpanel_env_save ]]; then
      mv /tmp/hmpanel_env_save "${INSTALL_DIR}/.env"
    fi
    log "Application files removed, configuration and backups preserved in ${INSTALL_DIR}"
  fi

  # Run Audit
  if [[ "$REMOVE_DATA" == "y" ]]; then
    verify_uninstallation "complete"
  else
    verify_uninstallation "standard"
  fi
}

main "$@"
