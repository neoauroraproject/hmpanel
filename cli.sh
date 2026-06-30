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
OPERATION_ID=$(tr -dc a-f0-9 </dev/urandom | head -c 8 || echo "unknown")
JSON_OUTPUT=false
if [[ " $* " == *" --json "* ]]; then
  JSON_OUTPUT=true
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
    echo -e "${CYAN}➜ $1${NC}"
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
    echo "Skipping DNS verification for IP/localhost: $domain"
    return 0
  fi

  echo "Verifying DNS resolution for $domain..."
  if ! host "$domain" >/dev/null 2>&1 && ! dig +short "$domain" >/dev/null 2>&1 && ! getent hosts "$domain" >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠ DNS check failed: $domain does not resolve.${NC}"
    return 1
  fi
  echo -e "${GREEN}✔ DNS verification passed${NC}"
  return 0
}

verify_port_80() {
  echo "Checking if port 80 is available..."
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
      echo -e "${CYAN}ℹ Detected process: ${holding_process}${NC}"
      echo -e "${GREEN}✔ Decision: Expected Docker process. Continuing...${NC}"
      return 0
    elif [[ "$holding_process" != "" ]]; then
      echo -e "${YELLOW}⚠ Detected process: ${holding_process}${NC}"
      echo -e "${RED}✘ Decision: External process detected. Cannot continue with SSL on port 80.${NC}"
      return 1
    else
      echo -e "${YELLOW}⚠ Port 80 is occupied by an unknown process. Cannot continue with SSL on port 80.${NC}"
      return 1
    fi
  fi
  echo -e "${GREEN}✔ Port 80 is available${NC}"
  return 0
}

