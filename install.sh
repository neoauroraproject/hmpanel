#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  HMray Panel — Interactive Installer v1.0
#  https://github.com/hmray/panel
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
  echo "  ██╗  ██╗███╗   ███╗██████╗  █████╗ ██╗   ██╗"
  echo "  ██║  ██║████╗ ████║██╔══██╗██╔══██╗╚██╗ ██╔╝"
  echo "  ███████║██╔████╔██║██████╔╝███████║ ╚████╔╝ "
  echo "  ██╔══██║██║╚██╔╝██║██╔══██╗██╔══██║  ╚██╔╝  "
  echo "  ██║  ██║██║ ╚═╝ ██║██║  ██║██║  ██║   ██║   "
  echo "  ╚═╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   "
  echo ""
  echo "  Panel v1.0 — Community Edition"
  echo "  Installer"
  echo -e "${NC}"
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
  # Check RAM (minimum 1GB)
  RAM_MB=$(awk '/MemTotal/ {printf "%.0f", $2/1024}' /proc/meminfo 2>/dev/null || echo "0")
  if [[ $RAM_MB -lt 900 ]]; then
    warn "Low RAM detected: ${RAM_MB}MB. Minimum recommended: 1024MB."
  else
    log "RAM: ${RAM_MB}MB available"
  fi

  # Check disk space (minimum 5GB)
  DISK_GB=$(df / | awk 'NR==2 {printf "%.0f", $4/1024/1024}')
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
  info "Installing $pkg..."
  $PKG_INSTALL "$pkg" >/dev/null 2>&1 || warn "Failed to install $pkg"
}

ensure_package() {
  local cmd="$1"
  local pkg="${2:-$1}"
  if ! command -v "$cmd" &>/dev/null; then
    install_package "$pkg"
  else
    log "$cmd is already installed"
  fi
}

install_docker() {
  if command -v docker &>/dev/null; then
    log "Docker is already installed ($(docker --version | cut -d' ' -f3 | tr -d ','))"
    return
  fi

  info "Installing Docker..."
  $PKG_UPDATE >/dev/null 2>&1
  install_package "curl"
  curl -fsSL https://get.docker.com | sh >/dev/null 2>&1
  systemctl enable docker --now >/dev/null 2>&1
  log "Docker installed successfully"
}

install_docker_compose() {
  if docker compose version &>/dev/null 2>&1; then
    log "Docker Compose (plugin) is already installed"
    return
  fi

  if command -v docker-compose &>/dev/null; then
    log "Docker Compose (standalone) is already installed"
    return
  fi

  info "Installing Docker Compose plugin..."
  COMPOSE_VERSION="v2.24.0"
  ARCH=$(uname -m)
  case "$ARCH" in
    x86_64)  COMPOSE_ARCH="x86_64" ;;
    aarch64) COMPOSE_ARCH="aarch64" ;;
    *)        COMPOSE_ARCH="x86_64" ;;
  esac
  mkdir -p /usr/local/lib/docker/cli-plugins
  curl -SL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-${COMPOSE_ARCH}" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose >/dev/null 2>&1
  chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  log "Docker Compose installed"
}

