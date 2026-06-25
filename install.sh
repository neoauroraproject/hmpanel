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
# Banner
# ─────────────────────────────────────────────────────────────────
print_banner() {
  echo -e "${CYAN}${BOLD}"
  echo "  ██╗  ██╗███╗   ███╗██████╗  █████╗ ███╗   ██╗███████╗██╗     "
  echo "  ██║  ██║████╗ ████║██╔══██╗██╔══██╗████╗  ██║██╔════╝██║     "
  echo "  ███████║██╔████╔██║██████╔╝███████║██╔██╗ ██║█████╗  ██║     "
  echo "  ██╔══██║██║╚██╔╝██║██╔═══╝ ██╔══██║██║╚██╗██║██╔══╝  ██║     "
  echo "  ██║  ██║██║ ╚═╝ ██║██║     ██║  ██║██║ ╚████║███████╗███████╗"
  echo "  ╚═╝  ╚═╝╚═╝     ╚═╝╚═╝     ╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝"
  echo ""
  echo "  HMPanel v1.1 — Community Edition"
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

  local spin='-\|/'
  local i=0
  while kill -0 $pid 2>/dev/null; do
    i=$(( (i+1) % 4 ))
    echo -ne "\r  ${YELLOW}${spin:$i:1}${NC}  $msg..."
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
      PKG_UPDATE="apt-get update -qq"
      PKG_INSTALL="apt-get install -y -qq"
      ;;
    centos|rhel|fedora|rocky|almalinux)
      PKG_MANAGER="yum"
      PKG_UPDATE="yum update -y -q"
      PKG_INSTALL="yum install -y -q"
      ;;
    *)
      warn "Unsupported OS: $OS_ID $OS_VERSION. Continuing anyway..."
      PKG_MANAGER="apt-get"
      PKG_UPDATE="apt-get update -qq"
      PKG_INSTALL="apt-get install -y -qq"
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
    
    echo ""
    echo -e "  ${BOLD}Enable SSL for IP access?${NC} (Uses ZeroSSL for public IP)"
    echo -e "  ${BOLD}1${NC}) Yes"
    echo -e "  ${BOLD}2${NC}) No"
    read -rp "  Select option [1]: " SSL_CHOICE_INPUT || true
    [[ -z "$SSL_CHOICE_INPUT" ]] && SSL_CHOICE_INPUT=1
    
    if [[ "$SSL_CHOICE_INPUT" == 1 ]]; then
      SSL_CHOICE=1 # ACME IP Cert
    else
      SSL_CHOICE=3 # Disabled
    fi
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

# ─────────────────────────────────────────────────────────────────
# 10 Steps
# ─────────────────────────────────────────────────────────────────

step_1_configuration() {
  step "[1/10] Configuration"
  INSTALL_DIR="/opt/hmpanel"
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
}

step_2_environment() {
  step "[2/10] Environment"
  
  if [[ -f "${INSTALL_DIR}/.env" ]]; then
    info "Existing database detected."
    log "Reusing existing PostgreSQL credentials."
    source "${INSTALL_DIR}/.env"
    export POSTGRES_PASSWORD
    export POSTGRES_USER
    export POSTGRES_DB
  else
    JWT_SECRET=$(openssl rand -hex 64)
    POSTGRES_PASSWORD=$(openssl rand -hex 24)
    REDIS_PASSWORD=$(openssl rand -hex 24)
    log "Security secrets generated"

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
DOMAIN=${DOMAIN}
NEXT_PUBLIC_API_URL=https://${DOMAIN}/api
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

  if [[ "$SSL_CHOICE" == 3 ]]; then
    sed -i 's/listen 443 ssl;/# SSL disabled/' "${INSTALL_DIR}/nginx/nginx.conf.template" 2>/dev/null || true
  fi
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
  if ! run_with_spinner "Applying Schema & Migrations" docker compose run --rm hmpanel-panel /bin/sh -c "npx prisma db push && node backend/dist/scripts/run-migrations.js"; then
    die "Failed to initialize database schema."
  fi

  if ! run_with_spinner "Starting Application services" docker compose up -d; then
    die "Failed to start application services."
  fi
}