write_http_nginx_template() {
  local target_file="$1"
  local srv_name="${2:-${PANEL_DOMAIN:-${DOMAIN:-_}}}"
  cat > "$target_file" <<'EOF'
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
    use epoll;
    multi_accept on;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;

    sendfile        on;
    tcp_nopush      on;
    tcp_nodelay     on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 50M;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/xml+rss image/svg+xml;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=30r/s;
    limit_req_zone $binary_remote_addr zone=login_limit:10m rate=5r/m;

    upstream backend {
        server panel-app:${BACKEND_PORT};
        keepalive 32;
    }

    upstream frontend {
        server panel-app:${APP_PORT};
        keepalive 32;
    }

    server {
        listen 80;
        server_name SERVER_NAME_PLACEHOLDER;

        # ── Backend API ──────────────────────────────────────────
        location /api/ {
            limit_req zone=api_limit burst=50 nodelay;
            proxy_pass http://backend/;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            proxy_buffering off;
            proxy_read_timeout 600s;
        }

        # ── Frontend Next.js SPA ──────────────────────────────────
        location / {
            proxy_pass http://frontend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
    }
}
EOF
  sed -i "s/SERVER_NAME_PLACEHOLDER/$srv_name/g" "$target_file"
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
  if docker exec hmpanel-panel node -p "require('./package.json').version" >/dev/null 2>&1; then
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

verify_nginx_status() {
  local container_name="hmpanel-nginx"
  local is_recheck="${1:-false}"
  local status
  status=$(docker inspect -f '{{.State.Status}}' "$container_name" 2>/dev/null || echo "missing")

  if [[ "$status" == "restarting" || "$status" != "running" ]]; then
    echo -e "${RED}✘ Nginx container failed to start (Status: $status).${NC}"
    if [[ "$is_recheck" == "true" ]]; then
      echo -e "${RED}✘ Nginx failed to start even in HTTP-only mode. Manual intervention required.${NC}"
      return 1
    fi
    echo -e "${YELLOW}⚠ Automatically falling back to HTTP...${NC}"
    ssl_fallback_to_http "Nginx container startup failure"
    sleep 3
    verify_nginx_status "true"
    return $?
  fi

  echo "Verifying Nginx endpoints..."
  local curl_success=false
  for i in {1..15}; do
    local code_https code_http
    code_https=$(curl -s -o /dev/null -w "%{http_code}" -k "https://127.0.0.1/api/health" || echo "000")
    code_http=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1/api/health" || echo "000")
    
    if [[ "$code_https" == "200" || "$code_http" == "200" ]]; then
      curl_success=true
      break
    fi
    sleep 2
  done

  if [[ "$curl_success" == false ]]; then
    echo -e "${RED}✘ Nginx is running but API health endpoint is unreachable.${NC}"
    if [[ "$is_recheck" == "true" ]]; then
      echo -e "${RED}✘ Endpoints unreachable even in HTTP-only mode. Manual intervention required.${NC}"
      return 1
    fi
    echo -e "${YELLOW}⚠ Automatically falling back to HTTP...${NC}"
    ssl_fallback_to_http "Nginx endpoints unreachable with SSL configuration"
    sleep 3
    verify_nginx_status "true"
    return $?
  fi

  echo -e "${GREEN}✔ Nginx is running and endpoints are healthy${NC}"
  return 0
}

ssl_fallback_to_http() {
  local reason="${1:-Unknown SSL failure}"
  echo -e "${RED}✘ SSL failed: ${reason}${NC}"
  echo -e "${YELLOW}⚠ Falling back to HTTP — panel will be accessible via HTTP${NC}"

  update_env "PANEL_PROTOCOL" "http"
  update_env "SSL_ENABLED" "false"
  update_env "SSL_PROVIDER" "none"
  source "${INSTALL_DIR}/.env"
  update_env "NEXT_PUBLIC_API_URL" "http://${PANEL_DOMAIN}/api"

  if [[ -f "${INSTALL_DIR}/nginx/nginx.conf.template" ]] && ! [[ -f "${INSTALL_DIR}/nginx/nginx.conf.template.ssl" ]]; then
    cp "${INSTALL_DIR}/nginx/nginx.conf.template" "${INSTALL_DIR}/nginx/nginx.conf.template.ssl"
  fi
  write_http_nginx_template "${INSTALL_DIR}/nginx/nginx.conf.template"

  docker compose -f "${INSTALL_DIR}/docker-compose.yml" down nginx >/dev/null 2>&1 || true
  docker compose -f "${INSTALL_DIR}/docker-compose.yml" up -d nginx >/dev/null 2>&1 || true
}

ssl_issue() {
  if [[ "$JSON_OUTPUT" != "true" ]]; then
    echo -e "${BOLD}--- Issue / Renew SSL ---${NC}\n"
  fi
  source "${INSTALL_DIR}/.env"

  if [[ -z "${PANEL_DOMAIN:-}" || "$PANEL_DOMAIN" == "localhost" || "$PANEL_DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    if [[ "$JSON_OUTPUT" == "true" ]]; then
      output_json false "INVALID_DOMAIN"
      exit 30
    else
      echo -e "${YELLOW}⚠ IP address or localhost detected (${PANEL_DOMAIN:-None}). Skipping SSL workflow entirely.${NC}"
      ssl_fallback_to_http "SSL cannot be installed for raw IP addresses or localhost."
      pause
      return
    fi
  fi

  stream_progress "Checking DNS..."
  if ! verify_dns "$PANEL_DOMAIN"; then
    if [[ "$JSON_OUTPUT" == "true" ]]; then
      output_json false "DNS_ERROR"
      exit 10
    else
      ssl_fallback_to_http "DNS verification failed"
      pause
      return
    fi
  fi
  
  stream_progress "Checking Port..."
  if ! verify_port_80; then
    if [[ "$JSON_OUTPUT" == "true" ]]; then
      output_json false "PORT_BUSY"
      exit 11
    else
      ssl_fallback_to_http "Port 80 is occupied"
      pause
      return
    fi
  fi

  stream_progress "Preparing environment..."
  # Stop nginx
  docker stop hmpanel-nginx >/dev/null 2>&1 || true

  local cert_obtained=false
  local provider="none"
  local SSL_DIR="${INSTALL_DIR}/nginx/ssl"

  # ACME (Let's Encrypt / ZeroSSL)
  if command -v git &>/dev/null && command -v curl &>/dev/null && command -v socat &>/dev/null; then
    if [[ ! -d "${INSTALL_DIR}/acme.sh" ]]; then
      stream_progress "Installing acme.sh..."
      if [[ "$JSON_OUTPUT" != "true" ]]; then echo "Installing acme.sh..."; fi
      if git clone https://github.com/acmesh-official/acme.sh.git /tmp/acme.sh >/dev/null 2>&1; then
        (
          cd /tmp/acme.sh
          ./acme.sh --install \
            --home "${INSTALL_DIR}/acme.sh" \
            --config-home "${INSTALL_DIR}/acme.sh/data" \
            --accountemail "${ADMIN_EMAIL:-admin@$PANEL_DOMAIN}" >/dev/null 2>&1
        ) || true
        rm -rf /tmp/acme.sh
      fi
    fi
  fi

  if [[ -f "${INSTALL_DIR}/acme.sh/acme.sh" ]]; then
    for ca in "letsencrypt" "zerossl"; do
      if [[ "$cert_obtained" == false ]]; then
        stream_progress "Issuing Certificate via $ca..."
        echo "Trying acme.sh ($ca)..."
        "${INSTALL_DIR}/acme.sh/acme.sh" --home "${INSTALL_DIR}/acme.sh" --set-default-ca --server "$ca" >/dev/null 2>&1
        if "${INSTALL_DIR}/acme.sh/acme.sh" --home "${INSTALL_DIR}/acme.sh" --issue -d "$PANEL_DOMAIN" --standalone >/dev/null 2>&1; then
          "${INSTALL_DIR}/acme.sh/acme.sh" --home "${INSTALL_DIR}/acme.sh" --install-cert -d "$PANEL_DOMAIN" \
            --fullchain-file "${SSL_DIR}/fullchain.pem" \
            --key-file "${SSL_DIR}/privkey.pem" >/dev/null 2>&1
          cert_obtained=true
          provider="$ca"
          echo -e "${GREEN}✔ Certificate issued successfully via $ca${NC}"
        fi
      fi
    done
  fi

  # Certbot fallback
  if [[ "$cert_obtained" == false ]]; then
    stream_progress "Issuing Certificate via Certbot..."
    echo "Trying Certbot..."
    local certbot_exit=1
    if command -v certbot &>/dev/null; then
      certbot certonly --standalone --non-interactive --agree-tos -m "admin@$PANEL_DOMAIN" -d "$PANEL_DOMAIN" >/dev/null 2>&1
      certbot_exit=$?
    else
      docker run --rm -p 80:80 -v "${SSL_DIR}:/etc/letsencrypt" certbot/certbot certonly --standalone --non-interactive --agree-tos -m "admin@$PANEL_DOMAIN" -d "$PANEL_DOMAIN" >/dev/null 2>&1
      certbot_exit=$?
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
      echo -e "${GREEN}✔ Certificate issued successfully via Certbot${NC}"
    fi
  fi

  if [[ "$cert_obtained" == true ]]; then
    update_env "PANEL_PROTOCOL" "https"
    update_env "SSL_ENABLED" "true"
    update_env "SSL_PROVIDER" "$provider"
    update_env "NEXT_PUBLIC_API_URL" "https://${PANEL_DOMAIN}/api"

    if [[ -f "${INSTALL_DIR}/nginx/nginx.conf.template.ssl" ]]; then
      cp "${INSTALL_DIR}/nginx/nginx.conf.template.ssl" "${INSTALL_DIR}/nginx/nginx.conf.template"
    else
      sed -i 's/# SSL disabled/listen 443 ssl;/' "${INSTALL_DIR}/nginx/nginx.conf.template" 2>/dev/null || true
    fi

    stream_progress "Restarting Nginx..."
    docker start hmpanel-nginx >/dev/null 2>&1 || true
    sleep 2
    
    stream_progress "Verifying..."
    # We won't call verify_nginx_status interactively if in JSON mode
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
      ssl_fallback_to_http "All providers failed"
    fi
  fi
  pause
}

ssl_selfsigned() {
  local domain="${1:-localhost}"
  if [[ "$JSON_OUTPUT" != "true" ]]; then
    echo -e "${BOLD}--- Generating Self-Signed SSL ---${NC}\n"
  fi
  local SSL_DIR="${INSTALL_DIR}/nginx/ssl"
  
  docker stop hmpanel-nginx >/dev/null 2>&1 || true

  openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout "${SSL_DIR}/privkey.pem" \
    -out "${SSL_DIR}/fullchain.pem" \
    -subj "/C=US/ST=State/L=City/O=Organization/CN=${domain}" >/dev/null 2>&1

  update_env "PANEL_PROTOCOL" "https"
  update_env "SSL_ENABLED" "true"
  update_env "SSL_PROVIDER" "self-signed"
  update_env "NEXT_PUBLIC_API_URL" "https://${domain}/api"

  if [[ -f "${INSTALL_DIR}/nginx/nginx.conf.template.ssl" ]]; then
    cp "${INSTALL_DIR}/nginx/nginx.conf.template.ssl" "${INSTALL_DIR}/nginx/nginx.conf.template"
  fi

  docker start hmpanel-nginx >/dev/null 2>&1 || true
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
  local action="$1"
  stream_progress "Initiating Transactional SSL workflow..."
  local SSL_DIR="${INSTALL_DIR}/nginx/ssl"
  local BACKUP_DIR="${INSTALL_DIR}/backups/ssl_rollback_$(date +%s)"
  
  mkdir -p "$BACKUP_DIR"
  cp "${INSTALL_DIR}/.env" "$BACKUP_DIR/.env.backup" 2>/dev/null || true
  cp "${INSTALL_DIR}/nginx/nginx.conf.template" "$BACKUP_DIR/nginx.conf.template.backup" 2>/dev/null || true
  cp -r "$SSL_DIR" "$BACKUP_DIR/ssl_backup" 2>/dev/null || true

  local env_hash_before
  env_hash_before=$(md5sum "${INSTALL_DIR}/.env" 2>/dev/null | awk '{print $1}')

  stream_progress "Attempting to issue certificate..."
  
  local issue_out
  local issue_code=0
  issue_out=$( ( eval "$action" ) ) || issue_code=$?

  local containers_restarted=false

  if [[ $issue_code -eq 0 ]]; then
    stream_progress "Certificate issued successfully."
    
    local env_hash_after
    env_hash_after=$(md5sum "${INSTALL_DIR}/.env" 2>/dev/null | awk '{print $1}')
    
    stream_progress "Reloading Nginx gracefully..."
    docker exec hmpanel-nginx nginx -s reload >/dev/null 2>&1 || docker restart hmpanel-nginx >/dev/null 2>&1
    
    if [[ "$env_hash_before" != "$env_hash_after" ]]; then
      stream_progress "Configuration changed. Restarting application containers..."
      docker restart hmpanel-panel hmpanel-app >/dev/null 2>&1 || true
      containers_restarted=true
    else
      stream_progress "Configuration unchanged. Skipping application restarts."
    fi
    
    if verify_e2e_health "$PANEL_DOMAIN"; then
      echo "$issue_out"
      rm -rf "$BACKUP_DIR"
      exit 0
    fi
    # If verify fails, fall through to rollback
    issue_out="{\"success\":false,\"code\":\"E2E_VERIFY_FAILED\",\"reason\":\"End-to-end verification failed after issuance.\"}"
  fi

  stream_progress "Workflow failed. Rolling back to previous state..."
  
  # Restore backups
  cp "$BACKUP_DIR/.env.backup" "${INSTALL_DIR}/.env" 2>/dev/null || true
  cp "$BACKUP_DIR/nginx.conf.template.backup" "${INSTALL_DIR}/nginx/nginx.conf.template" 2>/dev/null || true
  rm -rf "$SSL_DIR"
  cp -r "$BACKUP_DIR/ssl_backup" "$SSL_DIR" 2>/dev/null || true
  
  stream_progress "Reloading Nginx to apply rollback..."
  docker exec hmpanel-nginx nginx -s reload >/dev/null 2>&1 || docker restart hmpanel-nginx >/dev/null 2>&1
  
  if [[ "$containers_restarted" == "true" ]] || [[ "$issue_code" -ne 0 ]]; then
    stream_progress "Restarting application containers to restore state..."
    docker restart hmpanel-panel hmpanel-app >/dev/null 2>&1 || true
  fi
  
  rm -rf "$BACKUP_DIR"
  
  echo "$issue_out"
  exit 1
}

verify_e2e_health() {
  local domain="$1"
  stream_progress "Running end-to-end verification for $domain..."
  
  # 1. Wait for containers to boot/reload
  sleep 3

  # 2. Verify TLS handshake
  stream_progress "Verifying TLS Handshake..."
  if ! curl -s -k -v -I --connect-timeout 5 "https://$domain" 2>&1 | grep -q "SSL connection using"; then
    stream_progress "TLS Handshake failed!"
    return 1
  fi

  # 3. Verify Certificate Validity
  stream_progress "Verifying Certificate Validity..."
  if ! echo | openssl s_client -connect "${domain}:443" -servername "${domain}" 2>/dev/null | openssl x509 -noout -checkend 0 >/dev/null 2>&1; then
    stream_progress "Certificate validity check failed! Certificate may be expired or invalid."
    return 1
  fi

  # 4. Verify Backend Accessibility
  stream_progress "Verifying Backend API Health..."
  local backend_health
  backend_health=$(curl -s -k --connect-timeout 5 "https://$domain/api/health" || echo "FAIL")
  if [[ "$backend_health" != *"status"* ]] && [[ "$backend_health" != *"ok"* ]]; then
    stream_progress "Backend API Health check failed! Response: $backend_health"
    return 1
  fi

  # 5. Verify Frontend Accessibility
  stream_progress "Verifying Frontend Accessibility..."
  local frontend_status
  frontend_status=$(curl -s -o /dev/null -w "%{http_code}" -k --connect-timeout 5 "https://$domain" || echo "000")
  if [[ "$frontend_status" != "200" ]]; then
    stream_progress "Frontend Accessibility check failed! HTTP Code: $frontend_status"
    return 1
  fi

  # 6. Verify Subscription Proxy Endpoint
  stream_progress "Verifying Subscription Proxy Endpoint..."
  local sub_status
  sub_status=$(curl -s -o /dev/null -w "%{http_code}" -k --connect-timeout 5 "https://$domain/sub/healthcheck" || echo "000")
  if [[ "$sub_status" == "502" ]] || [[ "$sub_status" == "000" ]]; then
    stream_progress "Subscription Proxy routing failed! HTTP Code: $sub_status"
    return 1
  fi

  stream_progress "End-to-End Verification Passed!"
  return 0
}

ssl_enable() {
  echo -e "${BOLD}--- Enable HTTPS ---${NC}\n"
  local cert_file="${INSTALL_DIR}/nginx/ssl/fullchain.pem"
  
  if [[ ! -f "$cert_file" ]]; then
    echo -e "${YELLOW}⚠ Certificate missing. Automatically running SSL Issue workflow...${NC}"
    ssl_issue
    return
  fi

  local end_date
  end_date=$(openssl x509 -enddate -noout -in "$cert_file" 2>/dev/null | cut -d= -f2)
  local expiration_epoch
  expiration_epoch=$(date -d "$end_date" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "$end_date" +%s 2>/dev/null)
  local current_epoch=$(date +%s)
  
  if [[ -n "$expiration_epoch" && $expiration_epoch -lt $current_epoch ]]; then
    echo -e "${YELLOW}⚠ Certificate expired. Automatically renewing...${NC}"
    ssl_renew
    return
  fi

  echo "Enabling HTTPS..."
  update_env "PANEL_PROTOCOL" "https"
  update_env "SSL_ENABLED" "true"
  source "${INSTALL_DIR}/.env"
  update_env "NEXT_PUBLIC_API_URL" "https://${PANEL_DOMAIN}/api"

  if [[ -f "${INSTALL_DIR}/nginx/nginx.conf.template.ssl" ]]; then
    cp "${INSTALL_DIR}/nginx/nginx.conf.template.ssl" "${INSTALL_DIR}/nginx/nginx.conf.template"
  fi

  docker restart hmpanel-nginx >/dev/null 2>&1 || true
  sleep 2
  verify_nginx_status
  pause
}

ssl_disable() {
  if [[ "$JSON_OUTPUT" != "true" ]]; then
    echo -e "${BOLD}--- Disable HTTPS ---${NC}\n"
    echo -e "${YELLOW}⚠ Warning: This will switch the panel to HTTP mode.${NC}"
    read -rp "Are you sure? [y/N]: " confirm
  else
    confirm="y"
  fi
  
  if [[ "${confirm,,}" == "y" ]]; then
    source "${INSTALL_DIR}/.env"
    ssl_fallback_to_http "User explicitly disabled HTTPS"
    if [[ "$JSON_OUTPUT" != "true" ]]; then verify_nginx_status "true"; fi
    
    if [[ "$JSON_OUTPUT" == "true" ]]; then
      output_json true "HTTPS_DISABLED"
      exit 0
    else
      echo -e "${GREEN}✔ HTTPS Disabled.${NC}"
    fi
  else
    echo "Cancelled."
  fi
  pause
}

ssl_renew() {
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

  docker restart hmpanel-nginx >/dev/null 2>&1 || true
  
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
  if [[ "$JSON_OUTPUT" != "true" ]]; then
    echo -e "${BOLD}--- Repair SSL ---${NC}\n"
    echo "Checking configuration..."
  fi
  source "${INSTALL_DIR}/.env"
  if [[ "${SSL_ENABLED}" == "true" ]]; then
    if [[ "$JSON_OUTPUT" != "true" ]]; then echo "Desired State: HTTPS"; fi
    local cert_file="${INSTALL_DIR}/nginx/ssl/fullchain.pem"
    if [[ ! -f "$cert_file" ]]; then
      if [[ "$JSON_OUTPUT" != "true" ]]; then echo -e "${RED}✘ Certificate missing. Trying to reissue...${NC}"; fi
      ssl_issue
      return
    fi
    local end_date=$(openssl x509 -enddate -noout -in "$cert_file" 2>/dev/null | cut -d= -f2 || echo "")
    local expiration_epoch=$(date -d "$end_date" +%s 2>/dev/null || echo "")
    local current_epoch=$(date +%s)
    if [[ -n "$expiration_epoch" && $expiration_epoch -lt $current_epoch ]]; then
      if [[ "$JSON_OUTPUT" != "true" ]]; then echo -e "${RED}✘ Certificate expired. Trying to renew...${NC}"; fi
      ssl_renew
      return
    fi
    if [[ "$JSON_OUTPUT" != "true" ]]; then echo "Certificate looks valid. Verifying nginx..."; fi
    
    if [[ "$JSON_OUTPUT" == "true" ]]; then
      output_json true "REPAIR_SUCCESS"
      exit 0
    else
      verify_nginx_status
      pause
    fi
  else
    if [[ "$JSON_OUTPUT" == "true" ]]; then
      output_json true "HTTP_MODE"
      exit 0
    else
      echo "Desired State is HTTP. Nothing to repair."
      pause
    fi
  fi
}

ssl_status() {
  echo -e "${BOLD}--- SSL Status ---${NC}\n"
  source "${INSTALL_DIR}/.env"
  
  echo -e "Desired State:    ${CYAN}${PANEL_PROTOCOL^^}${NC}"
  echo -e "Provider:         ${CYAN}${SSL_PROVIDER}${NC}"
  echo -e "Domain:           ${CYAN}${PANEL_DOMAIN}${NC}"
  
  local cert_file="${INSTALL_DIR}/nginx/ssl/fullchain.pem"
  if [[ -f "$cert_file" ]]; then
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

  if curl -skL "http://127.0.0.1/api/health" &>/dev/null; then
    echo -e "HTTP Reachable:   ${GREEN}Yes${NC}"
  else
    echo -e "HTTP Reachable:   ${RED}No${NC}"
  fi

  if curl -skL "https://127.0.0.1/api/health" &>/dev/null; then
    echo -e "HTTPS Reachable:  ${GREEN}Yes${NC}"
  else
    echo -e "HTTPS Reachable:  ${RED}No${NC}"
  fi

  if [[ "${PANEL_PROTOCOL}" == "https" && ! -f "$cert_file" ]]; then
    echo -e "\n${YELLOW}⚠ Discrepancy: Desired state is HTTPS but certificate is missing. Run Repair SSL.${NC}"
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
  
  if [[ -f "${INSTALL_DIR}/package.json" ]]; then
    app_ver=$(grep -oP '(?<="version": ")[^"]*' "${INSTALL_DIR}/package.json" | head -n 1)
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
if [[ "$JSON_OUTPUT" == "true" || "${1:-}" == "ssl" || "${1:-}" == "doctor" || "${1:-}" == "version" ]]; then
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
