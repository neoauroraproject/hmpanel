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
        server_name _;

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
  echo -e "${BOLD}--- Issue / Renew SSL ---${NC}\n"
  source "${INSTALL_DIR}/.env"

  if [[ -z "${PANEL_DOMAIN:-}" || "$PANEL_DOMAIN" == "localhost" || "$PANEL_DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo -e "${YELLOW}⚠ IP address or localhost detected (${PANEL_DOMAIN:-None}). Skipping SSL workflow entirely.${NC}"
    ssl_fallback_to_http "SSL cannot be installed for raw IP addresses or localhost."
    pause
    return
  fi

  if ! verify_dns "$PANEL_DOMAIN"; then
    ssl_fallback_to_http "DNS verification failed"
    pause
    return
  fi
  if ! verify_port_80; then
    ssl_fallback_to_http "Port 80 is occupied"
    pause
    return
  fi

  # Stop nginx
  docker stop hmpanel-nginx >/dev/null 2>&1 || true

  local cert_obtained=false
  local provider="none"
  local SSL_DIR="${INSTALL_DIR}/nginx/ssl"

  # ACME (Let's Encrypt / ZeroSSL)
  if [[ -f "${INSTALL_DIR}/acme.sh/acme.sh" ]]; then
    for ca in "letsencrypt" "zerossl"; do
      if [[ "$cert_obtained" == false ]]; then
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

    docker start hmpanel-nginx >/dev/null 2>&1 || true
    sleep 2
    verify_nginx_status
  else
    ssl_fallback_to_http "All providers failed"
  fi
  pause
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
  echo -e "${BOLD}--- Disable HTTPS ---${NC}\n"
  echo -e "${YELLOW}⚠ Warning: This will switch the panel to HTTP mode.${NC}"
  read -rp "Are you sure? [y/N]: " confirm
  if [[ "${confirm,,}" == "y" ]]; then
    source "${INSTALL_DIR}/.env"
    ssl_fallback_to_http "User explicitly disabled HTTPS"
    verify_nginx_status "true"
    echo -e "${GREEN}✔ HTTPS Disabled.${NC}"
  else
    echo "Cancelled."
  fi
  pause
}

ssl_renew() {
  echo -e "${BOLD}--- Renew Existing Certificate ---${NC}\n"
  source "${INSTALL_DIR}/.env"
  local provider="${SSL_PROVIDER:-none}"

  if [[ "$provider" == "none" || -z "$provider" ]]; then
    if [[ -f "${INSTALL_DIR}/acme.sh/acme.sh" ]]; then
      provider="letsencrypt"
    elif command -v certbot &>/dev/null; then
      provider="certbot"
    else
      echo -e "${RED}✘ Provider unknown and no tools detected. Run Issue SSL instead.${NC}"
      pause
      return
    fi
  fi

  echo "Renewing via $provider..."
  if [[ "$provider" == "letsencrypt" || "$provider" == "zerossl" ]]; then
    "${INSTALL_DIR}/acme.sh/acme.sh" --home "${INSTALL_DIR}/acme.sh" --renew -d "$PANEL_DOMAIN" --force
  elif [[ "$provider" == "certbot" ]]; then
    if command -v certbot &>/dev/null; then
      certbot renew --force-renewal
    else
      docker run --rm -v "${INSTALL_DIR}/nginx/ssl:/etc/letsencrypt" certbot/certbot renew --force-renewal
    fi
  fi

  docker restart hmpanel-nginx >/dev/null 2>&1 || true
  verify_nginx_status
  pause
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
  echo -e "${BOLD}--- Repair SSL ---${NC}\n"
  echo "Checking configuration..."
  source "${INSTALL_DIR}/.env"
  if [[ "${SSL_ENABLED}" == "true" ]]; then
    echo "Desired State: HTTPS"
    local cert_file="${INSTALL_DIR}/nginx/ssl/fullchain.pem"
    if [[ ! -f "$cert_file" ]]; then
      echo -e "${RED}✘ Certificate missing. Trying to reissue...${NC}"
      ssl_issue
      return
    fi
    local end_date=$(openssl x509 -enddate -noout -in "$cert_file" 2>/dev/null | cut -d= -f2)
    local expiration_epoch=$(date -d "$end_date" +%s 2>/dev/null)
    local current_epoch=$(date +%s)
    if [[ -n "$expiration_epoch" && $expiration_epoch -lt $current_epoch ]]; then
      echo -e "${RED}✘ Certificate expired. Trying to renew...${NC}"
      ssl_renew
      return
    fi
    echo "Certificate looks valid. Verifying nginx..."
    verify_nginx_status
    pause
  else
    echo "Desired State is HTTP. Nothing to repair."
    pause
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
