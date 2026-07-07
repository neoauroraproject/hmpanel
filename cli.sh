#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  HMPanel — CLI Manager
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

INSTALL_DIR="/opt/hmpanel"
BACKUP_DIR="${INSTALL_DIR}/backups"

update_env() {
  local key="$1"
  local val="$2"
  local env_file="${INSTALL_DIR}/.env"
  local tmp_file="${INSTALL_DIR}/.env.tmp"
  
  if [[ -f "$env_file" ]]; then
    if grep -q "^${key}=" "$env_file"; then
      # Replace existing key safely
      awk -v k="$key" -v v="$val" -F'=' 'BEGIN{OFS="="} $1==k {$2=v; print; next} {print}' "$env_file" > "$tmp_file"
    else
      # Append new key
      cp "$env_file" "$tmp_file"
      echo "${key}=${val}" >> "$tmp_file"
    fi
    mv "$tmp_file" "$env_file"
    chmod 600 "$env_file" 2>/dev/null || true
  fi
}

# ─────────────────────────────────────────────────────────────────
# Global API Constants & Helpers
# ─────────────────────────────────────────────────────────────────
OPERATION_ID=$(date +%s%N 2>/dev/null | md5sum 2>/dev/null | head -c 8 || echo "unknown")
JSON_OUTPUT=false
if [[ " $* " == *" --json "* ]]; then
  JSON_OUTPUT=true
fi

DEBUG_MODE=false
if [[ " $* " == *" --debug "* || " $* " == *" --verbose "* || " $* " == *" -v "* ]]; then
  DEBUG_MODE=true
fi

output_json() {
  local success="$1"
  local code="$2"
  local extra_json="${3:-}"
  
  local json="{"
  json+="\"operation_id\": \"$OPERATION_ID\","
  json+="\"success\": $success,"
  json+="\"code\": \"$code\""
  if [[ -n "$extra_json" ]]; then
    json+=",$extra_json"
  fi
  json+="}"
  
  # When outputting JSON, we MUST only output JSON to stdout.
  # So we print it to stdout, and anything else should go to stderr or /dev/null
  echo "$json"
}

stream_progress() {
  if [[ "$JSON_OUTPUT" == "true" ]]; then
    echo "PROGRESS: $1" >&2
  else
    echo -e "${CYAN}➜ $1${NC}" >&2
  fi
}

ensure_env_variables() {
  local env_file="${INSTALL_DIR}/.env"
  if [[ -f "$env_file" ]]; then
    if ! grep -q "^PANEL_PROTOCOL=" "$env_file"; then update_env "PANEL_PROTOCOL" "http"; fi
    if ! grep -q "^SSL_ENABLED=" "$env_file"; then update_env "SSL_ENABLED" "false"; fi
    if ! grep -q "^SSL_PROVIDER=" "$env_file"; then update_env "SSL_PROVIDER" "none"; fi
    if ! grep -q "^PANEL_DOMAIN=" "$env_file"; then
      local current_domain
      current_domain=$(grep "^DOMAIN=" "$env_file" | cut -d= -f2 || echo "localhost")
      update_env "PANEL_DOMAIN" "$current_domain"
    fi
  fi
}

ensure_env_variables

verify_dns() {
  local domain="$1"
  if [[ "$domain" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || [[ "$domain" == "localhost" ]]; then
    stream_progress "Skipping DNS verification for IP/localhost: $domain"
    return 0
  fi

  stream_progress "Verifying DNS resolution for $domain..."
  if ! host "$domain" >/dev/null 2>&1 && ! dig +short "$domain" >/dev/null 2>&1 && ! getent hosts "$domain" >/dev/null 2>&1; then
    stream_progress "DNS check failed: $domain does not resolve."
    return 1
  fi
  stream_progress "DNS verification passed"
  return 0
}

verify_port_80() {
  stream_progress "Checking if port 80 is available..."
  local port_in_use=false
  if command -v ss &>/dev/null; then
    if ss -tuln | grep -q ":80 "; then port_in_use=true; fi
  elif command -v netstat &>/dev/null; then
    if netstat -tuln | grep -q ":80 "; then port_in_use=true; fi
  fi

  if [[ "$port_in_use" == true ]]; then
    local holding_process
    holding_process=$(lsof -i :80 -t 2>/dev/null | xargs ps -o comm= -p 2>/dev/null | head -n 1 || echo "")
    if [[ "$holding_process" == "docker" || "$holding_process" == "docker-proxy" ]]; then
      stream_progress "Detected process: ${holding_process}"
      stream_progress "Decision: Expected Docker process. Continuing..."
      return 0
    elif [[ "$holding_process" != "" ]]; then
      stream_progress "Detected process: ${holding_process}"
      stream_progress "Decision: External process detected. Cannot continue with SSL on port 80."
      return 1
    else
      stream_progress "Port 80 is occupied by an unknown process. Cannot continue with SSL on port 80."
      return 1
    fi
  fi
  stream_progress "Port 80 is available"
  return 0
}


LOCKFILE="/tmp/hmpanel_ssl.lock"

acquire_ssl_lock() {
  if [[ -f "$LOCKFILE" ]]; then
    local pid
    pid=$(cat "$LOCKFILE" 2>/dev/null || echo "")
    if [[ -n "$pid" && "$pid" != "$$" ]] && kill -0 "$pid" 2>/dev/null; then
      if [[ "${JSON_OUTPUT:-}" == "true" ]]; then
        output_json false "SSL_OPERATION_IN_PROGRESS" "\"reason\":\"SSL operation already in progress (PID $pid).\""
        exit 49
      else
        echo -e "${RED}✘ SSL operation already in progress (PID $pid).${NC}"
        exit 1
      fi
    fi
  fi
  echo "$$" > "$LOCKFILE"
  # Set trap to clean up on exit
  trap 'rm -f "$LOCKFILE"' EXIT
}

reload_nginx() {
  local domain="${PANEL_DOMAIN:-${DOMAIN:-localhost}}"
  docker exec \
    -e APP_PORT="${APP_PORT:-3000}" \
    -e BACKEND_PORT="${BACKEND_PORT:-4000}" \
    -e PANEL_DOMAIN="$domain" \
    hmpanel-nginx sh -c "
      sh /etc/nginx/generate_config.sh && nginx -t && nginx -s reload
    " >/dev/null 2>&1 || docker restart hmpanel-nginx >/dev/null 2>&1
}

reload_nginx_deferred() {
  (sleep 2 && reload_nginx) >/dev/null 2>&1 &
}


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

HEADLESS="${HEADLESS:-false}"

pause() {
  if [[ "$HEADLESS" == "true" ]]; then
    return
  fi
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
  if docker exec hmpanel-panel sh -c 'test -f /app/VERSION' &>/dev/null; then
    app_version=$(docker exec hmpanel-panel sh -c 'tr -d "\r\n" < /app/VERSION' 2>/dev/null | tr -d '\r')
  elif docker exec hmpanel-panel printenv APP_VERSION &>/dev/null; then
    app_version=$(docker exec hmpanel-panel printenv APP_VERSION 2>/dev/null | tr -d '\r')
  elif docker exec hmpanel-panel node -p "require('./package.json').version" >/dev/null 2>&1; then
    app_version=$(docker exec hmpanel-panel node -p "require('./package.json').version" | tr -d '\r')
  elif docker inspect hmpanel-panel >/dev/null 2>&1; then
    # Fallback to checking image tag if container is down or node fails
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
  echo -e "${BOLD}--- Update HMPanel ---${NC}\n"
  echo "Downloading master updater from GitHub..."
  if curl -fsSL https://raw.githubusercontent.com/neoauroraproject/hmpanel/main/update.sh | bash; then
    echo -e "${GREEN}✔ Update complete!${NC}"
  else
    echo -e "${RED}✘ Update failed!${NC}"
  fi
  pause
}

do_backup() {
  local backup_type="${1:-full}" # full, database, config
  local silent="${2:-false}"
  
  local app_ver="unknown"
  if [[ -f "${INSTALL_DIR}/VERSION" ]]; then
    app_ver=$(tr -d '\r\n' < "${INSTALL_DIR}/VERSION")
  elif [[ -f "${INSTALL_DIR}/package.json" ]]; then
    app_ver=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "${INSTALL_DIR}/package.json" | head -n 1)
    app_ver="${app_ver:-unknown}"
  fi
  
  local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  local filename="backup_${backup_type}_$(date +%F_%H-%M-%S).tar.gz"
  local filepath="${BACKUP_DIR}/${filename}"
  
  local temp_dir=$(mktemp -d)
  
  if [[ "$silent" != "true" ]]; then echo "Creating $backup_type backup..."; fi
  
  local checksums=""
  
  if [[ "$backup_type" == "database" || "$backup_type" == "full" ]]; then
    if [[ "$silent" != "true" ]]; then echo " -> Exporting database..."; fi
    if docker exec hmpanel-postgres pg_dumpall -c -U panel_user | gzip > "${temp_dir}/database.sql.gz"; then
      local db_sum=$(sha256sum "${temp_dir}/database.sql.gz" | awk '{print $1}')
      checksums+="\"database.sql.gz\": \"$db_sum\""
    else
      if [[ "$silent" != "true" ]]; then echo -e "${RED}✘ Database export failed.${NC}"; fi
      rm -rf "$temp_dir"
      return 1
    fi
  fi
  
  if [[ "$backup_type" == "config" || "$backup_type" == "full" ]]; then
    if [[ "$silent" != "true" ]]; then echo " -> Archiving configuration..."; fi
    local conf_temp=$(mktemp -d)
    cp "${INSTALL_DIR}/.env" "$conf_temp/" 2>/dev/null || true
    cp -r "${INSTALL_DIR}/nginx" "$conf_temp/" 2>/dev/null || true
    tar -czf "${temp_dir}/config.tar.gz" -C "$conf_temp" .
    rm -rf "$conf_temp"
    
    local conf_sum=$(sha256sum "${temp_dir}/config.tar.gz" | awk '{print $1}')
    if [[ -n "$checksums" ]]; then checksums+=", "; fi
    checksums+="\"config.tar.gz\": \"$conf_sum\""
  fi
  
  cat > "${temp_dir}/manifest.json" <<EOF
{
  "version": "$app_ver",
  "schemaVersion": "1",
  "timestamp": "$timestamp",
  "type": "$backup_type",
  "domain": "${PANEL_DOMAIN:-localhost}",
  "checksums": {
    $checksums
  }
}
EOF

  tar -czf "$filepath" -C "$temp_dir" .
  rm -rf "$temp_dir"
  
  if [[ "$silent" != "true" ]]; then
    echo -e "${GREEN}✔ Backup completed successfully!${NC}"
    echo -e "Saved to: ${CYAN}${filepath}${NC}"
  fi
  echo "$filepath"
  return 0
}

cmd_backup() {
  echo -e "${BOLD}--- Create Backup ---${NC}\n"
  echo "1. Full Backup (Database + Config)"
  echo "2. Database Only"
  echo "3. Configuration Only"
  echo "0. Cancel"
  read -rp "Select backup type: " btype
  
  case $btype in
    1) do_backup "full" "false" ;;
    2) do_backup "database" "false" ;;
    3) do_backup "config" "false" ;;
    *) echo "Cancelled." ;;
  esac
  pause
}

