#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  HMPanel — CLI Manager
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

INSTALL_DIR="/opt/hmpanel"
BACKUP_DIR="${INSTALL_DIR}/backups"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Check root
if [[ $EUID -ne 0 ]]; then
  echo -e "${RED}✘ This command must be run as root.${NC} Try: sudo hmpanel"
  exit 1
fi

print_header() {
  clear
  echo -e "${CYAN}${BOLD}"
  echo "  ██╗  ██╗███╗   ███╗██████╗  █████╗ ███╗   ██╗███████╗██╗     "
  echo "  ██║  ██║████╗ ████║██╔══██╗██╔══██╗████╗  ██║██╔════╝██║     "
  echo "  ███████║██╔████╔██║██████╔╝███████║██╔██╗ ██║█████╗  ██║     "
  echo "  ██╔══██║██║╚██╔╝██║██╔═══╝ ██╔══██║██║╚██╗██║██╔══╝  ██║     "
  echo "  ██║  ██║██║ ╚═╝ ██║██║     ██║  ██║██║ ╚████║███████╗███████╗"
  echo "  ╚═╝  ╚═╝╚═╝     ╚═╝╚═╝     ╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝"
  echo -e "${NC}"
  echo -e "  ${BOLD}HMPanel CLI Manager — Community Edition${NC}\n"
}

pause() {
  echo ""
  read -rp "Press Enter to return to the menu..."
}

get_container_status() {
  local container="$1"
  local status
  status=$(docker inspect -f '{{.State.Status}}' "$container" 2>/dev/null || echo "missing")
  if [[ "$status" == "running" ]]; then
    echo -e "${GREEN}Running${NC}"
  elif [[ "$status" == "missing" ]]; then
    echo -e "${RED}Not Found${NC}"
  else
    echo -e "${YELLOW}${status}${NC}"
  fi
}

cmd_status() {
  echo -e "${BOLD}--- Panel Status ---${NC}\n"
  
  if [[ -f "${INSTALL_DIR}/.env" ]]; then
    source "${INSTALL_DIR}/.env"
  fi

  echo -e "  Version:       ${CYAN}1.0.0${NC}"
  echo -e "  Edition:       ${CYAN}Community Edition${NC}"
  echo -e "  Domain:        ${CYAN}${DOMAIN:-Unknown}${NC}"
  echo ""
  echo -e "  ${BOLD}Containers:${NC}"
  echo -e "  Frontend/API:  $(get_container_status hmray-panel)"
  echo -e "  PostgreSQL:    $(get_container_status hmray-postgres)"
  echo -e "  Redis:         $(get_container_status hmray-redis)"
  echo -e "  Nginx:         $(get_container_status hmray-nginx)"
  pause
}

cmd_info() {
  echo -e "${BOLD}--- Panel Information ---${NC}\n"
  echo -e "  Install Path:  ${CYAN}${INSTALL_DIR}${NC}"
  echo -e "  Backups Path:  ${CYAN}${BACKUP_DIR}${NC}"
  echo -e "  Logs Path:     ${CYAN}${INSTALL_DIR}/logs${NC}"
  echo -e "  SSL Path:      ${CYAN}${INSTALL_DIR}/nginx/ssl${NC}"
  echo ""
  echo -e "  Useful Commands:"
  echo -e "  - View raw compose logs: ${YELLOW}docker compose -f ${INSTALL_DIR}/docker-compose.yml logs -f${NC}"
  echo -e "  - Inspect database:      ${YELLOW}docker exec -it hmray-postgres psql -U panel_user -d panel_db${NC}"
  pause
}

cmd_update() {
  if [[ -f "${INSTALL_DIR}/update.sh" ]]; then
    bash "${INSTALL_DIR}/update.sh"
    pause
  else
    echo -e "${RED}✘ update.sh not found in ${INSTALL_DIR}${NC}"
    pause
  fi
}

cmd_backup() {
  echo -e "${BOLD}--- Create Backup ---${NC}\n"
  local filename="backup_$(date +%F_%H-%M-%S).sql"
  local filepath="${BACKUP_DIR}/${filename}"
  
  echo -e "Creating database backup..."
  if docker exec -t hmray-postgres pg_dumpall -c -U panel_user > "$filepath"; then
    echo -e "${GREEN}✔ Backup completed successfully!${NC}"
    echo -e "Saved to: ${CYAN}${filepath}${NC}"
  else
    echo -e "${RED}✘ Backup failed.${NC}"
    rm -f "$filepath"
  fi
  pause
}

