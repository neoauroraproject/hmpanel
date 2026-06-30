#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  HMPanel — Interactive Installer v1.1
#  https://github.com/neoauroraproject/hmpanel
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

# ─────────────────────────────────────────────────────────────────
# Colors & formatting
# ─────────────────────────────────────────────────────────────────
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

# ─────────────────────────────────────────────────────────────────
# Global Helpers
# ─────────────────────────────────────────────────────────────────
update_env() {
  local key="$1"
  local val="$2"
  local env_file="/opt/hmpanel/.env"
  local tmp_file="/opt/hmpanel/.env.tmp"
  
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
  local env_file="/opt/hmpanel/.env"
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

# ─────────────────────────────────────────────────────────────────
# Banner
# ─────────────────────────────────────────────────────────────────
print_banner() {
  local version="Unknown"
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [[ -f "$script_dir/package.json" ]]; then
    version=$(grep -m1 '"version":' "$script_dir/package.json" | cut -d'"' -f4 || echo "Unknown")
  fi

  echo -e "${CYAN}${BOLD}"
  echo "  ██╗  ██╗███╗   ███╗██████╗  █████╗ ███╗   ██╗███████╗██╗     "
  echo "  ██║  ██║████╗ ████║██╔══██╗██╔══██╗████╗  ██║██╔════╝██║     "
  echo "  ███████║██╔████╔██║██████╔╝███████║██╔██╗ ██║█████╗  ██║     "
  echo "  ██╔══██║██║╚██╔╝██║██╔═══╝ ██╔══██║██║╚██╗██║██╔══╝  ██║     "
  echo "  ██║  ██║██║ ╚═╝ ██║██║     ██║  ██║██║ ╚████║███████╗███████╗"
  echo "  ╚═╝  ╚═╝╚═╝     ╚═╝╚═╝     ╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝"
  echo ""
  if [[ "$version" != "Unknown" ]]; then
    echo "  HMPanel v${version} — Community Edition"
  else
    echo "  HMPanel — Community Edition"
  fi
  echo "  Interactive Installer"
  echo -e "${NC}"
}

# ─────────────────────────────────────────────────────────────────
# Spinner & Error Handling
# ─────────────────────────────────────────────────────────────────
run_with_spinner() {
  local msg="$1"
  shift
  local cmd=("$@")
  
  local tmp_out
  tmp_out=$(mktemp)
  
  # Run command in background
  "${cmd[@]}" > "$tmp_out" 2>&1 &
  local pid=$!

  local spinner=( "⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏" )
  local i=0
  while kill -0 $pid 2>/dev/null; do
    i=$(( (i+1) % 10 ))
    echo -ne "\r\033[K  ${CYAN}${spinner[$i]}${NC}  $msg..."
    sleep 0.1
  done
  echo -ne "\r\033[K" # Clear line

  local exit_code=0
  wait $pid || exit_code=$?

  if [[ $exit_code -ne 0 ]]; then
    error "Command failed during: $msg"
    echo -e "${RED}Exact command:${NC} ${cmd[*]}"
    echo -e "${RED}Exit code:${NC} $exit_code"
    echo -e "${RED}Output/Error:${NC}"
    cat "$tmp_out"
    rm -f "$tmp_out"
    return $exit_code
  fi
  
  log "$msg completed"
  rm -f "$tmp_out"
  return 0
}

# ─────────────────────────────────────────────────────────────────
# System checks
# ─────────────────────────────────────────────────────────────────
check_root() {
  if [[ $EUID -ne 0 ]]; then
    die "This installer must be run as root. Use: sudo bash install.sh"
  fi
  log "Running as root"
}

check_os() {
  if [[ ! -f /etc/os-release ]]; then
    die "Cannot detect operating system"
  fi
  source /etc/os-release
  OS_ID="${ID:-unknown}"
  OS_VERSION="${VERSION_ID:-unknown}"
  case "$OS_ID" in
    ubuntu|debian|linuxmint)
      PKG_MANAGER="apt-get"
      PKG_UPDATE="DEBIAN_FRONTEND=noninteractive apt-get update -qq"
      PKG_INSTALL="DEBIAN_FRONTEND=noninteractive apt-get install -y -qq"
      ;;
    centos|rhel|fedora|rocky|almalinux)
      PKG_MANAGER="yum"
      PKG_UPDATE="yum update -y -q"
      PKG_INSTALL="yum install -y -q"
      ;;
    *)
      warn "Unsupported OS: $OS_ID $OS_VERSION. Continuing anyway..."
      PKG_MANAGER="apt-get"
      PKG_UPDATE="DEBIAN_FRONTEND=noninteractive apt-get update -qq"
      PKG_INSTALL="DEBIAN_FRONTEND=noninteractive apt-get install -y -qq"
      ;;
  esac
  log "OS detected: $PRETTY_NAME"
}