step_7_health_check() {
  step "[7/10] Health Check"
  local max_attempts=30
  local attempt=0
  local spin='-\|/'

  info "Waiting for backend API to become healthy..."
  while [[ $attempt -lt $max_attempts ]]; do
    if docker exec hmpanel-panel curl -sf "http://127.0.0.1:4000/health" &>/dev/null; then
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
    ensure_package git git
    ensure_package curl curl
    ensure_package socat socat

    info "Installing acme.sh..."
    if [[ ! -d "${INSTALL_DIR}/acme.sh" ]]; then
      run_with_spinner "Cloning acme.sh" git clone https://github.com/acmesh-official/acme.sh.git /tmp/acme.sh
      cd /tmp/acme.sh
      ./acme.sh --install --home "${INSTALL_DIR}/acme.sh" --config-home "${INSTALL_DIR}/acme.sh/data" --accountemail "${ADMIN_EMAIL}" >/dev/null 2>&1
      cd "$INSTALL_DIR"
      rm -rf /tmp/acme.sh
    fi

    # Set default CA to ZeroSSL
    "${INSTALL_DIR}/acme.sh/acme.sh" --home "${INSTALL_DIR}/acme.sh" --set-default-ca --server zerossl >/dev/null 2>&1

    info "Requesting ACME certificate for ${DOMAIN}..."
    
    # Stop Nginx temporarily to free port 80
    docker stop hmpanel-nginx >/dev/null 2>&1 || true

    local acme_success=false
    if "${INSTALL_DIR}/acme.sh/acme.sh" --home "${INSTALL_DIR}/acme.sh" --issue -d "$DOMAIN" --standalone; then
      info "Installing certificate to nginx..."
      "${INSTALL_DIR}/acme.sh/acme.sh" --home "${INSTALL_DIR}/acme.sh" --install-cert -d "$DOMAIN" \
        --fullchain-file "${SSL_DIR}/fullchain.pem" \
        --key-file "${SSL_DIR}/privkey.pem" \
        --reloadcmd "docker exec hmpanel-nginx nginx -s reload || true" >/dev/null 2>&1
      
      chown -R 1001:1001 "${INSTALL_DIR}/nginx/ssl" "${INSTALL_DIR}/acme.sh" 2>/dev/null || true
        
      log "Certificate issued successfully via acme.sh"
      SSL_STATUS="acme"
      acme_success=true
    else
      error "ACME SSL failed."
      warn "Falling back to HTTP only..."
      SSL_CHOICE=3
      sed -i 's/listen 443 ssl;/# SSL disabled/' "${INSTALL_DIR}/nginx/nginx.conf.template" 2>/dev/null || true
      SSL_STATUS="disabled"
    fi
    
    # Restart nginx
    docker start hmpanel-nginx >/dev/null 2>&1 || true
  fi

  if [[ "$SSL_CHOICE" == 2 ]]; then
    log "Using self-signed certificate"
    SSL_STATUS="self-signed"
  fi

  if [[ "$SSL_CHOICE" == 3 ]]; then
    log "SSL disabled (HTTP only)"
    sed -i 's/listen 443 ssl;/# SSL disabled/' "${INSTALL_DIR}/nginx/nginx.conf.template" 2>/dev/null || true
    docker restart hmpanel-nginx >/dev/null 2>&1 || true
    SSL_STATUS="disabled"
  fi
}

step_9_final_verification() {
  step "[9/10] Final Verification"
  local panel_status="Stopped"
  if docker inspect -f '{{.State.Status}}' hmpanel-panel 2>/dev/null | grep -q "running"; then
    panel_status="Running"
    log "Panel Status: ${panel_status}"
  else
    error "Panel Status: Not Running"
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

  if [[ -f "${INSTALL_DIR}/cli.sh" ]]; then
    info "Installing CLI Manager..."
    cp "${INSTALL_DIR}/cli.sh" /usr/local/bin/hmpanel
    chmod +x /usr/local/bin/hmpanel
    ln -sf /usr/local/bin/hmpanel /usr/local/bin/hm
    log "Global 'hmpanel' and 'hm' commands installed"
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
  
  echo -e "  Version:      ${CYAN}1.3.0${NC}"
  echo -e "  Edition:      ${CYAN}Community${NC}"
  
  if [[ "$SSL_STATUS" == "acme" || "$SSL_STATUS" == "self-signed" ]]; then
    local https_suffix=""
    if [[ "$HTTPS_PORT" != "443" ]]; then
      https_suffix=":${HTTPS_PORT}"
    fi
    echo -e "  URL:          ${CYAN}https://${DOMAIN}${https_suffix}${NC}"
  else
    local http_suffix=""
    if [[ "$HTTP_PORT" != "80" ]]; then
      http_suffix=":${HTTP_PORT}"
    fi
    echo -e "  URL:          ${CYAN}http://${DOMAIN}${http_suffix}${NC}"
  fi
  
  case "${SSL_STATUS:-disabled}" in
    acme)        echo -e "  SSL:          ${GREEN}Active (ACME)${NC}" ;;
    self-signed) echo -e "  SSL:          ${YELLOW}Active (Self-Signed)${NC}" ;;
    disabled)    echo -e "  SSL:          ${RED}Not Configured${NC}" ;;
  esac
  
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