cmd_restore() {
  echo -e "${BOLD}--- Restore Backup ---${NC}\n"
  echo "Available backups in ${BACKUP_DIR}:"
  ls -1 "${BACKUP_DIR}"/*.sql 2>/dev/null | awk -F/ '{print " - " $NF}' || echo "  (No .sql backups found)"
  
  echo ""
  read -rp "Enter the exact filename to restore (or press Enter to cancel): " filename
  if [[ -z "$filename" ]]; then
    return
  fi

  local filepath="${BACKUP_DIR}/${filename}"
  if [[ ! -f "$filepath" ]]; then
    echo -e "${RED}✘ File not found: ${filepath}${NC}"
    pause
    return
  fi

  echo -e "${YELLOW}⚠ WARNING: Restoring will overwrite the current database entirely!${NC}"
  read -rp "Are you absolutely sure? [y/N]: " confirm
  if [[ "${confirm,,}" != "y" ]]; then
    echo "Restore cancelled."
    pause
    return
  fi

  echo -e "\nRestoring database..."
  if cat "$filepath" | docker exec -i hmray-postgres psql -U panel_user -d panel_db >/dev/null 2>&1; then
    echo -e "${GREEN}✔ Restore completed successfully!${NC}"
  else
    echo -e "${RED}✘ Restore failed.${NC}"
  fi
  pause
}

cmd_restart() {
  echo -e "${BOLD}--- Restart Services ---${NC}\n"
  cd "$INSTALL_DIR" || return
  echo "Restarting all containers..."
  docker compose restart
  echo -e "${GREEN}✔ Services restarted.${NC}"
  pause
}

cmd_logs() {
  echo -e "${BOLD}--- View Logs ---${NC}\n"
  echo "Select a service to tail (Press Ctrl+C to stop viewing):"
  echo "1) All Services"
  echo "2) Panel App (Frontend/Backend)"
  echo "3) Nginx"
  echo "4) PostgreSQL"
  echo "5) Redis"
  echo "0) Back"
  read -rp "Choice: " choice

  cd "$INSTALL_DIR" || return
  echo ""
  case $choice in
    1) docker compose logs -f --tail 100 ;;
    2) docker compose logs -f --tail 100 panel-app ;;
    3) docker compose logs -f --tail 100 nginx ;;
    4) docker compose logs -f --tail 100 postgres ;;
    5) docker compose logs -f --tail 100 redis ;;
    0) return ;;
    *) echo -e "${RED}Invalid option${NC}" ; sleep 1 ;;
  esac
}

cmd_ssl() {
  echo -e "${BOLD}--- SSL Status ---${NC}\n"
  local cert_file="${INSTALL_DIR}/nginx/ssl/fullchain.pem"
  
  if [[ ! -f "$cert_file" ]]; then
    echo -e "${RED}✘ SSL certificate not found at ${cert_file}${NC}"
    echo "Is SSL disabled or strictly HTTP?"
    pause
    return
  fi

  local end_date
  end_date=$(openssl x509 -enddate -noout -in "$cert_file" | cut -d= -f2)
  local expiration_epoch
  expiration_epoch=$(date -d "$end_date" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "$end_date" +%s 2>/dev/null)
  local current_epoch
  current_epoch=$(date +%s)
  
  if [[ -n "$expiration_epoch" ]]; then
    local days_left=$(( (expiration_epoch - current_epoch) / 86400 ))
    echo -e "  Certificate:   ${CYAN}Found${NC}"
    echo -e "  Expiration:    ${CYAN}${end_date}${NC}"
    
    if [[ $days_left -lt 0 ]]; then
      echo -e "  Status:        ${RED}Expired ($((-days_left)) days ago)${NC}"
    elif [[ $days_left -lt 15 ]]; then
      echo -e "  Status:        ${YELLOW}Expiring Soon (${days_left} days left)${NC}"
    else
      echo -e "  Status:        ${GREEN}Valid (${days_left} days left)${NC}"
    fi
  else
    echo -e "  Certificate:   ${CYAN}Found${NC}"
    echo -e "  Status:        ${YELLOW}Unable to parse expiration date${NC}"
  fi
  pause
}

cmd_uninstall() {
  echo -e "${BOLD}--- Uninstall HMPanel ---${NC}\n"
  if [[ -f "${INSTALL_DIR}/uninstall.sh" ]]; then
    echo -e "${YELLOW}⚠ WARNING: You are about to uninstall the panel.${NC}"
    read -rp "Are you absolutely sure you want to proceed? [y/N]: " confirm
    if [[ "${confirm,,}" == "y" ]]; then
      bash "${INSTALL_DIR}/uninstall.sh"
      exit 0
    else
      echo "Uninstall cancelled."
      pause
    fi
  else
    echo -e "${RED}✘ uninstall.sh not found in ${INSTALL_DIR}${NC}"
    pause
  fi
}

cmd_premium() {
  echo -e "${BOLD}--- Premium Feature ---${NC}\n"
  echo -e "${YELLOW}This feature requires an active XRAY PRO or Enterprise License.${NC}"
  echo "To upgrade your license, please contact your account manager or visit the official website."
  pause
}

# ─────────────────────────────────────────────────────────────────
# Main Menu Loop
# ─────────────────────────────────────────────────────────────────
while true; do
  print_header
  
  echo -e "  1. Panel Status"
  echo -e "  2. Panel Information"
  echo -e "  3. Update HMPanel"
  echo -e "  4. Create Backup"
  echo -e "  5. Restore Backup"
  echo -e "  6. Restart Services"
  echo -e "  7. View Logs"
  echo -e "  8. SSL Status"
  echo -e "  9. Uninstall HMPanel"
  echo -e "  0. Exit"
  echo ""
  echo -e "  ${BOLD}Premium Modules (Locked):${NC}"
  echo -e "  P1. XRAY PRO"
  echo -e "  P2. License Manager"
  echo -e "  P3. Remote Backups"
  echo -e "  P4. Advanced Monitoring"
  echo -e "  P5. Domain Manager"
  echo ""
  
  read -rp "  Select an option: " choice
  echo ""
  
  case $choice in
    1) cmd_status ;;
    2) cmd_info ;;
    3) cmd_update ;;
    4) cmd_backup ;;
    5) cmd_restore ;;
    6) cmd_restart ;;
    7) cmd_logs ;;
    8) cmd_ssl ;;
    9) cmd_uninstall ;;
    0) echo "Goodbye!"; exit 0 ;;
    p1|P1|p2|P2|p3|P3|p4|P4|p5|P5) cmd_premium ;;
    *) echo -e "  ${RED}Invalid option!${NC}"; sleep 1 ;;
  esac
done