do_restore() {
  local filepath="$1"
  local silent="${2:-false}"
  
  if [[ ! -f "$filepath" ]]; then
    if [[ "$silent" != "true" ]]; then echo -e "${RED}✘ File not found: ${filepath}${NC}"; fi
    return 1
  fi
  
  local temp_dir=$(mktemp -d)
  
  if [[ "$filepath" == *.sql || "$filepath" == *.sql.gz ]]; then
    # Legacy Restore
    if [[ "$silent" != "true" ]]; then echo "Legacy SQL backup detected. Proceeding with database restore..."; fi
    if [[ "$filepath" == *.sql.gz ]]; then
      zcat "$filepath" | docker exec -i hmpanel-postgres psql -U panel_user -d panel_db >/dev/null 2>&1
    else
      cat "$filepath" | docker exec -i hmpanel-postgres psql -U panel_user -d panel_db >/dev/null 2>&1
    fi
    local ret=$?
    rm -rf "$temp_dir"
    if [[ $ret -eq 0 ]]; then
      if [[ "$silent" != "true" ]]; then echo -e "${GREEN}✔ Legacy restore completed successfully!${NC}"; fi
      return 0
    else
      if [[ "$silent" != "true" ]]; then echo -e "${RED}✘ Legacy restore failed.${NC}"; fi
      return 1
    fi
  fi
  
  # New Tar.gz Restore (Transactional)
  tar -xzf "$filepath" -C "$temp_dir"
  if [[ ! -f "${temp_dir}/manifest.json" ]]; then
    if [[ "$silent" != "true" ]]; then echo -e "${RED}✘ Invalid backup format: missing manifest.json${NC}"; fi
    rm -rf "$temp_dir"
    return 1
  fi
  
  local btype=$(sed -n 's/.*"type": *"\([^"]*\)".*/\1/p' "${temp_dir}/manifest.json" | head -n 1)
  btype="${btype:-unknown}"
  if [[ "$silent" != "true" ]]; then echo "Starting transactional restore ($btype)..."; fi
  
  # 1. Create Rollback Backup
  if [[ "$silent" != "true" ]]; then echo "Creating automatic rollback backup..."; fi
  local rollback_file=$(do_backup "full" "true")
  if [[ -z "$rollback_file" || ! -f "$rollback_file" ]]; then
    if [[ "$silent" != "true" ]]; then echo -e "${RED}✘ Failed to create rollback backup. Restore aborted.${NC}"; fi
    rm -rf "$temp_dir"
    return 1
  fi
  
  # 2. Execute Restore
  local restore_failed=0
  
  if [[ -f "${temp_dir}/database.sql.gz" ]]; then
    if [[ "$silent" != "true" ]]; then echo "Restoring database..."; fi
    if ! zcat "${temp_dir}/database.sql.gz" | docker exec -i hmpanel-postgres psql -U panel_user -d panel_db >/dev/null 2>&1; then
      if [[ "$silent" != "true" ]]; then echo -e "${RED}✘ Database restore failed.${NC}"; fi
      restore_failed=1
    fi
  fi
  
  if [[ $restore_failed -eq 0 && -f "${temp_dir}/config.tar.gz" ]]; then
    if [[ "$silent" != "true" ]]; then echo "Restoring configuration..."; fi
    tar -xzf "${temp_dir}/config.tar.gz" -C "${INSTALL_DIR}"
    docker restart hmpanel-nginx >/dev/null 2>&1 || true
    docker restart hmpanel-panel hmpanel-app >/dev/null 2>&1 || true
    sleep 3
  fi
  
  # 3. Verify
  if [[ $restore_failed -eq 0 ]]; then
    if [[ "$silent" != "true" ]]; then echo "Verifying end-to-end health..."; fi
    # Simple check for now, backend should be up
    if ! curl -s --connect-timeout 5 "http://localhost:3000/api/health" | grep -q "ok"; then
      if [[ "$silent" != "true" ]]; then echo -e "${RED}✘ Health verification failed!${NC}"; fi
      restore_failed=1
    fi
  fi
  
  # 4. Commit or Rollback
  if [[ $restore_failed -eq 1 ]]; then
    if [[ "$silent" != "true" ]]; then echo -e "${YELLOW}Rolling back to previous state...${NC}"; fi
    # Recursively call do_restore with rollback file
    do_restore "$rollback_file" "true"
    if [[ "$silent" != "true" ]]; then echo -e "${RED}✘ Restore failed and rollback was applied.${NC}"; fi
    rm -rf "$temp_dir"
    return 1
  else
    if [[ "$silent" != "true" ]]; then echo -e "${GREEN}✔ Restore completed and verified!${NC}"; fi
    rm -rf "$temp_dir"
    return 0
  fi
}