check_architecture() {
  ARCH=$(uname -m)
  case "$ARCH" in
    x86_64|amd64) log "Architecture: amd64" ;;
    aarch64|arm64) log "Architecture: arm64" ;;
    *) warn "Unknown architecture: $ARCH. Proceeding anyway." ;;
  esac
}

check_minimum_requirements() {
  RAM_MB=$(awk '/MemTotal/ {printf "%.0f", $2/1024}' /proc/meminfo 2>/dev/null || echo "0")
  if [[ $RAM_MB -lt 900 ]]; then
    warn "Low RAM detected: ${RAM_MB}MB. Minimum recommended: 1024MB."
  else
    log "RAM: ${RAM_MB}MB available"
  fi

  DISK_GB=$(df / | awk 'NR==2 {printf "%.0f", $4/1024/1024}' || echo "0")
  if [[ $DISK_GB -lt 5 ]]; then
    warn "Low disk space: ${DISK_GB}GB free. Minimum recommended: 5GB."
  else
    log "Disk space: ${DISK_GB}GB free"
  fi
}

# ─────────────────────────────────────────────────────────────────
# Package installation helpers
# ─────────────────────────────────────────────────────────────────
install_package() {
  local pkg="$1"
  run_with_spinner "Installing $pkg" $PKG_INSTALL "$pkg" || warn "Failed to install $pkg"
}

ensure_package() {
  local cmd="$1"
  local pkg="${2:-$1}"
  if ! command -v "$cmd" &>/dev/null; then
    # Run update once if we are about to install something
    if [[ "${APT_UPDATED:-0}" == "0" ]]; then
      run_with_spinner "Updating package lists" $PKG_UPDATE || true
      APT_UPDATED=1
    fi
    install_package "$pkg"
  fi
}

install_docker() {
  if command -v docker &>/dev/null; then
    log "Docker is already installed ($(docker --version | cut -d' ' -f3 | tr -d ','))"
    return
  fi
  
  if [[ "${APT_UPDATED:-0}" == "0" ]]; then
    run_with_spinner "Updating package lists" $PKG_UPDATE || true
    APT_UPDATED=1
  fi
  install_package "curl"
  run_with_spinner "Installing Docker" bash -c "curl -fsSL https://get.docker.com | sh"
  systemctl enable docker --now >/dev/null 2>&1 || true
}

install_docker_compose() {
  if docker compose version &>/dev/null 2>&1 || command -v docker-compose &>/dev/null; then
    log "Docker Compose is already installed"
    return
  fi

  COMPOSE_VERSION="v2.24.0"
  ARCH=$(uname -m)
  case "$ARCH" in
    x86_64)  COMPOSE_ARCH="x86_64" ;;
    aarch64) COMPOSE_ARCH="aarch64" ;;
    *)       COMPOSE_ARCH="x86_64" ;;
  esac
  mkdir -p /usr/local/lib/docker/cli-plugins
  run_with_spinner "Installing Docker Compose" curl -SL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-${COMPOSE_ARCH}" -o /usr/local/lib/docker/cli-plugins/docker-compose
  chmod +x /usr/local/lib/docker/cli-plugins/docker-compose 2>/dev/null || true
}