# ─────────────────────────────────────────────────────────────────
# User input collection
# ─────────────────────────────────────────────────────────────────
collect_user_input() {
  step "Configuration"
  echo ""
  echo -e "  Please provide the following information to configure your panel."
  echo -e "  Press ${BOLD}Enter${NC} to accept the default value shown in brackets.\n"

  # Domain
  read -rp "  Domain name (e.g. panel.yourdomain.com): " DOMAIN
  [[ -z "$DOMAIN" ]] && DOMAIN="localhost"

  # Admin credentials
  read -rp "  Admin username [admin]: " ADMIN_USERNAME
  [[ -z "$ADMIN_USERNAME" ]] && ADMIN_USERNAME="admin"

  read -rp "  Admin email [admin@${DOMAIN}]: " ADMIN_EMAIL
  [[ -z "$ADMIN_EMAIL" ]] && ADMIN_EMAIL="admin@${DOMAIN}"

  while true; do
    read -rsp "  Admin password (min 8 chars): " ADMIN_PASSWORD
    echo ""
    if [[ ${#ADMIN_PASSWORD} -lt 8 ]]; then
      warn "Password must be at least 8 characters"
    else
      break
    fi
  done

  # Ports
  read -rp "  HTTP port [80]: " HTTP_PORT
  [[ -z "$HTTP_PORT" ]] && HTTP_PORT=80

  read -rp "  HTTPS port [443]: " HTTPS_PORT
  [[ -z "$HTTPS_PORT" ]] && HTTPS_PORT=443

  # SSL
  echo ""
  echo -e "  SSL Configuration:"
  echo -e "    ${BOLD}1${NC}) Let's Encrypt (automatic, recommended — requires public domain)"
  echo -e "    ${BOLD}2${NC}) Self-signed certificate (for testing)"
  echo -e "    ${BOLD}3${NC}) Skip SSL (HTTP only)"
  read -rp "  SSL method [1]: " SSL_CHOICE
  [[ -z "$SSL_CHOICE" ]] && SSL_CHOICE=1

  echo ""
  echo -e "${BOLD}  Configuration Summary:${NC}"
  echo -e "  ┌─────────────────────────────────────────"
  echo -e "  │  Domain:    ${CYAN}${DOMAIN}${NC}"
  echo -e "  │  Username:  ${CYAN}${ADMIN_USERNAME}${NC}"
  echo -e "  │  Email:     ${CYAN}${ADMIN_EMAIL}${NC}"
  echo -e "  │  HTTP Port: ${CYAN}${HTTP_PORT}${NC}"
  echo -e "  │  SSL:       ${CYAN}$(ssl_label $SSL_CHOICE)${NC}"
  echo -e "  └─────────────────────────────────────────"
  echo ""
  read -rp "  Proceed with installation? [Y/n]: " CONFIRM
  [[ "${CONFIRM,,}" == "n" ]] && die "Installation cancelled by user."
}

ssl_label() {
  case "$1" in
    1) echo "Let's Encrypt" ;;
    2) echo "Self-signed" ;;
    3) echo "Disabled (HTTP only)" ;;
    *) echo "Unknown" ;;
  esac
}

# ─────────────────────────────────────────────────────────────────
# Generate secrets
# ─────────────────────────────────────────────────────────────────
generate_secrets() {
  step "Generating Security Secrets"
  JWT_SECRET=$(openssl rand -hex 64)
  POSTGRES_PASSWORD=$(openssl rand -hex 24)
  REDIS_PASSWORD=$(openssl rand -hex 24)
  log "JWT secret generated"
  log "Database password generated"
  log "Redis password generated"
}

# ─────────────────────────────────────────────────────────────────
# Create .env file
# ─────────────────────────────────────────────────────────────────
create_env_file() {
  step "Creating Environment File"
  INSTALL_DIR="${INSTALL_DIR:-/opt/hmray-panel}"

  cat > "${INSTALL_DIR}/.env" <<EOF
# HMray Panel — Auto-generated by installer on $(date)
# DO NOT COMMIT THIS FILE

RELEASE_MODE=COMMUNITY

# Database
DATABASE_URL="postgresql://panel_user:${POSTGRES_PASSWORD}@postgres:5432/panel_db?schema=public"
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
BACKEND_PORT=4000
HTTP_PORT=${HTTP_PORT}
HTTPS_PORT=${HTTPS_PORT}
DOMAIN=${DOMAIN}
NEXT_PUBLIC_API_URL=https://${DOMAIN}/api
NEXT_PUBLIC_RELEASE_MODE=COMMUNITY

# Initial Admin (used once during setup)
INITIAL_ADMIN_USERNAME=${ADMIN_USERNAME}
INITIAL_ADMIN_EMAIL=${ADMIN_EMAIL}
INITIAL_ADMIN_PASSWORD=${ADMIN_PASSWORD}
EOF

  chmod 600 "${INSTALL_DIR}/.env"
  log ".env file created at ${INSTALL_DIR}/.env"
}

# ─────────────────────────────────────────────────────────────────
# SSL setup
# ─────────────────────────────────────────────────────────────────
setup_ssl() {
  step "Setting Up SSL"
  INSTALL_DIR="${INSTALL_DIR:-/opt/hmray-panel}"
  SSL_DIR="${INSTALL_DIR}/nginx/ssl"
  mkdir -p "$SSL_DIR"

  case "$SSL_CHOICE" in
    1) setup_letsencrypt ;;
    2) setup_self_signed ;;
    3) setup_no_ssl ;;
    *) setup_self_signed ;;
  esac
}

