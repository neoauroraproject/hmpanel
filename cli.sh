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

  local app_version="Unknown"
  if docker inspect hmpanel-panel >/dev/null 2>&1; then
    # Try to grab the exact tag or version if possible, fallback to checking image
    local image_name
    image_name=$(docker inspect -f '{{.Config.Image}}' hmpanel-panel 2>/dev/null)
    app_version="${image_name##*:}"
  fi

  echo -e "  Version:       ${CYAN}${app_version}${NC}"
  echo -e "  Edition:       ${CYAN}Community Edition${NC}"
  echo -e "  Domain:        ${CYAN}${DOMAIN:-Unknown}${NC}"
  echo ""
  echo -e "  ${BOLD}Containers:${NC}"
  echo -e "  Frontend/API:  $(get_container_status hmpanel-panel)"
  echo -e "  PostgreSQL:    $(get_container_status hmpanel-postgres)"
  echo -e "  Redis:         $(get_container_status hmpanel-redis)"
  echo -e "  Nginx:         $(get_container_status hmpanel-nginx)"
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
  echo -e "  - Inspect database:      ${YELLOW}docker exec -it hmpanel-postgres psql -U panel_user -d panel_db${NC}"
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
  if docker exec -t hmpanel-postgres pg_dumpall -c -U panel_user > "$filepath"; then
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
  if cat "$filepath" | docker exec -i hmpanel-postgres psql -U panel_user -d panel_db >/dev/null 2>&1; then
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

ssl_request_acme() {
  echo -e "${BOLD}--- Request ACME Certificate ---${NC}\n"
  if [[ -f "${INSTALL_DIR}/.env" ]]; then
    source "${INSTALL_DIR}/.env"
  fi
  
  if [[ -z "${DOMAIN:-}" || "$DOMAIN" == "localhost" ]]; then
    echo -e "${RED}✘ Invalid domain/IP in .env.${NC}"
    pause
    return
  fi
  
  echo -e "Attempting to issue ACME certificate for ${CYAN}${DOMAIN}${NC}..."
  
  if [[ ! -f "${INSTALL_DIR}/acme.sh/acme.sh" ]]; then
    echo -e "${RED}✘ acme.sh not found. Please run installer again or install acme.sh manually.${NC}"
    pause
    return
  fi
  
  # Temporarily stop nginx to free port 80
  docker stop hmpanel-nginx >/dev/null 2>&1 || true
  
  "${INSTALL_DIR}/acme.sh/acme.sh" --home "${INSTALL_DIR}/acme.sh" --set-default-ca --server zerossl >/dev/null 2>&1

  if "${INSTALL_DIR}/acme.sh/acme.sh" --home "${INSTALL_DIR}/acme.sh" --issue -d "$DOMAIN" --standalone; then
    "${INSTALL_DIR}/acme.sh/acme.sh" --home "${INSTALL_DIR}/acme.sh" --install-cert -d "$DOMAIN" \
      --fullchain-file "${INSTALL_DIR}/nginx/ssl/fullchain.pem" \
      --key-file "${INSTALL_DIR}/nginx/ssl/privkey.pem" \
      --reloadcmd "docker exec hmpanel-nginx nginx -s reload || true" >/dev/null 2>&1
      
    # Enable SSL in nginx if it was disabled
    sed -i 's/# SSL disabled/listen 443 ssl http2;/' "${INSTALL_DIR}/nginx/nginx.conf" 2>/dev/null || true
    
    echo -e "${GREEN}✔ Certificate issued successfully!${NC}"
  else
    echo -e "${RED}✘ ACME request failed.${NC}"
  fi
  
  echo "Restarting Nginx..."
  docker start hmpanel-nginx >/dev/null 2>&1 || true
  pause
}

ssl_install_manual() {
  echo -e "${BOLD}--- Install Existing Certificate ---${NC}\n"
  echo "Please provide absolute paths to your certificate files."
  read -rp "Path to fullchain.pem: " path_cert
  read -rp "Path to privkey.pem: " path_key
  
  if [[ -f "$path_cert" && -f "$path_key" ]]; then
    cp "$path_cert" "${INSTALL_DIR}/nginx/ssl/fullchain.pem"
    cp "$path_key" "${INSTALL_DIR}/nginx/ssl/privkey.pem"
    chmod 600 "${INSTALL_DIR}/nginx/ssl/privkey.pem"
    
    # Enable SSL
    sed -i 's/# SSL disabled/listen 443 ssl http2;/' "${INSTALL_DIR}/nginx/nginx.conf" 2>/dev/null || true
    
    echo -e "${GREEN}✔ Certificates installed.${NC}"
    echo "Reloading Nginx..."
    docker exec hmpanel-nginx nginx -s reload >/dev/null 2>&1 || true
  else
    echo -e "${RED}✘ One or both files not found. Ensure paths are absolute and files exist.${NC}"
  fi
  pause
}