# ─────────────────────────────────────────────────────────────────
# User input collection
# ─────────────────────────────────────────────────────────────────
collect_user_input() {
  echo ""
  echo -e "  ${BOLD}How would you like to access HMPanel?${NC}"
  echo -e "  ${BOLD}1${NC}) Domain"
  echo -e "  ${BOLD}2${NC}) Server IP"
  read -rp "  Select option [1]: " ACCESS_MODE || true
  [[ -z "$ACCESS_MODE" ]] && ACCESS_MODE=1

  if [[ "$ACCESS_MODE" == 2 ]]; then
    DETECTED_IP=$(curl -s https://api.ipify.org 2>/dev/null || curl -s https://icanhazip.com 2>/dev/null || echo "")
    if [[ -z "$DETECTED_IP" ]]; then
      read -rp "  Could not detect public IP automatically. Please enter your Server IP: " DETECTED_IP
    else
      echo -e "  Detected IP: ${CYAN}${DETECTED_IP}${NC}"
    fi
    DOMAIN="$DETECTED_IP"
    
    echo -e "  ${YELLOW}ℹ IP installations skip SSL setup (HTTP only).${NC}"
    SSL_CHOICE=3 # Disabled
  else
    echo ""
    read -rp "  Enter domain name (e.g. panel.example.com): " DOMAIN || true
    [[ -z "$DOMAIN" ]] && DOMAIN="localhost"
    
    echo ""
    echo -e "  ${BOLD}Enable SSL?${NC}"
    echo -e "  ${BOLD}1${NC}) Yes (Let's Encrypt/ZeroSSL)"
    echo -e "  ${BOLD}2${NC}) No"
    read -rp "  Select option [1]: " SSL_CHOICE_INPUT || true
    [[ -z "$SSL_CHOICE_INPUT" ]] && SSL_CHOICE_INPUT=1
    
    if [[ "$SSL_CHOICE_INPUT" == 1 ]]; then
      SSL_CHOICE=1 # ACME Domain Cert
    else
      SSL_CHOICE=3 # Disabled
    fi
  fi

  echo ""
  read -rp "  Admin username [admin]: " ADMIN_USERNAME || true
  [[ -z "$ADMIN_USERNAME" ]] && ADMIN_USERNAME="admin"
  
  ADMIN_EMAIL="admin@${DOMAIN:-localhost}"
  
  while true; do
    read -rsp "  Admin password (min 8 chars): " ADMIN_PASSWORD || true
    echo ""
    if [[ -z "$ADMIN_PASSWORD" ]] || [[ ${#ADMIN_PASSWORD} -lt 8 ]]; then
      warn "Password must be at least 8 characters"
    else
      break
    fi
  done

  HTTP_PORT=80
  HTTPS_PORT=443

  echo ""
  echo -e "${BOLD}  Configuration Summary:${NC}"
  echo -e "  ┌─────────────────────────────────────────"
  echo -e "  │  Access:    ${CYAN}${DOMAIN}${NC}"
  echo -e "  │  Username:  ${CYAN}${ADMIN_USERNAME}${NC}"
  echo -e "  │  Email:     ${CYAN}${ADMIN_EMAIL}${NC}"
  echo -e "  │  SSL:       ${CYAN}$(ssl_label $SSL_CHOICE)${NC}"
  echo -e "  └─────────────────────────────────────────"
  echo ""
  read -rp "  Proceed with installation? [Y/n]: " CONFIRM || true
  [[ "${CONFIRM,,}" == "n" ]] && die "Installation cancelled by user."
  
  return 0
}

ssl_label() {
  case "$1" in
    1) echo "Enabled (ACME)" ;;
    2) echo "Self-signed" ;;
    3) echo "Disabled (HTTP only)" ;;
    *) echo "Unknown" ;;
  esac
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

verify_dns() {
  local domain="$1"
  if [[ "$domain" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || [[ "$domain" == "localhost" ]]; then
    log "Skipping DNS verification for IP/localhost: $domain"
    return 0
  fi

  info "Verifying DNS resolution for $domain..."
  if ! host "$domain" >/dev/null 2>&1 && ! dig +short "$domain" >/dev/null 2>&1 && ! getent hosts "$domain" >/dev/null 2>&1; then
    warn "DNS check failed: $domain does not resolve."
    return 1
  fi
  log "DNS verification passed"
  return 0
}

verify_port_80() {
  info "Checking if port 80 is available..."
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
      info "Detected process: ${holding_process}"
      log "Decision: Expected Docker process. Continuing..."
      return 0
    elif [[ "$holding_process" != "" ]]; then
      warn "Detected process: ${holding_process}"
      error "Decision: External process detected. Cannot continue with SSL on port 80."
      return 1
    else
      warn "Port 80 is occupied by an unknown process. Cannot continue with SSL on port 80."
      return 1
    fi
  fi
  log "Port 80 is available"
  return 0
}

verify_nginx_status() {
  local container_name="hmpanel-nginx"
  local is_recheck="${1:-false}"
  local status
  status=$(docker inspect -f '{{.State.Status}}' "$container_name" 2>/dev/null || echo "missing")

  if [[ "$status" == "restarting" || "$status" != "running" ]]; then
    error "Nginx container failed to start (Status: $status)."
    info "─── Last 50 lines of nginx logs ───"
    docker logs "$container_name" --tail=50 2>&1 || true
    echo ""

    if [[ "$is_recheck" == "true" ]]; then
      die "Nginx failed to start even in HTTP-only mode. Manual intervention required."
    fi

    warn "Automatically falling back to HTTP..."
    ssl_fallback_to_http "Nginx container startup failure"
    # Re-verify after fallback — if it still fails, die.
    sleep 3
    verify_nginx_status "true"
    return
  fi

  # ── Verify Endpoint Reachability ──
  info "Verifying Nginx endpoints..."
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
    error "Nginx is running but API health endpoint is unreachable."
    if [[ "$is_recheck" == "true" ]]; then
      die "Endpoints unreachable even in HTTP-only mode. Manual intervention required."
    fi
    warn "Automatically falling back to HTTP..."
    ssl_fallback_to_http "Nginx endpoints unreachable with SSL configuration"
    sleep 3
    verify_nginx_status "true"
    return
  fi

  log "Nginx is running and endpoints are healthy"
}

# ─────────────────────────────────────────────────────────────────
# SSL Fallback — called from ANY point in the SSL process on failure
# Ensures nginx always ends up running on HTTP no matter what went wrong
# ─────────────────────────────────────────────────────────────────
ssl_fallback_to_http() {
  local reason="${1:-Unknown SSL failure}"
  error "SSL failed: ${reason}"
  warn "⚠  Falling back to HTTP — panel will be accessible via http://${DOMAIN:-localhost}"

  SSL_CHOICE=3
  SSL_STATUS="disabled"

  # Back up the original template if it has SSL configuration
  if [[ -f "${INSTALL_DIR}/nginx/nginx.conf.template" ]] && ! [[ -f "${INSTALL_DIR}/nginx/nginx.conf.template.ssl" ]]; then
    cp "${INSTALL_DIR}/nginx/nginx.conf.template" "${INSTALL_DIR}/nginx/nginx.conf.template.ssl"
  fi

  # Replace the template with the dedicated HTTP template
  write_http_nginx_template "${INSTALL_DIR}/nginx/nginx.conf.template"

  # Remove all SSL cert files to prevent stale/broken certs from causing future issues
  rm -f "${INSTALL_DIR}/nginx/ssl/fullchain.pem" "${INSTALL_DIR}/nginx/ssl/privkey.pem" 2>/dev/null || true

  # Update .env explicitly to HTTP state
  update_env "PANEL_PROTOCOL" "http"
  update_env "SSL_ENABLED" "false"
  update_env "SSL_PROVIDER" "none"
  update_env "NEXT_PUBLIC_API_URL" "http://${DOMAIN}/api"

  # Restart/Recreate nginx container to pick up the patched config
  docker compose -f "${INSTALL_DIR}/docker-compose.yml" down nginx >/dev/null 2>&1 || true
  docker compose -f "${INSTALL_DIR}/docker-compose.yml" up -d nginx >/dev/null 2>&1 || true

  log "HTTP-only mode active. You can add SSL later via: hmpanel -> SSL Management"
}

# ─────────────────────────────────────────────────────────────────
# SSL Fallback — called from ANY point in the SSL process on failure
# Ensures nginx always ends up running on HTTP no matter what went wrong
# ─────────────────────────────────────────────────────────────────
ssl_fallback_to_http() {
  local reason="${1:-Unknown SSL failure}"
  error "SSL failed: ${reason}"
  warn "⚠  Falling back to HTTP — panel will be accessible via http://${DOMAIN:-localhost}"

  SSL_CHOICE=3
  SSL_STATUS="disabled"

  # Patch nginx config to disable SSL block (idempotent — safe to run multiple times)
  if [[ -f "${INSTALL_DIR}/nginx/nginx.conf.template" ]]; then
    sed -i 's/listen 443 ssl;/# SSL disabled/' "${INSTALL_DIR}/nginx/nginx.conf.template" 2>/dev/null || true
  fi

  # Update NEXT_PUBLIC_API_URL in .env to http so the frontend does not try https
  if [[ -f "${INSTALL_DIR}/.env" ]]; then
    sed -i "s|NEXT_PUBLIC_API_URL=https://|NEXT_PUBLIC_API_URL=http://|g" "${INSTALL_DIR}/.env" 2>/dev/null || true
  fi

  # Restart nginx to pick up the patched config
  docker restart hmpanel-nginx >/dev/null 2>&1 || true

  log "HTTP-only mode active. You can add SSL later via: hmpanel -> SSL Management"
}

# ─────────────────────────────────────────────────────────────────
# 10 Steps
# ─────────────────────────────────────────────────────────────────

step_1_configuration() {
  step "[1/10] Configuration"
  INSTALL_DIR="/opt/hmpanel"
  BACKUP_DIR="${INSTALL_DIR}/backups"

  mkdir -p \
    "${INSTALL_DIR}/nginx/ssl" \
    "${INSTALL_DIR}/uploads" \
    "${INSTALL_DIR}/backups" \
    "${INSTALL_DIR}/logs"
  log "Created directories in ${INSTALL_DIR}"

  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [[ -f "${SCRIPT_DIR}/docker-compose.yml" ]]; then
    if [[ "$SCRIPT_DIR" != "$INSTALL_DIR" ]]; then
      run_with_spinner "Copying files to installation directory" rsync -a --exclude='.git' --exclude='node_modules' --exclude='*.env' "${SCRIPT_DIR}/" "${INSTALL_DIR}/" || cp -r "${SCRIPT_DIR}/." "${INSTALL_DIR}/"
    else
      log "Running from install directory, skipping copy"
    fi
  else
    info "Downloading files from GitHub..."
    ensure_package git git
    run_with_spinner "Cloning repository" git clone -b main https://github.com/neoauroraproject/hmpanel.git /tmp/hmpanel_install
    run_with_spinner "Copying files to installation directory" cp -r /tmp/hmpanel_install/* "${INSTALL_DIR}/"
    rm -rf /tmp/hmpanel_install
  fi
  
  # Ensure panelapp user (1001) has access to needed directories
  chown -R 1001:1001 "${INSTALL_DIR}/nginx" "${INSTALL_DIR}/uploads" "${INSTALL_DIR}/backups" "${INSTALL_DIR}/logs" 2>/dev/null || true

  # Configure nginx for HTTP-only AFTER files are in place
  if [[ "$SSL_CHOICE" == 3 ]]; then
    if [[ -f "${INSTALL_DIR}/nginx/nginx.conf.template" ]] && ! [[ -f "${INSTALL_DIR}/nginx/nginx.conf.template.ssl" ]]; then
      cp "${INSTALL_DIR}/nginx/nginx.conf.template" "${INSTALL_DIR}/nginx/nginx.conf.template.ssl"
    fi
    write_http_nginx_template "${INSTALL_DIR}/nginx/nginx.conf.template"
    info "Nginx configured for HTTP-only mode"
  fi

  # Install CLI Manager immediately so it can be used for SSL setup
  if [[ -f "${INSTALL_DIR}/cli.sh" ]]; then
    info "Installing CLI Manager..."
    cp "${INSTALL_DIR}/cli.sh" /usr/local/bin/hmpanel
    chmod +x /usr/local/bin/hmpanel
    ln -sf /usr/local/bin/hmpanel /usr/local/bin/hm
    log "Global 'hmpanel' and 'hm' commands installed"
  fi
}

step_2_environment() {
  step "[2/10] Environment"
  
  if [[ -f "${INSTALL_DIR}/.env" ]]; then
    export IS_FRESH_INSTALL="false"
    info "Existing database detected."
    log "Reusing existing PostgreSQL credentials."
    ensure_env_variables
    source "${INSTALL_DIR}/.env"
    export POSTGRES_PASSWORD
    export POSTGRES_USER
    export POSTGRES_DB
  else
    export IS_FRESH_INSTALL="true"
    JWT_SECRET=$(openssl rand -hex 64)
    POSTGRES_PASSWORD=$(openssl rand -hex 24)
    REDIS_PASSWORD=$(openssl rand -hex 24)
    log "Security secrets generated"

    local init_protocol="http"
    local init_ssl_enabled="false"
    if [[ "$SSL_CHOICE" == 1 || "$SSL_CHOICE" == 2 ]]; then
      init_protocol="https"
      init_ssl_enabled="true"
    fi

    cat > "${INSTALL_DIR}/.env" <<EOF
# HMPanel — Auto-generated by installer on $(date)
# DO NOT COMMIT THIS FILE

RELEASE_MODE=COMMUNITY

# Database
DATABASE_URL=postgresql://panel_user:${POSTGRES_PASSWORD}@postgres:5432/panel_db?schema=public&connection_limit=5&connect_timeout=30
POSTGRES_USER=panel_user
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=panel_db

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=${REDIS_PASSWORD}

# Security
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=7d

# App
NODE_ENV=production
APP_PORT=3000
BACKEND_PORT=4000
HTTP_PORT=${HTTP_PORT}
HTTPS_PORT=${HTTPS_PORT}

# Installer & CLI State
PANEL_PROTOCOL=${init_protocol}
SSL_ENABLED=${init_ssl_enabled}
SSL_PROVIDER=none
PANEL_DOMAIN=${DOMAIN}

DOMAIN=${DOMAIN}
NEXT_PUBLIC_API_URL=${init_protocol}://${DOMAIN}/api
NEXT_PUBLIC_RELEASE_MODE=COMMUNITY

# Initial Admin
INITIAL_ADMIN_USERNAME=${ADMIN_USERNAME}
INITIAL_ADMIN_EMAIL=${ADMIN_EMAIL}
INITIAL_ADMIN_PASSWORD=${ADMIN_PASSWORD}
EOF

    chmod 600 "${INSTALL_DIR}/.env"
    chown 1001:1001 "${INSTALL_DIR}/.env"
    log ".env file generated successfully"
  fi

  # Always create dummy certs so Nginx can start if SSL is enabled
  SSL_DIR="${INSTALL_DIR}/nginx/ssl"
  if [[ ! -f "${SSL_DIR}/fullchain.pem" ]]; then
    info "Generating temporary self-signed certificate for initial startup..."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout "${SSL_DIR}/privkey.pem" \
      -out "${SSL_DIR}/fullchain.pem" \
      -subj "/CN=${DOMAIN}/O=HMPanel/C=US" >/dev/null 2>&1 || true
    chmod 600 "${SSL_DIR}/privkey.pem" 2>/dev/null || true
  fi

  # NOTE: nginx.conf.template sed for HTTP-only is handled in step_1 after files are copied
}

step_3_docker() {
  step "[3/10] Docker"
  ensure_package curl curl
  ensure_package openssl openssl
  ensure_package dig dnsutils || ensure_package dig bind-utils || true
  install_docker
  install_docker_compose
}

step_4_database() {
  step "[4/10] Database"
  cd "$INSTALL_DIR"

  info "Pre-flight check: Validating .env permissions for container..."
  if ! docker run --rm -u 1001:1001 -v "${INSTALL_DIR}/.env:/app/.env" alpine cat /app/.env >/dev/null 2>&1; then
    warn "The .env file is not readable by the container user (UID 1001)."
    info "Attempting to repair permissions automatically..."
    chown 1001:1001 "${INSTALL_DIR}/.env"
    chmod 600 "${INSTALL_DIR}/.env"
    if ! docker run --rm -u 1001:1001 -v "${INSTALL_DIR}/.env:/app/.env" alpine cat /app/.env >/dev/null 2>&1; then
      die "FATAL: Could not grant read permissions to .env for container user 1001."
    else
      log "Permissions repaired successfully."
    fi
  else
    log "Pre-flight permissions check passed."
  fi

  if ! run_with_spinner "Starting PostgreSQL container" docker compose up -d postgres; then
    die "Failed to start database container."
  fi

  info "Waiting for database to initialize..."
  local retries=30
  local ready=false
  while [ $retries -gt 0 ]; do
    if docker exec -u postgres hmpanel-postgres pg_isready -U panel_user -d panel_db &>/dev/null; then
      ready=true
      break
    fi
    sleep 2
    retries=$((retries-1))
  done

  if [ "$ready" = false ]; then
    die "Database failed to initialize in time."
  fi

  # Source .env to get POSTGRES_PASSWORD if we just created/sourced it
  source "${INSTALL_DIR}/.env"

  info "Synchronizing database credentials..."
  local psql_retries=10
  local psql_success=false
  while [ $psql_retries -gt 0 ]; do
    if docker exec -u postgres hmpanel-postgres psql -U panel_user -d panel_db -c "ALTER USER panel_user WITH PASSWORD '${POSTGRES_PASSWORD}';" &>/dev/null; then
      psql_success=true
      break
    fi
    sleep 2
    psql_retries=$((psql_retries-1))
  done

  if [ "$psql_success" = false ]; then
    die "✘ Failed to synchronize database password after multiple attempts. Installation aborted."
  fi
  
  log "Database ready."
}

step_5_redis() {
  step "[5/10] Redis"
  cd "$INSTALL_DIR"
  if ! run_with_spinner "Starting Redis container" docker compose up -d redis; then
    die "Failed to start redis container."
  fi
}

step_6_application() {
  step "[6/10] Application"
  cd "$INSTALL_DIR"
  info "Pulling Docker images (this may take a minute)..."
  local max_pull=5
  local pull_attempt=1
  local pull_success=false
  while [[ $pull_attempt -le $max_pull ]]; do
    if run_with_spinner "Pulling latest images (Attempt $pull_attempt/$max_pull)" docker compose pull; then
      pull_success=true
      break
    else
      warn "Docker pull failed. Retrying in 5 seconds..."
      sleep 5
      pull_attempt=$((pull_attempt + 1))
    fi
  done
  if [[ "$pull_success" == false ]]; then
    die "Docker pull failed after $max_pull attempts. Please check your network connection or configure a Docker registry mirror."
  fi
  
  info "Running Database Initialization and Migrations..."

  if ! run_with_spinner "Applying Schema & Migrations" docker compose run --rm panel-app /bin/sh -c "npx prisma db push --accept-data-loss && node backend/dist/scripts/run-migrations.js"; then
    die "Failed to initialize database schema."
  fi

  if [[ "${IS_FRESH_INSTALL:-false}" == "false" ]]; then
    info "Applying pre-migration schema fixes for existing clients..."
    docker exec hmpanel-postgres psql -U panel_user -d panel_db -c "
DO \$\$
DECLARE
  default_panel_id TEXT;
  default_server_id TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Panel') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Client' AND column_name = 'panelId') THEN
      SELECT id INTO default_panel_id FROM \"Panel\" LIMIT 1;
      IF default_panel_id IS NULL THEN
        default_server_id := gen_random_uuid()::text;
        INSERT INTO \"Server\" (id, name, \"ipAddress\") VALUES (default_server_id, 'Local', '127.0.0.1');
        default_panel_id := gen_random_uuid()::text;
        INSERT INTO \"Panel\" (id, \"serverId\", name, url) VALUES (default_panel_id, default_server_id, 'Default Panel', 'http://127.0.0.1:2053');
      END IF;
      ALTER TABLE \"Client\" ADD COLUMN \"panelId\" TEXT;
      UPDATE \"Client\" SET \"panelId\" = default_panel_id;
    END IF;
  END IF;
END \$\$;
" || warn "Pre-migration SQL failed, but continuing..."
  fi

  if ! run_with_spinner "Starting Application services" docker compose up -d; then
    die "Failed to start application services."
  fi
  verify_nginx_status
}

step_7_health_check() {
  step "[7/10] Health Check"
  local max_attempts=30
  local attempt=0
  local spin='-\|/'

  info "Waiting for backend API to become healthy..."
  while [[ $attempt -lt $max_attempts ]]; do
    local http_code
    http_code=$(docker exec hmpanel-panel curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:4000/health" || echo "000")
    if [[ "$http_code" == "200" ]]; then
      echo -ne "\r\033[K"
      log "Backend API is fully operational"
      break
    fi
    attempt=$((attempt + 1))
    local i=$(( attempt % 4 ))
    echo -ne "\r  ${YELLOW}${spin:$i:1}${NC}  Attempt ${attempt}/${max_attempts}..."
    sleep 5
  done

  if [[ $attempt -eq $max_attempts ]]; then
    echo -ne "\r\033[K"
    error "Health check timeout! The application failed to start successfully."
    warn "This usually indicates a configuration error or database connection issue."
    info "--- Last 20 lines of panel-app logs ---"
    docker logs --tail 20 hmpanel-panel
    echo -e "${NC}"
    die "Installation aborted due to application health check failure."
  fi
}

step_8_ssl() {
  step "[8/10] SSL"
  SSL_DIR="${INSTALL_DIR}/nginx/ssl"
  SSL_STATUS="disabled"

  if [[ "$SSL_CHOICE" == 1 ]]; then
    if [[ "$DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || [[ "$DOMAIN" == "localhost" ]]; then
      warn "IP address or localhost detected ($DOMAIN). Skipping SSL workflow entirely."
      hm ssl disable
      return 0
    fi

    # ── 1. Install dependencies ──────────────────────────────────
    ensure_package git git
    ensure_package curl curl
    ensure_package socat socat

    info "Delegating SSL issuance to HMCTL..."
    hm ssl issue "$DOMAIN" "$ADMIN_EMAIL"
    
    # Read the updated .env to get the SSL status
    source "${INSTALL_DIR}/.env"
    if [[ "$SSL_ENABLED" == "true" ]]; then
      SSL_STATUS="${SSL_PROVIDER}"
    else
      SSL_STATUS="disabled"
    fi
  fi

  # ── Self-signed ────────────────────────────────────────────────
  if [[ "$SSL_CHOICE" == 2 ]]; then
    log "Using self-signed certificate"
    hm ssl selfsigned "$DOMAIN"
    SSL_STATUS="self-signed"
  fi

  # ── HTTP-only (chosen or fallen back to) ──────────────────────
  if [[ "$SSL_CHOICE" == 3 ]]; then
    log "SSL disabled (HTTP only). Skipping SSL commands."
    SSL_STATUS="disabled"
  fi
}

step_9_final_verification() {
  step "[9/10] Final Verification"

  local containers=("hmpanel-postgres" "hmpanel-redis" "hmpanel-panel" "hmpanel-nginx")
  local all_healthy=true

  for container in "${containers[@]}"; do
    local status
    status=$(docker inspect -f '{{.State.Status}}' "$container" 2>/dev/null || echo "missing")

    if [[ "$status" == "running" ]]; then
      log "$container: Running"
    elif [[ "$status" == "restarting" ]]; then
      all_healthy=false
      error "$container: Restarting"
      info "─── Last 30 lines of $container logs ───"
      docker logs "$container" --tail=30 2>&1 || true
      echo ""

      # Auto-remediate nginx SSL failures
      if [[ "$container" == "hmpanel-nginx" ]]; then
        local logs
        logs=$(docker logs "$container" --tail=50 2>&1 || echo "")
        if [[ "$logs" =~ ssl || "$logs" =~ BIO_new_file || "$logs" =~ PEM_read_bio || "$logs" =~ certificate || "$logs" =~ "key mismatch" || "$logs" =~ 'no "ssl" directive' ]]; then
          warn "SSL-related error detected during final verification. Automatically falling back to HTTP..."
          ssl_fallback_to_http "Final verification detected SSL failure"
          sleep 3
          local recheck
          recheck=$(docker inspect -f '{{.State.Status}}' "$container" 2>/dev/null || echo "missing")
          if [[ "$recheck" == "running" ]]; then
            log "$container: Recovered (HTTP mode)"
            all_healthy=true
          else
            die "Nginx failed to start even in HTTP mode. Manual intervention required."
          fi
        else
          die "$container failed to start due to a non-SSL error. Check logs above."
        fi
      fi
    else
      all_healthy=false
      error "$container: $status"
    fi
  done

  if [[ "$all_healthy" == true ]]; then
    log "All containers are healthy"
  else
    warn "Some containers are not in a healthy state. Check errors above."
  fi
}

step_10_complete() {
  step "[10/10] Installation Complete"
  if command -v systemctl &>/dev/null; then
    info "Setting up systemd service..."
    cat > /etc/systemd/system/hmpanel.service <<EOF
[Unit]
Description=HMPanel
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload >/dev/null 2>&1 || true
    systemctl enable hmpanel >/dev/null 2>&1 || true
    log "Systemd auto-start enabled"
  fi

  print_success
}

# ─────────────────────────────────────────────────────────────────
# Final Output
# ─────────────────────────────────────────────────────────────────
print_success() {
  echo ""
  echo -e "${GREEN}${BOLD}"
  echo "  ╔═══════════════════════════════════════════════════╗"
  echo "  ║         HMPanel Installed Successfully            ║"
  echo "  ╚═══════════════════════════════════════════════════╝"
  echo -e "${NC}"
  
  if docker inspect -f '{{.State.Status}}' hmpanel-panel 2>/dev/null | grep -q "running"; then
    echo -e "  Panel Status: ${GREEN}Running${NC}"
  else
    echo -e "  Panel Status: ${RED}Stopped/Failed${NC}"
  fi
  # Get local installer version
  local local_version="Unknown"
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [[ -f "$script_dir/package.json" ]]; then
    local_version=$(grep -m1 '"version":' "$script_dir/package.json" | cut -d'"' -f4 || echo "Unknown")
  fi

  # Get running application version
  local app_version="Unknown"
  if docker exec hmpanel-panel node -p "require('./package.json').version" >/dev/null 2>&1; then
    app_version=$(docker exec hmpanel-panel node -p "require('./package.json').version" | tr -d '\r')
  elif docker inspect hmpanel-panel >/dev/null 2>&1; then
    local image_name
    image_name=$(docker inspect -f '{{.Config.Image}}' hmpanel-panel 2>/dev/null)
    app_version="${image_name##*:}"
  fi
  
  if [[ "$local_version" != "Unknown" && "$app_version" != "Unknown" && "$local_version" != "$app_version" ]]; then
    echo -e "  ${YELLOW}⚠ Version mismatch detected!${NC}"
    echo -e "  Installer Version:   ${CYAN}${local_version}${NC}"
    echo -e "  Application Version: ${CYAN}${app_version}${NC}"
  else
    echo -e "  Version:      ${CYAN}${app_version}${NC}"
  fi
  
  echo -e "  Edition:      ${CYAN}Community${NC}"
  
  # Reality-check: verify SSL_STATUS matches the actual nginx configuration
  if [[ "${SSL_STATUS:-disabled}" != "disabled" ]]; then
    if ! grep -q "listen 443 ssl" "${INSTALL_DIR}/nginx/nginx.conf.template" 2>/dev/null; then
      SSL_STATUS="disabled"
    fi
  fi

  if [[ "$SSL_STATUS" == acme* || "$SSL_STATUS" == "self-signed" || "$SSL_STATUS" == "certbot" ]]; then
    local https_suffix=""
    if [[ "$HTTPS_PORT" != "443" ]]; then
      https_suffix=":${HTTPS_PORT}"
    fi
    echo -e "  URL:          ${CYAN}https://${DOMAIN}${https_suffix}${NC}"
    echo -e "  SSL:          ${GREEN}✓ Active (${SSL_STATUS})${NC}"
  else
    local http_suffix=""
    if [[ "$HTTP_PORT" != "80" ]]; then
      http_suffix=":${HTTP_PORT}"
    fi
    echo -e "  URL:          ${CYAN}http://${DOMAIN}${http_suffix}${NC}"
    echo -e "  SSL:          ${YELLOW}✓ HTTP mode (SSL not configured)${NC}"
  fi

  # Final nginx status
  local nginx_status
  nginx_status=$(docker inspect -f '{{.State.Status}}' hmpanel-nginx 2>/dev/null || echo "missing")
  if [[ "$nginx_status" == "running" ]]; then
    echo -e "  Nginx:        ${GREEN}✓ Running${NC}"
  else
    echo -e "  Nginx:        ${RED}✗ ${nginx_status}${NC}"
  fi
  
  echo ""
  echo -e "  CLI:          ${CYAN}hmpanel${NC}"
  echo -e "  Update:       ${CYAN}hmpanel${NC} -> Update"
  echo -e "  Backup:       ${CYAN}hmpanel${NC} -> Backup"
  echo -e "  SSL:          ${CYAN}hmpanel${NC} -> SSL Management"
  echo ""
}

# ─────────────────────────────────────────────────────────────────
# Execution Flow
# ─────────────────────────────────────────────────────────────────
main() {
  print_banner

  info "Starting Pre-flight Checks..."
  check_root
  check_os
  check_architecture
  check_minimum_requirements

  collect_user_input

  step_1_configuration
  step_2_environment
  step_3_docker
  step_4_database
  step_5_redis
  step_6_application
  step_7_health_check
  step_8_ssl
  step_9_final_verification
  step_10_complete
}

# Safely catch any unhandled fatal errors
trap 'error "Installation interrupted unexpectedly on line $LINENO"' ERR

main "$@"