cmd_restore() {
  echo -e "${BOLD}--- Restore Backup ---${NC}\n"
  echo "Available backups in ${BACKUP_DIR}:"
  ls -1 "${BACKUP_DIR}"/*.sql "${BACKUP_DIR}"/*.tar.gz 2>/dev/null | awk -F/ '{print " - " $NF}' || echo "  (No backups found)"
  
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

  echo -e "${YELLOW}⚠ WARNING: Restoring will overwrite the current installation entirely!${NC}"
  read -rp "Are you absolutely sure? [y/N]: " confirm
  if [[ "${confirm,,}" != "y" ]]; then
    echo "Restore cancelled."
    pause
    return
  fi

  do_restore "$filepath" "false"
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

verify_nginx_status() {
  local container_name="hmpanel-nginx"
  local is_recheck="${1:-false}"
  local status
  status=$(docker inspect -f '{{.State.Status}}' "$container_name" 2>/dev/null || echo "missing")

  if [[ "$status" == "restarting" || "$status" != "running" ]]; then
    stream_progress "Nginx container failed to start (Status: $status)."
    if [[ "$is_recheck" == "true" ]]; then
      stream_progress "Nginx failed to start even in HTTP-only mode. Manual intervention required."
      return 1
    fi
    stream_progress "Automatically falling back to HTTP..."
    ssl_fallback_to_http "Nginx container startup failure"
    sleep 3
    verify_nginx_status "true"
    return $?
  fi

  stream_progress "Verifying Nginx configuration and endpoints..."
  local config_valid=false
  if docker exec "$container_name" nginx -t >/dev/null 2>&1; then
    config_valid=true
  fi

  local curl_success=false
  for i in {1..15}; do
    local code_https code_http
    code_https=$(curl -s -o /dev/null -w "%{http_code}" -k --resolve "${PANEL_DOMAIN}:443:127.0.0.1" "https://${PANEL_DOMAIN}/api/health" || echo "000")
    code_http=$(curl -s -o /dev/null -w "%{http_code}" --resolve "${PANEL_DOMAIN}:80:127.0.0.1" "http://${PANEL_DOMAIN}/api/health" || echo "000")
    
    if [[ "$code_https" == "200" || "$code_http" == "200" ]]; then
      curl_success=true
      break
    fi
    sleep 2
  done

  if [[ "$config_valid" == true ]]; then
    if [[ "$curl_success" == false ]]; then
      stream_progress "Nginx is running with valid config, but API health is unreachable (Code: HTTPS $code_https / HTTP $code_http). Preserving SSL."
    else
      stream_progress "Nginx is running and endpoints are healthy"
    fi
    return 0
  fi

  if [[ "$curl_success" == false && "$config_valid" == false ]]; then
    stream_progress "Nginx config test failed and API is unreachable."
    if [[ "$is_recheck" == "true" ]]; then
      stream_progress "Endpoints unreachable even in HTTP-only mode. Manual intervention required."
      return 1
    fi
    stream_progress "Automatically falling back to HTTP..."
    ssl_fallback_to_http "Nginx endpoints unreachable with SSL configuration"
    sleep 3
    verify_nginx_status "true"
    return $?
  fi

  stream_progress "Nginx is running and endpoints are healthy"
  return 0
}

ssl_fallback_to_http() {
  local reason="${1:-Unknown SSL failure}"
  echo -e "${RED}✘ SSL failed: ${reason}${NC}" >&2
  
  # Critical fix: Remove certificates to prevent nginx from picking them up on next restart/repair
  rm -f "${INSTALL_DIR}/nginx/ssl/fullchain.pem" "${INSTALL_DIR}/nginx/ssl/privkey.pem" 2>/dev/null || true

  # On failure during issuance, we do not touch certificates.
  # We merely ensure Nginx runs in HTTP mode or falls back to the previous config.
  local domain="${PANEL_DOMAIN:-${DOMAIN:-localhost}}"
  docker exec \
    -e APP_PORT="${APP_PORT:-3000}" \
    -e BACKEND_PORT="${BACKEND_PORT:-4000}" \
    -e PANEL_DOMAIN="$domain" \
    hmpanel-nginx sh -c "
      envsubst '\$APP_PORT \$BACKEND_PORT \$PANEL_DOMAIN' < /etc/nginx/nginx.conf.http.template > /etc/nginx/nginx.conf && nginx -s reload
    " >/dev/null 2>&1 || true
}

ssl_issue() {
  acquire_ssl_lock
  if [[ "$JSON_OUTPUT" != "true" ]]; then
    echo -e "${BOLD}--- Issue / Renew SSL ---${NC}\n"
  fi

  stream_progress "Verifying system dependencies..."
  local missing_deps=()
  for dep in git curl socat; do
    if ! command -v "$dep" &>/dev/null; then
      missing_deps+=("$dep")
    fi
  done

  if [[ ${#missing_deps[@]} -gt 0 ]]; then
    if [[ "$JSON_OUTPUT" == "true" ]]; then
      local deps_json=""
      for dep in "${missing_deps[@]}"; do
        if [[ -n "$deps_json" ]]; then deps_json+=","; fi
        deps_json+="\"$dep\""
      done
      output_json false "MISSING_DEPENDENCIES" "\"missing\":[$deps_json]"
      exit 40
    else
      echo -e "${RED}✗ Error: Missing required system dependencies: ${missing_deps[*]}${NC}" >&2
      exit 1
    fi
  fi

  local override_domain="${PANEL_DOMAIN:-}"
  local override_email="${ADMIN_EMAIL:-}"
  source "${INSTALL_DIR}/.env"
  if [[ -n "$override_domain" ]]; then PANEL_DOMAIN="$override_domain"; fi
  if [[ -n "$override_email" ]]; then ADMIN_EMAIL="$override_email"; fi

  if [[ -z "${PANEL_DOMAIN:-}" || "$PANEL_DOMAIN" == "localhost" || "$PANEL_DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    if [[ "$JSON_OUTPUT" == "true" ]]; then
      output_json false "INVALID_DOMAIN"
      exit 30
    else
      echo -e "${YELLOW}⚠ IP address or localhost detected (${PANEL_DOMAIN:-None}). Skipping SSL workflow entirely.${NC}"
      exit 1
    fi
  fi

  stream_progress "Checking DNS..."
  if ! verify_dns "$PANEL_DOMAIN"; then
    if [[ "$JSON_OUTPUT" == "true" ]]; then
      output_json false "DNS_ERROR"
      exit 10
    else
      echo -e "${RED}✘ DNS verification failed for $PANEL_DOMAIN${NC}" >&2
      exit 1
    fi
  fi
  
  stream_progress "Checking Port..."
  if ! verify_port_80; then
    if [[ "$JSON_OUTPUT" == "true" ]]; then
      output_json false "PORT_BUSY"
      exit 11
    else
      echo -e "${RED}✘ Port 80 is occupied${NC}" >&2
      exit 1
    fi
  fi

  stream_progress "Preparing environment..."
  docker stop hmpanel-nginx >/dev/null 2>&1 || true

  local cert_obtained=false
  local provider="none"
  local SSL_DIR="${INSTALL_DIR}/nginx/ssl"

  local acme_bin=""
  if [[ -f "${INSTALL_DIR}/acme.sh/acme.sh" ]]; then
    acme_bin="${INSTALL_DIR}/acme.sh/acme.sh"
  elif [[ -f "/root/.acme.sh/acme.sh" ]]; then
    acme_bin="/root/.acme.sh/acme.sh"
  elif [[ -f "$HOME/.acme.sh/acme.sh" ]]; then
    acme_bin="$HOME/.acme.sh/acme.sh"
  elif command -v acme.sh &>/dev/null; then
    acme_bin=$(command -v acme.sh)
  fi

  # ACME (Let's Encrypt / ZeroSSL)
  if command -v git &>/dev/null && command -v curl &>/dev/null && command -v socat &>/dev/null; then
    if [[ -z "$acme_bin" ]]; then
      stream_progress "Installing acme.sh..."
      rm -rf /tmp/acme.sh
      local clone_success=false
      if command -v timeout &>/dev/null; then
        if timeout 45 git clone --depth 1 https://github.com/acmesh-official/acme.sh.git /tmp/acme.sh >/dev/null 2>&1; then
          clone_success=true
        elif timeout 45 git clone --depth 1 https://gitee.com/neilpang/acme.sh.git /tmp/acme.sh >/dev/null 2>&1; then
          clone_success=true
        fi
      else
        if git clone --depth 1 https://github.com/acmesh-official/acme.sh.git /tmp/acme.sh >/dev/null 2>&1; then
          clone_success=true
        elif git clone --depth 1 https://gitee.com/neilpang/acme.sh.git /tmp/acme.sh >/dev/null 2>&1; then
          clone_success=true
        fi
      fi

      if [[ "$clone_success" == true ]]; then
        (
          cd /tmp/acme.sh
          ./acme.sh --install \
            --home "${INSTALL_DIR}/acme.sh" \
            --config-home "${INSTALL_DIR}/acme.sh/data" \
            --accountemail "${ADMIN_EMAIL:-admin@$PANEL_DOMAIN}" >/dev/null 2>&1
        ) || true
        rm -rf /tmp/acme.sh
        if [[ -f "${INSTALL_DIR}/acme.sh/acme.sh" ]]; then
          acme_bin="${INSTALL_DIR}/acme.sh/acme.sh"
        fi
      else
        stream_progress "acme.sh download failed, proceeding to fallback..."
      fi
    fi
  fi

  if [[ -n "$acme_bin" ]]; then
    for ca in "letsencrypt" "zerossl"; do
      if [[ "$cert_obtained" == false ]]; then
        stream_progress "Trying acme.sh ($ca)..."
        "$acme_bin" --home "${INSTALL_DIR}/acme.sh" --set-default-ca --server "$ca" >/dev/null 2>&1
        
        local issue_success=false
        if command -v timeout &>/dev/null; then
          if timeout 90 "$acme_bin" --home "${INSTALL_DIR}/acme.sh" --issue -d "$PANEL_DOMAIN" --standalone >/dev/null 2>&1; then
            issue_success=true
          fi
        else
          if "$acme_bin" --home "${INSTALL_DIR}/acme.sh" --issue -d "$PANEL_DOMAIN" --standalone >/dev/null 2>&1; then
            issue_success=true
          fi
        fi

        if [[ "$issue_success" == true ]]; then
          "$acme_bin" --home "${INSTALL_DIR}/acme.sh" --install-cert -d "$PANEL_DOMAIN" \
            --fullchain-file "${SSL_DIR}/fullchain.pem" \
            --key-file "${SSL_DIR}/privkey.pem" >/dev/null 2>&1
          cert_obtained=true
          provider="$ca"
          stream_progress "Certificate issued successfully via $ca"
        else
          stream_progress "acme.sh ($ca) failed or timed out..."
        fi
      fi
    done
  fi

  # Certbot fallback
  if [[ "$cert_obtained" == false ]]; then
    stream_progress "Trying Certbot..."
    local certbot_exit=1
    if command -v certbot &>/dev/null; then
      if command -v timeout &>/dev/null; then
        timeout 120 certbot certonly --standalone --non-interactive --agree-tos -m "admin@$PANEL_DOMAIN" -d "$PANEL_DOMAIN" >/dev/null 2>&1
        certbot_exit=$?
      else
        certbot certonly --standalone --non-interactive --agree-tos -m "admin@$PANEL_DOMAIN" -d "$PANEL_DOMAIN" >/dev/null 2>&1
        certbot_exit=$?
      fi
    else
      if command -v timeout &>/dev/null; then
        timeout 180 docker run --rm -p 80:80 -v "${SSL_DIR}:/etc/letsencrypt" certbot/certbot certonly --standalone --non-interactive --agree-tos -m "admin@$PANEL_DOMAIN" -d "$PANEL_DOMAIN" >/dev/null 2>&1
        certbot_exit=$?
      else
        docker run --rm -p 80:80 -v "${SSL_DIR}:/etc/letsencrypt" certbot/certbot certonly --standalone --non-interactive --agree-tos -m "admin@$PANEL_DOMAIN" -d "$PANEL_DOMAIN" >/dev/null 2>&1
        certbot_exit=$?
      fi
    fi

    if [[ $certbot_exit -eq 0 ]]; then
      if [[ -f "/etc/letsencrypt/live/${PANEL_DOMAIN}/privkey.pem" ]]; then
        cp "/etc/letsencrypt/live/${PANEL_DOMAIN}/privkey.pem" "${SSL_DIR}/privkey.pem"
        cp "/etc/letsencrypt/live/${PANEL_DOMAIN}/fullchain.pem" "${SSL_DIR}/fullchain.pem"
      elif [[ -f "${SSL_DIR}/live/${PANEL_DOMAIN}/privkey.pem" ]]; then
        cp "${SSL_DIR}/live/${PANEL_DOMAIN}/privkey.pem" "${SSL_DIR}/privkey.pem"
        cp "${SSL_DIR}/live/${PANEL_DOMAIN}/fullchain.pem" "${SSL_DIR}/fullchain.pem"
      fi
      cert_obtained=true
      provider="certbot"
      stream_progress "Certificate issued successfully via Certbot"
    else
      stream_progress "Certbot failed or timed out..."
    fi
  fi

  docker start hmpanel-nginx >/dev/null 2>&1 || true

  if [[ "$cert_obtained" == true ]]; then
    update_env "SSL_PROVIDER" "$provider"
    update_env "DOMAIN" "$PANEL_DOMAIN"
    update_env "PANEL_DOMAIN" "$PANEL_DOMAIN"
    
    stream_progress "Reloading Nginx..."
    reload_nginx
    sleep 2
    
    stream_progress "Verifying..."
    if [[ "$JSON_OUTPUT" == "true" ]]; then
      stream_progress "Completed."
      output_json true "SSL_ISSUED" "\"provider\":\"$provider\",\"domain\":\"$PANEL_DOMAIN\""
      exit 0
    else
      verify_nginx_status
    fi
  else
    if [[ "$JSON_OUTPUT" == "true" ]]; then
      output_json false "ACME_FAILED"
      exit 12
    else
      echo -e "${RED}✘ Certificate issuance failed.${NC}"
      exit 1
    fi
  fi
  pause
}

ssl_selfsigned() {
  acquire_ssl_lock
  local domain="${1:-localhost}"
  if [[ "$JSON_OUTPUT" != "true" ]]; then
    echo -e "${BOLD}--- Generating Self-Signed SSL ---${NC}\n"
  fi
  local SSL_DIR="${INSTALL_DIR}/nginx/ssl"
  
  docker stop hmpanel-nginx >/dev/null 2>&1 || true

  openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout "${SSL_DIR}/privkey.pem" \
    -out "${SSL_DIR}/fullchain.pem" \
    -subj "/C=US/ST=State/L=City/O=Organization/CN=${domain}" >/dev/null 2>&1 || true

  if [[ ! -f "${SSL_DIR}/fullchain.pem" ]]; then
    docker run --rm -v "${SSL_DIR}:/ssl" alpine sh -c "apk add --no-cache openssl && openssl req -x509 -nodes -days 3650 -newkey rsa:2048 -keyout /ssl/privkey.pem -out /ssl/fullchain.pem -subj '/C=US/ST=State/L=City/O=Organization/CN=${domain}'" >/dev/null 2>&1 || true
  fi

  docker start hmpanel-nginx >/dev/null 2>&1 || true

  update_env "SSL_PROVIDER" "self-signed"
  reload_nginx
  sleep 2

  if [[ "$JSON_OUTPUT" == "true" ]]; then
    output_json true "SSL_SELFSIGNED" "\"domain\":\"$domain\""
    exit 0
  else
    verify_nginx_status
  fi
  pause
}

ssl_transactional() {
  acquire_ssl_lock
  local action="$1"
  stream_progress "Initiating SSL workflow..."
  
  local issue_code=0
  eval "$action" || issue_code=$?

  if [[ $issue_code -eq 0 ]]; then
    stream_progress "Certificate issued successfully."
    stream_progress "Reloading Nginx..."
    reload_nginx
    
    if verify_nginx_status "true"; then
      stream_progress "Completed."
      exit 0
    else
      stream_progress "Nginx verification failed."
      exit 1
    fi
  else
    stream_progress "SSL workflow action failed."
    exit 1
  fi
}

# ─────────────────────────────────────────────────────────────────
# Verification Engine
# ─────────────────────────────────────────────────────────────────

VERIFY_ENGINE_RESULTS="[]"
VERIFY_ENGINE_SUCCESS="true"
VERIFY_LOG_FILE=""

init_verify_engine() {
  VERIFY_ENGINE_RESULTS="[]"
  VERIFY_ENGINE_SUCCESS="true"
  if [[ "$DEBUG_MODE" == "true" ]]; then
    mkdir -p "${INSTALL_DIR}/logs/ssl"
    VERIFY_LOG_FILE="${INSTALL_DIR}/logs/ssl/ssl_verify_$(date +%Y-%m-%d_%H-%M-%S).log"
    # Rotate logs, keep last 10
    ls -1t "${INSTALL_DIR}/logs/ssl/"*.log 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true
  fi
}

append_verify_result() {
  local step="$1"
  local status="$2"
  local duration="$3"
  local message="$4"
  local details="$5"
  
  local step_json="{\"operation_id\": \"$OPERATION_ID\", \"step\": \"$step\", \"status\": \"$status\", \"durationMs\": $duration, \"message\": \"$message\", \"details\": $details}"
  
  if [[ "$VERIFY_ENGINE_RESULTS" == "[]" ]]; then
    VERIFY_ENGINE_RESULTS="[ $step_json ]"
  else
    VERIFY_ENGINE_RESULTS="${VERIFY_ENGINE_RESULTS%\]}, $step_json ]"
  fi
}

run_verify_wait() {
  local step_name="$1"
  local check_func="$2"
  local max_timeout_sec="${3:-60}"
  local retry_interval_sec="${4:-1}"
  
  local start_time=$(date +%s%3N 2>/dev/null || date +%s000)
  local status="FAIL"
  local message=""
  local details="{}"
  
  VERIFY_STEP_MESSAGE=""
  VERIFY_STEP_DETAILS="{}"
  
  local start_s=$(date +%s)
  local end_time=$(( start_s + max_timeout_sec ))
  
  local passed=false
  while [[ $(date +%s) -lt $end_time ]]; do
    if eval "$check_func"; then
      passed=true
      break
    fi
    sleep "$retry_interval_sec"
  done
  
  local end_time_ms=$(date +%s%3N 2>/dev/null || date +%s000)
  local duration=$(( end_time_ms - start_time ))
  
  if [[ "$passed" == "true" ]]; then
    status="PASS"
    message="${VERIFY_STEP_MESSAGE:-Passed}"
  else
    status="FAIL"
    VERIFY_ENGINE_SUCCESS="false"
    message="${VERIFY_STEP_MESSAGE:-Timeout exceeded ($max_timeout_sec s)}"
  fi
  
  details="${VERIFY_STEP_DETAILS:-{}}"
  
  if [[ -n "$VERIFY_LOG_FILE" ]]; then
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] WAIT_STEP=$step_name STATUS=$status DURATION=${duration}ms MSG=$message" >> "$VERIFY_LOG_FILE"
    echo "DETAILS: $details" >> "$VERIFY_LOG_FILE"
  fi
  
  append_verify_result "$step_name" "$status" "$duration" "$message" "$details"
  
  if [[ "$passed" == "true" ]]; then return 0; else return 1; fi
}

run_verify_step() {
  local step_name="$1"
  local check_func="$2"
  
  local start_time=$(date +%s%3N 2>/dev/null || date +%s000)
  local status="FAIL"
  local message=""
  local details="{}"
  
  VERIFY_STEP_MESSAGE=""
  VERIFY_STEP_DETAILS="{}"
  
  local passed=false
  if eval "$check_func"; then
    passed=true
  fi
  
  local end_time_ms=$(date +%s%3N 2>/dev/null || date +%s000)
  local duration=$(( end_time_ms - start_time ))
  
  if [[ "$passed" == "true" ]]; then
    status="PASS"
    message="${VERIFY_STEP_MESSAGE:-Passed}"
  else
    status="FAIL"
    VERIFY_ENGINE_SUCCESS="false"
    message="${VERIFY_STEP_MESSAGE:-Check failed}"
  fi
  
  details="${VERIFY_STEP_DETAILS:-{}}"
  
  if [[ -n "$VERIFY_LOG_FILE" ]]; then
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] STEP=$step_name STATUS=$status DURATION=${duration}ms MSG=$message" >> "$VERIFY_LOG_FILE"
    echo "DETAILS: $details" >> "$VERIFY_LOG_FILE"
  fi
  
  append_verify_result "$step_name" "$status" "$duration" "$message" "$details"
  
  if [[ "$passed" == "true" ]]; then return 0; else return 1; fi
}

clean_json_val() {
  local input="$1"
  local truncated
  truncated=$(printf "%s" "$input" | cut -c 1-180)
  local clean
  clean=$(printf "%s" "$truncated" | sed 's/<[^>]*>//g' | tr -d '\r' | tr '\n' ' ')
  local escaped
  escaped=$(printf "%s" "$clean" | sed 's/\\/\\\\/g; s/"/\\"/g')
  printf "%s" "$escaped" | sed 's/\\*$//'
}

# ----------------- Verification Modules -----------------

verify_dns() {
  local domain="$1"
  local ip
  ip=$(dig +short "$domain" 2>/dev/null | tail -n1)
  if [[ -n "$ip" ]]; then
    VERIFY_STEP_MESSAGE="Resolved to $ip"
    VERIFY_STEP_DETAILS="{\"resolvedIp\": \"$ip\"}"
    if [[ -n "$VERIFY_LOG_FILE" ]]; then echo "[verify_dns] DNS resolved $domain to $ip" >> "$VERIFY_LOG_FILE"; fi
    return 0
  else
    VERIFY_STEP_MESSAGE="DNS resolution failed"
    if [[ -n "$VERIFY_LOG_FILE" ]]; then echo "[verify_dns] DNS failed for $domain" >> "$VERIFY_LOG_FILE"; fi
    return 1
  fi
}

verify_nginx() {
  local out
  if out=$(docker exec hmpanel-nginx nginx -t 2>&1); then
    VERIFY_STEP_MESSAGE="Nginx config test passed"
    if [[ -n "$VERIFY_LOG_FILE" ]]; then echo "[verify_nginx] $out" >> "$VERIFY_LOG_FILE"; fi
    return 0
  else
    VERIFY_STEP_MESSAGE="Nginx config test failed"
    local esc
    esc=$(clean_json_val "$out")
    VERIFY_STEP_DETAILS="{\"error\": \"$esc\"}"
    if [[ -n "$VERIFY_LOG_FILE" ]]; then echo "[verify_nginx] $out" >> "$VERIFY_LOG_FILE"; fi
    return 1
  fi
}

verify_tcp() {
  local domain="$1"
  if timeout 2 bash -c "</dev/tcp/127.0.0.1/443" 2>/dev/null; then
    VERIFY_STEP_MESSAGE="Port 443 accepting connections locally"
    return 0
  else
    VERIFY_STEP_MESSAGE="Connection refused or timed out on 127.0.0.1:443"
    return 1
  fi
}

verify_https_respond() {
  local domain="$1"
  local out
  if out=$(curl -s -k -o /dev/null -w "%{http_code}" --connect-timeout 2 --resolve "$domain:443:127.0.0.1" "https://$domain" 2>/dev/null); then
    if [[ "$out" != "000" ]]; then
      VERIFY_STEP_MESSAGE="HTTPS responding (HTTP $out)"
      return 0
    fi
  fi
  VERIFY_STEP_MESSAGE="HTTPS not responding"
  return 1
}

verify_tls() {
  local domain="$1"
  local out
  out=$(curl -s -k -v -I --connect-timeout 5 --resolve "$domain:443:127.0.0.1" "https://$domain" 2>&1)
  if echo "$out" | grep -q "SSL connection using"; then
    VERIFY_STEP_MESSAGE="TLS connection established"
    if [[ -n "$VERIFY_LOG_FILE" ]]; then 
      echo "[verify_tls] $out" | grep -E "SSL connection|Server certificate" >> "$VERIFY_LOG_FILE"
      echo | openssl s_client -connect "127.0.0.1:443" -servername "${domain}" 2>/dev/null | openssl x509 -noout -subject -issuer -dates >> "$VERIFY_LOG_FILE"
    fi
    return 0
  else
    VERIFY_STEP_MESSAGE="TLS handshake failed"
    local esc
    esc=$(clean_json_val "$out")
    VERIFY_STEP_DETAILS="{\"error\": \"$esc\"}"
    if [[ -n "$VERIFY_LOG_FILE" ]]; then echo "[verify_tls] ERROR: $out" >> "$VERIFY_LOG_FILE"; fi
    return 1
  fi
}

verify_http_redirect() {
  local domain="$1"
  local out
  out=$(curl -s -I -o /dev/null -w "%{http_code}" --connect-timeout 5 --resolve "$domain:80:127.0.0.1" "http://$domain" 2>/dev/null || echo "000")
  if [[ "$out" == "301" || "$out" == "302" || "$out" == "308" ]]; then
    VERIFY_STEP_MESSAGE="HTTP to HTTPS redirect working"
    VERIFY_STEP_DETAILS="{\"httpCode\": \"$out\"}"
    return 0
  else
    VERIFY_STEP_MESSAGE="HTTP redirect failed (HTTP $out)"
    VERIFY_STEP_DETAILS="{\"httpCode\": \"$out\"}"
    return 1
  fi
}

verify_backend() {
  local domain="$1"
  local out
  out=$(curl -s -k --connect-timeout 5 --resolve "$domain:443:127.0.0.1" "https://$domain/api/health" 2>/dev/null || echo "FAIL")
  if [[ "$out" == *"status"* || "$out" == *"ok"* ]]; then
    VERIFY_STEP_MESSAGE="Backend healthy"
    VERIFY_STEP_DETAILS="{\"response\": \"ok\"}"
    return 0
  else
    VERIFY_STEP_MESSAGE="Backend unreachable"
    local esc
    esc=$(clean_json_val "$out")
    VERIFY_STEP_DETAILS="{\"response\": \"$esc\"}"
    return 1
  fi
}

verify_frontend() {
  local domain="$1"
  local out
  out=$(curl -s -o /dev/null -w "%{http_code}" -k --connect-timeout 5 --resolve "$domain:443:127.0.0.1" "https://$domain" 2>/dev/null || echo "000")
  if [[ "$out" == "200" ]]; then
    VERIFY_STEP_MESSAGE="Frontend reachable"
    VERIFY_STEP_DETAILS="{\"httpCode\": \"$out\"}"
    return 0
  else
    VERIFY_STEP_MESSAGE="Frontend returning HTTP $out"
    VERIFY_STEP_DETAILS="{\"httpCode\": \"$out\"}"
    return 1
  fi
}

verify_subscription() {
  local domain="$1"
  local out
  out=$(curl -s -o /dev/null -w "%{http_code}" -k --connect-timeout 5 --resolve "$domain:443:127.0.0.1" "https://$domain/sub/healthcheck" 2>/dev/null || echo "000")
  if [[ "$out" != "502" && "$out" != "000" ]]; then
    VERIFY_STEP_MESSAGE="Subscription endpoint reachable (HTTP $out)"
    VERIFY_STEP_DETAILS="{\"httpCode\": \"$out\"}"
    return 0
  else
    VERIFY_STEP_MESSAGE="Subscription endpoint failed (HTTP $out)"
    VERIFY_STEP_DETAILS="{\"httpCode\": \"$out\"}"
    return 1
  fi
}

# ----------------- Orchestrator -----------------

verify_e2e_health() {
  local domain="$1"
  stream_progress "Running end-to-end verification for $domain..."
  
  init_verify_engine
  
  if run_verify_wait "NGINX_HEALTH" "verify_nginx" 30 1; then
    run_verify_step "DNS_RESOLUTION" "verify_dns '$domain'"
    
    if run_verify_wait "TCP_443" "verify_tcp '$domain'" 30 1; then
      if run_verify_wait "HTTPS_ENDPOINT" "verify_https_respond '$domain'" 30 1; then
        
        run_verify_step "TLS_HANDSHAKE" "verify_tls '$domain'"
        run_verify_step "HTTP_REDIRECT" "verify_http_redirect '$domain'"
        
        # Wait up to 60s for containers to fully boot and endpoints to respond properly
        run_verify_wait "BACKEND_API" "verify_backend '$domain'" 60 2
        run_verify_wait "FRONTEND_ACCESSIBILITY" "verify_frontend '$domain'" 60 2
        run_verify_wait "SUBSCRIPTION_ENDPOINT" "verify_subscription '$domain'" 60 2
        
      fi
    fi
  fi
  
  if [[ "$VERIFY_ENGINE_SUCCESS" == "true" ]]; then
    stream_progress "End-to-End Verification Passed!"
  else
    stream_progress "End-to-End Verification Failed!"
  fi
  
  echo "{\"success\": $VERIFY_ENGINE_SUCCESS, \"code\": \"VERIFICATION_RESULT\", \"details\": $VERIFY_ENGINE_RESULTS}"
}

ssl_enable() {
  acquire_ssl_lock
  if [[ "$JSON_OUTPUT" != "true" ]]; then
    echo -e "${BOLD}--- Enable HTTPS ---${NC}\n"
  fi
  
  local cert_file="${INSTALL_DIR}/nginx/ssl/fullchain.pem"
  
  if [[ ! -f "$cert_file" ]]; then
    if [[ "$JSON_OUTPUT" == "true" ]]; then
      output_json false "CERTIFICATE_MISSING" "\"reason\":\"Certificate file fullchain.pem not found.\""
      exit 1
    else
      echo -e "${YELLOW}⚠ Certificate missing. Automatically running SSL Issue workflow...${NC}"
      ssl_issue
      return
    fi
  fi

  if [[ "$JSON_OUTPUT" != "true" ]]; then echo "Enabling HTTPS..."; fi
  
  reload_nginx
  
  if [[ "$JSON_OUTPUT" == "true" ]]; then
    output_json true "HTTPS_ENABLED"
    exit 0
  else
    verify_nginx_status
    pause
  fi
}

ssl_disable() {
  acquire_ssl_lock
  if [[ "$JSON_OUTPUT" != "true" ]]; then
    echo -e "${BOLD}--- Disable HTTPS ---${NC}\n"
    echo -e "${YELLOW}⚠ Warning: This will force Nginx back to HTTP mode.${NC}"
    read -rp "Are you sure? [y/N]: " confirm
  else
    confirm="y"
  fi
  
  if [[ "${confirm,,}" == "y" ]]; then
    update_env "SSL_PROVIDER" "none"
    
    local domain="${PANEL_DOMAIN:-${DOMAIN:-localhost}}"
    docker exec \
      -e APP_PORT="${APP_PORT:-3000}" \
      -e BACKEND_PORT="${BACKEND_PORT:-4000}" \
      -e PANEL_DOMAIN="$domain" \
      hmpanel-nginx sh -c "
        envsubst '\$APP_PORT \$BACKEND_PORT \$PANEL_DOMAIN' < /etc/nginx/nginx.conf.http.template > /etc/nginx/nginx.conf && nginx -s reload
      " >/dev/null 2>&1 || docker restart hmpanel-nginx >/dev/null 2>&1
    
    if [[ "$JSON_OUTPUT" == "true" ]]; then
      output_json true "HTTPS_DISABLED"
      exit 0
    else
      echo -e "${GREEN}✔ HTTPS Disabled (HTTP configuration applied).${NC}"
      verify_nginx_status "true"
    fi
  else
    echo "Cancelled."
  fi
  pause
}

ssl_renew() {
  acquire_ssl_lock
  if [[ "$JSON_OUTPUT" != "true" ]]; then
    echo -e "${BOLD}--- Renew Existing Certificate ---${NC}\n"
  fi
  source "${INSTALL_DIR}/.env"
  local provider="${SSL_PROVIDER:-none}"

  if [[ "$provider" == "none" || -z "$provider" ]]; then
    if [[ -f "${INSTALL_DIR}/acme.sh/acme.sh" ]]; then
      provider="letsencrypt"
    elif command -v certbot &>/dev/null; then
      provider="certbot"
    else
      if [[ "$JSON_OUTPUT" == "true" ]]; then
        output_json false "UNKNOWN_PROVIDER"
        exit 30
      else
        echo -e "${RED}✘ Provider unknown and no tools detected. Run Issue SSL instead.${NC}"
        pause
        return
      fi
    fi
  fi

  if [[ "$JSON_OUTPUT" != "true" ]]; then echo "Renewing via $provider..."; fi
  
  local renew_success=false
  local renew_out=""
  
  if [[ "$provider" == "letsencrypt" || "$provider" == "zerossl" ]]; then
    renew_out=$("${INSTALL_DIR}/acme.sh/acme.sh" --home "${INSTALL_DIR}/acme.sh" --renew -d "$PANEL_DOMAIN" --force 2>&1)
    if [[ $? -eq 0 ]]; then renew_success=true; fi
  elif [[ "$provider" == "certbot" ]]; then
    if command -v certbot &>/dev/null; then
      renew_out=$(certbot renew --force-renewal 2>&1)
      if [[ $? -eq 0 ]]; then renew_success=true; fi
    else
      renew_out=$(docker run --rm -v "${INSTALL_DIR}/nginx/ssl:/etc/letsencrypt" certbot/certbot renew --force-renewal 2>&1)
      if [[ $? -eq 0 ]]; then renew_success=true; fi
    fi
  fi

  reload_nginx
  
  if [[ "$JSON_OUTPUT" == "true" ]]; then
    # We must escape newlines for valid JSON
    local escaped_out
    escaped_out=$(echo "$renew_out" | awk '{printf "%s\\n", $0}' | sed 's/"/\\"/g')
    if [[ "$renew_success" == "true" ]]; then
      output_json true "RENEW_SUCCESS" "\"log\":\"$escaped_out\""
      exit 0
    else
      output_json false "RENEW_FAILED" "\"log\":\"$escaped_out\""
      exit 12
    fi
  else
    verify_nginx_status
    pause
  fi
}

ssl_test_dns() {
  echo -e "${BOLD}--- Test Domain & DNS ---${NC}\n"
  source "${INSTALL_DIR}/.env"
  local domain="${PANEL_DOMAIN:-localhost}"
  
  echo -e "Domain: ${CYAN}${domain}${NC}"
  
  local public_ip
  public_ip=$(curl -s https://api.ipify.org || curl -s https://icanhazip.com || echo "Unknown")
  echo -e "Public IP: ${CYAN}${public_ip}${NC}"

  if [[ "$domain" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo -e "DNS A Record: ${CYAN}N/A (IP Address)${NC}"
  else
    local a_record
    a_record=$(dig +short "$domain" 2>/dev/null || host "$domain" | awk '/has address/ {print $4}' | head -n1)
    echo -e "DNS A Record: ${CYAN}${a_record:-Not Found}${NC}"
    if [[ "$a_record" == "$public_ip" && -n "$a_record" ]]; then
      echo -e "Match: ${GREEN}Yes${NC}"
    else
      echo -e "Match: ${RED}No Mismatch${NC}"
    fi
  fi

  echo ""
  verify_port_80
  
  echo "Checking if port 443 is available..."
  if command -v ss &>/dev/null && ss -tuln | grep -q ":443 "; then
    echo -e "${YELLOW}⚠ Port 443 is occupied${NC}"
  else
    echo -e "${GREEN}✔ Port 443 is available${NC}"
  fi
  pause
}

ssl_repair() {
  # Force release lock for repair
  rm -f "/tmp/hmpanel_ssl.lock"
  acquire_ssl_lock
  if [[ "$JSON_OUTPUT" != "true" ]]; then
    echo -e "${BOLD}--- Repair SSL ---${NC}\n"
    echo "Rebuilding configuration..."
  fi
  source "${INSTALL_DIR}/.env"
  local domain="${PANEL_DOMAIN:-${DOMAIN:-localhost}}"
  
  # 1. Rediscover installed certificates
  local cert_file="${INSTALL_DIR}/nginx/ssl/fullchain.pem"
  local key_file="${INSTALL_DIR}/nginx/ssl/privkey.pem"
  local cert_exists=false
  if [[ -f "$cert_file" && -f "$key_file" ]]; then
    cert_exists=true
  fi

  # 2. Detect certificate provider
  local provider="none"
  if [[ "$cert_exists" == "true" ]]; then
    local issuer
    issuer=$(openssl x509 -issuer -noout -in "$cert_file" 2>/dev/null || echo "")
    if [[ "$issuer" == *"Let's Encrypt"* ]]; then
      provider="letsencrypt"
    elif [[ "$issuer" == *"ZeroSSL"* ]]; then
      provider="zerossl"
    elif [[ "$issuer" == *"localhost"* || "$issuer" == *"State"* ]]; then
      provider="self-signed"
    else
      provider="uploaded"
    fi
  fi
  update_env "SSL_PROVIDER" "$provider"

  # 3. Reload Nginx (which dynamically generates HTTP or HTTPS)
  reload_nginx

  # 4. Verify Nginx status
  if verify_nginx_status "true"; then
    if [[ "$JSON_OUTPUT" == "true" ]]; then
      output_json true "REPAIR_SUCCESS" "\"details\":\"Nginx is running and configuration is valid.\""
      exit 0
    else
      echo -e "${GREEN}✔ SSL repaired successfully!${NC}"
    fi
  else
    if [[ "$JSON_OUTPUT" == "true" ]]; then
      output_json false "REPAIR_FAILED" "\"details\":\"Nginx container is not running or configuration is invalid.\""
      exit 1
    else
      echo -e "${RED}✘ Repair failed. Nginx is not running or configuration is invalid.${NC}"
    fi
  fi
  pause
}

ssl_status() {
  echo -e "${BOLD}--- SSL Status ---${NC}\n"
  source "${INSTALL_DIR}/.env"
  
  local cert_file="${INSTALL_DIR}/nginx/ssl/fullchain.pem"
  local key_file="${INSTALL_DIR}/nginx/ssl/privkey.pem"
  local cert_exists=false
  if [[ -f "$cert_file" && -f "$key_file" ]]; then
    cert_exists=true
  fi

  local nginx_ssl=false
  if docker exec hmpanel-nginx cat /etc/nginx/nginx.conf 2>/dev/null | grep -q "listen 443 ssl"; then
    nginx_ssl=true
  fi

  local nginx_server_name=""
  nginx_server_name=$(docker exec hmpanel-nginx cat /etc/nginx/nginx.conf 2>/dev/null | grep "server_name" | grep -v "_" | awk '{print $2}' | tr -d ';' | head -n1)
  
  local is_corrupted=false
  # Consistency validation
  # (Having certificates exist but running HTTP is a valid disabled state, so only check the reverse)
  if [[ "$cert_exists" == "false" && "$nginx_ssl" == true ]]; then
    is_corrupted=true
  fi

  if [[ "$is_corrupted" == "true" ]]; then
    echo -e "${RED}${BOLD}Configuration State Corrupted${NC}"
    echo -e "${RED}The system SSL state is inconsistent. Please run Repair SSL to rebuild it.${NC}\n"
  fi

  echo -e "Desired State:    ${CYAN}${PANEL_PROTOCOL^^}${NC}"
  echo -e "Provider:         ${CYAN}${SSL_PROVIDER}${NC}"
  echo -e "Domain:           ${CYAN}${PANEL_DOMAIN}${NC}"
  
  if [[ "$cert_exists" == "true" ]]; then
    local end_date=$(openssl x509 -enddate -noout -in "$cert_file" 2>/dev/null | cut -d= -f2)
    local expiration_epoch=$(date -d "$end_date" +%s 2>/dev/null)
    local current_epoch=$(date +%s)
    if [[ -n "$expiration_epoch" ]]; then
      local days_left=$(( (expiration_epoch - current_epoch) / 86400 ))
      echo -e "Expiration:       ${CYAN}${end_date}${NC}"
      if [[ $days_left -lt 0 ]]; then
        echo -e "Cert Status:      ${RED}Expired ($((-days_left)) days ago)${NC}"
      else
        echo -e "Cert Status:      ${GREEN}Valid (${days_left} days left)${NC}"
      fi
    fi
    echo -e "Certificate Path: ${CYAN}${cert_file}${NC}"
  else
    echo -e "Cert Status:      ${RED}Missing${NC}"
  fi

  local nginx_status=$(docker inspect -f '{{.State.Status}}' hmpanel-nginx 2>/dev/null || echo "missing")
  if [[ "$nginx_status" == "running" ]]; then
    echo -e "Nginx Status:     ${GREEN}Running${NC}"
  else
    echo -e "Nginx Status:     ${RED}${nginx_status}${NC}"
  fi

  echo -e "\n--- Diagnostics ---"
  
  # DNS check
  local ip=""
  if [[ -n "${PANEL_DOMAIN:-}" && "${PANEL_DOMAIN}" != "localhost" ]]; then
    ip=$(dig +short "$PANEL_DOMAIN" 2>/dev/null | tail -n1)
    if [[ -n "$ip" ]]; then
      printf "%-22s %s\n" "DNS Resolution" "${GREEN}PASS${NC}"
      printf "%-22s %s\n" "Resolved IP" "${CYAN}${ip}${NC}"
    else
      printf "%-22s %s\n" "DNS Resolution" "${RED}FAIL${NC}"
    fi
  else
    printf "%-22s %s\n" "DNS Resolution" "${YELLOW}SKIP (localhost/IP)${NC}"
  fi

  # Expected Server IP
  local public_ip
  public_ip=$(curl -s --connect-timeout 2 https://api.ipify.org || echo "")
  if [[ -n "$public_ip" ]]; then
    printf "%-22s %s\n" "Expected Server IP" "${CYAN}${public_ip}${NC}"
  fi

  # HTTP/HTTPS Virtual Host
  if [[ "$nginx_status" == "running" ]]; then
    if docker exec hmpanel-nginx cat /etc/nginx/nginx.conf 2>/dev/null | grep -q "listen 80"; then
      printf "%-22s %s\n" "HTTP Virtual Host" "${GREEN}PASS${NC}"
    else
      printf "%-22s %s\n" "HTTP Virtual Host" "${RED}FAIL${NC}"
    fi

    if [[ "$nginx_ssl" == "true" ]]; then
      printf "%-22s %s\n" "HTTPS Virtual Host" "${GREEN}PASS${NC}"
    else
      printf "%-22s %s\n" "HTTPS Virtual Host" "${RED}FAIL${NC}"
    fi

    if [[ -n "${PANEL_DOMAIN:-}" && ("$nginx_server_name" == "$PANEL_DOMAIN" || "$nginx_server_name" == "_") ]]; then
      printf "%-22s %s\n" "server_name" "${GREEN}PASS${NC}"
    else
      printf "%-22s %s\n" "server_name" "${RED}FAIL${NC}"
    fi
  else
    printf "%-22s %s\n" "HTTP Virtual Host" "${RED}FAIL${NC}"
    printf "%-22s %s\n" "HTTPS Virtual Host" "${RED}FAIL${NC}"
    printf "%-22s %s\n" "server_name" "${RED}FAIL${NC}"
  fi

  # TCP 80 / 443
  if timeout 2 bash -c "</dev/tcp/127.0.0.1/80" 2>/dev/null; then
    printf "%-22s %s\n" "TCP 80" "${GREEN}PASS${NC}"
  else
    printf "%-22s %s\n" "TCP 80" "${RED}FAIL${NC}"
  fi

  if timeout 2 bash -c "</dev/tcp/127.0.0.1/443" 2>/dev/null; then
    printf "%-22s %s\n" "TCP 443" "${GREEN}PASS${NC}"
  else
    printf "%-22s %s\n" "TCP 443" "${RED}FAIL${NC}"
  fi

  # Cert Existence & Valid
  if [[ "$cert_exists" == "true" ]]; then
    printf "%-22s %s\n" "Certificate Exists" "${GREEN}PASS${NC}"
    local exp_epoch=$(date -d "$end_date" +%s 2>/dev/null)
    local cur_epoch=$(date +%s)
    if [[ -n "$exp_epoch" && $exp_epoch -gt $cur_epoch ]]; then
      printf "%-22s %s\n" "Certificate Valid" "${GREEN}PASS${NC}"
    else
      printf "%-22s %s\n" "Certificate Valid" "${RED}FAIL${NC}"
    fi
  else
    printf "%-22s %s\n" "Certificate Exists" "${RED}FAIL${NC}"
    printf "%-22s %s\n" "Certificate Valid" "${RED}FAIL${NC}"
  fi

  # Nginx Config & Listening 443
  if [[ "$nginx_status" == "running" ]]; then
    if docker exec hmpanel-nginx nginx -t &>/dev/null; then
      printf "%-22s %s\n" "Nginx Config" "${GREEN}PASS${NC}"
    else
      printf "%-22s %s\n" "Nginx Config" "${RED}FAIL${NC}"
    fi

    if docker exec hmpanel-nginx netstat -tuln 2>/dev/null | grep -q ":443 "; then
      printf "%-22s %s\n" "Nginx Listening 443" "${GREEN}PASS${NC}"
    else
      printf "%-22s %s\n" "Nginx Listening 443" "${RED}FAIL${NC}"
    fi
  else
    printf "%-22s %s\n" "Nginx Config" "${RED}FAIL${NC}"
    printf "%-22s %s\n" "Nginx Listening 443" "${RED}FAIL${NC}"
  fi

  # TLS Handshake & Certificate Loaded
  local tls_handshake=false
  if [[ "$nginx_status" == "running" && "$nginx_ssl" == "true" && -n "${PANEL_DOMAIN:-}" ]]; then
    if curl -s -k -v -I --connect-timeout 2 --resolve "${PANEL_DOMAIN}:443:127.0.0.1" "https://${PANEL_DOMAIN}" 2>&1 | grep -q "SSL connection using"; then
      tls_handshake=true
    fi
  fi

  if [[ "$tls_handshake" == "true" ]]; then
    printf "%-22s %s\n" "Certificate Loaded" "${GREEN}PASS${NC}"
    printf "%-22s %s\n" "TLS Handshake" "${GREEN}PASS${NC}"
  else
    printf "%-22s %s\n" "Certificate Loaded" "${RED}FAIL${NC}"
    printf "%-22s %s\n" "TLS Handshake" "${RED}FAIL${NC}"
  fi

  # Health checks
  if curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 "http://127.0.0.1/api/health" | grep -q "200"; then
    printf "%-22s %s\n" "HTTP Health" "${GREEN}PASS${NC}"
  else
    printf "%-22s %s\n" "HTTP Health" "${RED}FAIL${NC}"
  fi

  local https_health=false
  if [[ "$nginx_status" == "running" && "$nginx_ssl" == "true" && -n "${PANEL_DOMAIN:-}" ]]; then
    if curl -s -k -o /dev/null -w "%{http_code}" --connect-timeout 2 --resolve "${PANEL_DOMAIN}:443:127.0.0.1" "https://${PANEL_DOMAIN}/api/health" | grep -q "200"; then
      https_health=true
    fi
  fi

  if [[ "$https_health" == "true" ]]; then
    printf "%-22s %s\n" "HTTPS Health" "${GREEN}PASS${NC}"
  else
    printf "%-22s %s\n" "HTTPS Health" "${RED}FAIL${NC}"
  fi

  if curl -s --connect-timeout 2 "http://panel-app:4000/health" &>/dev/null || curl -s --connect-timeout 2 "http://127.0.0.1:4000/health" &>/dev/null; then
    printf "%-22s %s\n" "Backend" "${GREEN}PASS${NC}"
  else
    printf "%-22s %s\n" "Backend" "${RED}FAIL${NC}"
  fi

  if curl -s --connect-timeout 2 "http://panel-app:3000" &>/dev/null || curl -s --connect-timeout 2 "http://127.0.0.1:3000" &>/dev/null; then
    printf "%-22s %s\n" "Frontend" "${GREEN}PASS${NC}"
  else
    printf "%-22s %s\n" "Frontend" "${RED}FAIL${NC}"
  fi

  # Redirect
  local redirect_ok=false
  if [[ -n "${PANEL_DOMAIN:-}" && "${PANEL_DOMAIN}" != "localhost" ]]; then
    local r_code
    r_code=$(curl -s -I -o /dev/null -w "%{http_code}" --connect-timeout 2 --resolve "${PANEL_DOMAIN}:80:127.0.0.1" "http://${PANEL_DOMAIN}" || echo "000")
    if [[ "$r_code" == "301" || "$r_code" == "302" || "$r_code" == "308" ]]; then
      redirect_ok=true
    fi
  fi
  if [[ "$redirect_ok" == "true" ]]; then
    printf "%-22s %s\n" "Redirect" "${GREEN}PASS${NC}"
  else
    printf "%-22s %s\n" "Redirect" "${RED}FAIL${NC}"
  fi

  pause
}

cmd_ssl() {
  while true; do
    clear
    print_header
    echo -e "${BOLD}--- SSL Management ---${NC}\n"
    echo "  1) Issue / Renew SSL"
    echo "  2) Enable HTTPS"
    echo "  3) Disable HTTPS (HTTP Mode)"
    echo "  4) Renew Existing Certificate"
    echo "  5) Check SSL Status"
    echo "  6) Test Domain & DNS"
    echo "  7) Repair SSL"
    echo "  0) Back to Main Menu"
    echo ""
    read -rp "  Choice: " choice
    echo ""
    
    case $choice in
      1) ssl_issue ;;
      2) ssl_enable ;;
      3) ssl_disable ;;
      4) ssl_renew ;;
      5) ssl_status ;;
      6) ssl_test_dns ;;
      7) ssl_repair ;;
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
    docker system prune -a -f --volumes
    echo -e "${GREEN}✔ Cleanup completed.${NC}"
  else
    echo "Cleanup cancelled."
  fi
  pause
}

cmd_doctor() {
  if [[ "$JSON_OUTPUT" != "true" ]]; then
    echo -e "${BOLD}--- HMPanel Doctor ---${NC}\n"
  fi
  
  local docker_status="missing"
  if command -v docker &>/dev/null; then
    docker_status="running"
    if [[ "$JSON_OUTPUT" != "true" ]]; then echo -e "✓ Docker"; fi
  else
    if [[ "$JSON_OUTPUT" != "true" ]]; then echo -e "✗ Docker"; fi
  fi
  
  local compose_status="missing"
  if docker compose version &>/dev/null; then
    compose_status="installed"
    if [[ "$JSON_OUTPUT" != "true" ]]; then echo -e "✓ Docker Compose"; fi
  else
    if [[ "$JSON_OUTPUT" != "true" ]]; then echo -e "✗ Docker Compose"; fi
  fi
  
  local pg_status="missing"
  if [[ "$(docker inspect -f '{{.State.Status}}' hmpanel-postgres 2>/dev/null)" == "running" ]]; then
    pg_status="running"
    if [[ "$JSON_OUTPUT" != "true" ]]; then echo -e "✓ PostgreSQL"; fi
  else
    if [[ "$JSON_OUTPUT" != "true" ]]; then echo -e "✗ PostgreSQL"; fi
  fi
  
  local redis_status="missing"
  if [[ "$(docker inspect -f '{{.State.Status}}' hmpanel-redis 2>/dev/null)" == "running" ]]; then
    redis_status="running"
    if [[ "$JSON_OUTPUT" != "true" ]]; then echo -e "✓ Redis"; fi
  else
    if [[ "$JSON_OUTPUT" != "true" ]]; then echo -e "✗ Redis"; fi
  fi
  
  local nginx_status="missing"
  if [[ "$(docker inspect -f '{{.State.Status}}' hmpanel-nginx 2>/dev/null)" == "running" ]]; then
    nginx_status="running"
    if [[ "$JSON_OUTPUT" != "true" ]]; then echo -e "✓ Nginx"; fi
  else
    if [[ "$JSON_OUTPUT" != "true" ]]; then echo -e "✗ Nginx"; fi
  fi
  
  local panel_status="missing"
  if [[ "$(docker inspect -f '{{.State.Status}}' hmpanel-panel 2>/dev/null)" == "running" ]]; then
    panel_status="running"
    if [[ "$JSON_OUTPUT" != "true" ]]; then echo -e "✓ Backend"; fi
  else
    if [[ "$JSON_OUTPUT" != "true" ]]; then echo -e "✗ Backend"; fi
  fi
  
  local overall="healthy"
  if [[ "$docker_status" != "running" || "$pg_status" != "running" || "$redis_status" != "running" || "$nginx_status" != "running" || "$panel_status" != "running" ]]; then
    overall="unhealthy"
  fi
  
  if [[ "$JSON_OUTPUT" == "true" ]]; then
    local json_body="\"docker\":\"$docker_status\",\"compose\":\"$compose_status\",\"postgres\":\"$pg_status\",\"redis\":\"$redis_status\",\"nginx\":\"$nginx_status\",\"backend\":\"$panel_status\",\"overall\":\"$overall\""
    output_json true "DOCTOR_REPORT" "$json_body"
    exit 0
  else
    echo -e "\nOverall: ${CYAN}${overall^^}${NC}"
    pause
  fi
}

cmd_version() {
  local app_ver="unknown"
  local schema_ver="unknown"
  
  if [[ -f "${INSTALL_DIR}/VERSION" ]]; then
    app_ver=$(tr -d '\r\n' < "${INSTALL_DIR}/VERSION")
  elif [[ -f "${INSTALL_DIR}/package.json" ]]; then
    app_ver=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "${INSTALL_DIR}/package.json" | head -n 1)
    app_ver="${app_ver:-unknown}"
  fi
  if [[ -f "${INSTALL_DIR}/prisma/schema.prisma" ]]; then
    schema_ver="1" # Placeholder
  fi
  
  if [[ "$JSON_OUTPUT" == "true" ]]; then
    local json_body="\"application\":\"$app_ver\",\"cli\":\"$app_ver\",\"installer\":\"$app_ver\",\"schema\":\"$schema_ver\",\"build\":\"2026-06-30\""
    output_json true "VERSION_REPORT" "$json_body"
    exit 0
  else
    echo -e "${BOLD}--- Version Info ---${NC}\n"
    echo -e "Application: $app_ver"
    echo -e "CLI:         $app_ver"
    echo -e "Installer:   $app_ver"
    pause
  fi
}

# ─────────────────────────────────────────────────────────────────
# Headless Command Parser (for API/Backend integration)
# ─────────────────────────────────────────────────────────────────
if [[ "$JSON_OUTPUT" == "true" || "${1:-}" == "ssl" || "${1:-}" == "doctor" || "${1:-}" == "version" || "${1:-}" == "backup" || "${1:-}" == "restore" ]]; then
  HEADLESS=true
  MODULE="${1:-}"
  ACTION="${2:-}"
  
  if [[ "$MODULE" == "ssl" ]]; then
    case "$ACTION" in
      issue)
        export PANEL_DOMAIN="${3:-}"
        export ADMIN_EMAIL="${4:-}"
        ssl_transactional "ssl_issue"
        ;;
      selfsigned)
        export PANEL_DOMAIN="${3:-}"
        ssl_transactional "ssl_selfsigned ${3:-}"
        ;;
      enable)
        ssl_enable
        ;;
      disable)
        ssl_disable
        ;;
      renew)
        ssl_renew
        ;;
      repair)
        ssl_repair
        ;;
      change-domain)
        export PANEL_DOMAIN="${3:-}"
        export ADMIN_EMAIL="${4:-}"
        ssl_transactional "ssl_issue"
        ;;
      *)
        if [[ "$JSON_OUTPUT" == "true" ]]; then output_json false "UNKNOWN_COMMAND"; exit 1; fi
        echo "Usage: hm ssl {issue <domain> <email> | change-domain <domain> <email> | disable | renew | repair}"
        exit 1
        ;;
    esac
  elif [[ "$MODULE" == "backup" ]]; then
    if [[ "$ACTION" == "create" ]]; then
      btype="${3:-full}"
      do_backup "$btype" "true"
    else
      echo "Usage: hm backup create {full|database|config}"
      exit 1
    fi
  elif [[ "$MODULE" == "restore" ]]; then
    if [[ -n "$ACTION" ]]; then
      do_restore "$ACTION" "true"
    else
      echo "Usage: hm restore <filepath>"
      exit 1
    fi
  elif [[ "$MODULE" == "doctor" ]]; then
    cmd_doctor
  elif [[ "$MODULE" == "version" ]]; then
    cmd_version
  fi
  exit 0
fi

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