ssl_disable() {
  echo -e "${BOLD}--- Switch to HTTP Mode ---${NC}\n"
  echo -e "${YELLOW}⚠ Warning: This will disable HTTPS entirely.${NC}"
  read -rp "Are you sure? [y/N]: " confirm
  if [[ "${confirm,,}" == "y" ]]; then
    sed -i 's/listen 443 ssl http2;/# SSL disabled/' "${INSTALL_DIR}/nginx/nginx.conf" 2>/dev/null || true
    echo -e "${GREEN}✔ SSL disabled.${NC}"
    echo "Reloading Nginx..."
    docker exec hmpanel-nginx nginx -s reload >/dev/null 2>&1 || true
  else
    echo "Cancelled."
  fi
  pause
}

ssl_status() {
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

ssl_change_domain() {
  echo -e "${BOLD}--- Change Domain / IP ---${NC}\n"
  if [[ -f "${INSTALL_DIR}/.env" ]]; then
    source "${INSTALL_DIR}/.env"
  fi
  
  echo -e "Current Domain/IP: ${CYAN}${DOMAIN:-None}${NC}"
  read -rp "Enter new domain or IP: " new_domain
  if [[ -n "$new_domain" ]]; then
    if grep -q "^DOMAIN=" "${INSTALL_DIR}/.env"; then
      sed -i "s/^DOMAIN=.*/DOMAIN=$new_domain/" "${INSTALL_DIR}/.env"
    else
      echo "DOMAIN=$new_domain" >> "${INSTALL_DIR}/.env"
    fi
    export DOMAIN="$new_domain"
    echo -e "${GREEN}✔ Domain/IP updated in .env to $new_domain${NC}"
    
    read -rp "Do you want to request a new ACME SSL certificate for this domain/IP now? [y/N]: " req_ssl
    if [[ "${req_ssl,,}" == "y" ]]; then
      ssl_request_acme
    else
      echo "Restarting containers to apply changes..."
      docker compose -f "${INSTALL_DIR}/docker-compose.yml" up -d
      pause
    fi
  else
    echo "Change cancelled."
    pause
  fi
}

cmd_ssl() {
  while true; do
    clear
    print_header
    echo -e "${BOLD}--- SSL & Domain Management ---${NC}\n"
    echo "  1) Change Domain/IP"
    echo "  2) Request ACME Certificate (ZeroSSL/Let's Encrypt)"
    echo "  3) Retry Certificate Request"
    echo "  4) Install Existing Certificate"
    echo "  5) Switch To HTTP Mode"
    echo "  6) View SSL Status"
    echo "  0) Back to Main Menu"
    echo ""
    read -rp "  Choice: " choice
    echo ""
    
    case $choice in
      1) ssl_change_domain ;;
      2|3) ssl_request_acme ;;
      4) ssl_install_manual ;;
      5) ssl_disable ;;
      6) ssl_status ;;
      0) return ;;
      *) echo -e "${RED}Invalid option!${NC}"; sleep 1 ;;
    esac
  done
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

cmd_cleanup() {
  echo -e "${BOLD}--- System Cleanup ---${NC}\n"
  echo "This will remove all unused Docker images to free up disk space."
  read -rp "Do you want to proceed? [y/N]: " confirm
  if [[ "${confirm,,}" == "y" ]]; then
    echo "Running cleanup..."
    docker image prune -a -f
    echo -e "${GREEN}✔ Cleanup completed.${NC}"
  else
    echo "Cleanup cancelled."
  fi
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
  echo -e "  8. SSL Management"
  echo -e "  9. System Cleanup"
  echo -e "  10. Uninstall HMPanel"
  echo -e "  0. Exit"
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
    9) cmd_cleanup ;;
    10) cmd_uninstall ;;
    0) echo "Goodbye!"; exit 0 ;;
    *) echo -e "  ${RED}Invalid option!${NC}"; sleep 1 ;;
  esac
done