setup_letsencrypt() {
  info "Attempting Let's Encrypt SSL for domain: ${DOMAIN}"
  INSTALL_DIR="${INSTALL_DIR:-/opt/hmray-panel}"
  SSL_DIR="${INSTALL_DIR}/nginx/ssl"

  # Verify domain resolves to this server
  SERVER_IP=$(curl -s https://api.ipify.org 2>/dev/null || echo "unknown")
  DOMAIN_IP=$(dig +short "$DOMAIN" 2>/dev/null | tail -1 || echo "")

  if [[ "$DOMAIN_IP" != "$SERVER_IP" ]]; then
    warn "Domain ${DOMAIN} does not appear to resolve to this server (${SERVER_IP})."
    warn "Let's Encrypt requires the domain to point to this IP."
    warn "Falling back to self-signed certificate..."
    setup_self_signed
    return
  fi

  ensure_package certbot certbot

  # Run standalone certbot
  if certbot certonly \
      --standalone \
      --non-interactive \
      --agree-tos \
      --email "$ADMIN_EMAIL" \
      -d "$DOMAIN" \
      --http-01-port 80 2>/dev/null; then
    # Copy certs to nginx SSL dir
    cp "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" "${SSL_DIR}/fullchain.pem"
    cp "/etc/letsencrypt/live/${DOMAIN}/privkey.pem" "${SSL_DIR}/privkey.pem"
    chmod 600 "${SSL_DIR}/privkey.pem"
    log "Let's Encrypt certificate issued successfully"
    SSL_STATUS="letsencrypt"
  else
    warn "Let's Encrypt certificate failed. Falling back to self-signed..."
    setup_self_signed
  fi
}

setup_self_signed() {
  INSTALL_DIR="${INSTALL_DIR:-/opt/hmray-panel}"
  SSL_DIR="${INSTALL_DIR}/nginx/ssl"
  info "Generating self-signed certificate for ${DOMAIN}..."
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "${SSL_DIR}/privkey.pem" \
    -out "${SSL_DIR}/fullchain.pem" \
    -subj "/CN=${DOMAIN}/O=HMray Panel/C=US" 2>/dev/null
  chmod 600 "${SSL_DIR}/privkey.pem"
  log "Self-signed certificate created"
  SSL_STATUS="self-signed"
  warn "Self-signed certificates will show a browser warning. For production, use Let's Encrypt."
}

setup_no_ssl() {
  INSTALL_DIR="${INSTALL_DIR:-/opt/hmray-panel}"
  # Patch nginx to serve only HTTP
  sed -i 's/listen 443 ssl http2;/# SSL disabled/' "${INSTALL_DIR}/nginx/nginx.conf" 2>/dev/null || true
  info "SSL disabled — serving on HTTP only"
  SSL_STATUS="disabled"
}

# ─────────────────────────────────────────────────────────────────
# Directory setup
# ─────────────────────────────────────────────────────────────────
setup_directories() {
  step "Setting Up Directories"
  INSTALL_DIR="${INSTALL_DIR:-/opt/hmray-panel}"
  mkdir -p \
    "${INSTALL_DIR}/nginx/ssl" \
    "${INSTALL_DIR}/uploads" \
    "${INSTALL_DIR}/backups" \
    "${INSTALL_DIR}/logs"
  log "Created directories in ${INSTALL_DIR}"
}

# ─────────────────────────────────────────────────────────────────
# Copy project files to install dir
# ─────────────────────────────────────────────────────────────────
copy_project_files() {
  step "Copying Project Files"
  INSTALL_DIR="${INSTALL_DIR:-/opt/hmray-panel}"
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  if [[ "$SCRIPT_DIR" != "$INSTALL_DIR" ]]; then
    rsync -a --exclude='.git' --exclude='node_modules' --exclude='*.env' \
      "${SCRIPT_DIR}/" "${INSTALL_DIR}/" 2>/dev/null || \
    cp -r "${SCRIPT_DIR}/." "${INSTALL_DIR}/"
    log "Project files copied to ${INSTALL_DIR}"
  else
    log "Running from install directory, skipping copy"
  fi
}

# ─────────────────────────────────────────────────────────────────
# Build and start containers
# ─────────────────────────────────────────────────────────────────
start_containers() {
  step "Building and Starting Containers"
  INSTALL_DIR="${INSTALL_DIR:-/opt/hmray-panel}"
  cd "$INSTALL_DIR"

  info "Building Docker images (this may take 5-10 minutes on first run)..."
  docker compose build --no-cache 2>&1 | tail -5

  info "Starting services..."
  docker compose up -d

  log "Containers started"
}

# ─────────────────────────────────────────────────────────────────
# Wait for health
# ─────────────────────────────────────────────────────────────────
wait_for_health() {
  step "Verifying Installation"
  local max_attempts=30
  local attempt=0

  info "Waiting for services to become healthy..."
  while [[ $attempt -lt $max_attempts ]]; do
    if docker exec hmray-panel curl -sf "http://localhost:4000/health" &>/dev/null; then
      log "Backend API is healthy"
      break
    fi
    attempt=$((attempt + 1))
    echo -ne "  Attempt ${attempt}/${max_attempts}...\r"
    sleep 5
  done

  if [[ $attempt -eq $max_attempts ]]; then
    warn "Health check timeout. Check logs: docker compose logs panel-app"
  fi
}

# ─────────────────────────────────────────────────────────────────
# Create systemd service for auto-start
# ─────────────────────────────────────────────────────────────────
setup_systemd() {
  INSTALL_DIR="${INSTALL_DIR:-/opt/hmray-panel}"
  cat > /etc/systemd/system/hmray-panel.service <<EOF
[Unit]
Description=HMray Panel
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

  systemctl daemon-reload >/dev/null 2>&1
  systemctl enable hmray-panel >/dev/null 2>&1
  log "Systemd service created (auto-start on boot enabled)"
}

# ─────────────────────────────────────────────────────────────────
# Print success summary
# ─────────────────────────────────────────────────────────────────
print_success() {
  INSTALL_DIR="${INSTALL_DIR:-/opt/hmray-panel}"
  echo ""
  echo -e "${GREEN}${BOLD}"
  echo "  ╔═══════════════════════════════════════════════════╗"
  echo "  ║         HMPanel Installed Successfully            ║"
  echo "  ╚═══════════════════════════════════════════════════╝"
  echo -e "${NC}"
  echo -e "  ${BOLD}Version:${NC}          v1.0.0 (Community Edition)"
  echo -e "  ${BOLD}Repository:${NC}       https://github.com/neoauroraproject/hmpanel"
  echo -e "  ${BOLD}Website:${NC}          https://hmray.example.com"
  echo -e "  ${BOLD}Telegram Channel:${NC} https://t.me/hmray_example"
  echo ""
  echo -e "  ${BOLD}Access URLs:${NC}"
  echo -e "    Panel:  ${CYAN}https://${DOMAIN}${NC}"
  echo -e "    API:    ${CYAN}https://${DOMAIN}/api${NC}"
  echo -e "    Health: ${CYAN}https://${DOMAIN}/api/health${NC}"
  echo ""
  echo -e "  ${BOLD}Admin Credentials:${NC}"
  echo -e "    Username: ${CYAN}${ADMIN_USERNAME}${NC}"
  echo -e "    Password: ${CYAN}(as entered during setup)${NC}"
  echo ""
  echo -e "  ${BOLD}SSL Status:${NC}  $(ssl_status_label)"
  echo ""
  echo -e "  ${BOLD}Management Commands:${NC}"
  echo -e "    Update:    ${CYAN}bash ${INSTALL_DIR}/update.sh${NC}"
  echo -e "    Uninstall: ${CYAN}bash ${INSTALL_DIR}/uninstall.sh${NC}"
  echo -e "    Logs:      ${CYAN}docker compose -f ${INSTALL_DIR}/docker-compose.yml logs -f${NC}"
  echo ""
  echo -e "  ${BOLD}Files:${NC}"
  echo -e "    Install directory: ${CYAN}${INSTALL_DIR}${NC}"
  echo -e "    Environment file:  ${CYAN}${INSTALL_DIR}/.env${NC}"
  echo ""
}

ssl_status_label() {
  case "${SSL_STATUS:-disabled}" in
    letsencrypt) echo -e "${GREEN}Let's Encrypt ✔${NC}" ;;
    self-signed) echo -e "${YELLOW}Self-signed ⚠ (browser warning)${NC}" ;;
    disabled)    echo -e "${RED}Disabled (HTTP only)${NC}" ;;
  esac
}

# ─────────────────────────────────────────────────────────────────
# Main installation flow
# ─────────────────────────────────────────────────────────────────
main() {
  print_banner

  INSTALL_DIR="/opt/hmray-panel"
  SSL_STATUS="disabled"

  step "System Checks"
  check_root
  check_os
  check_architecture
  check_minimum_requirements

  step "Installing Dependencies"
  $PKG_UPDATE >/dev/null 2>&1 || true
  ensure_package curl curl
  ensure_package openssl openssl
  ensure_package dig dnsutils || ensure_package dig bind-utils || true
  install_docker
  install_docker_compose

  collect_user_input
  generate_secrets
  setup_directories
  copy_project_files
  create_env_file
  setup_ssl
  start_containers
  wait_for_health

  if command -v systemctl &>/dev/null; then
    setup_systemd
  fi

  print_success
}

main "$@"
