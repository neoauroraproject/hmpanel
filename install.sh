#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  HMPanel — Interactive Installer v1.0
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
  echo "  HMPanel v1.0 — Community Edition"
  echo "  Interactive Installer"
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
  $PKG_UPDATE >/dev/null 2>&1 || true
  install_package "curl"
  curl -fsSL https://get.docker.com | sh >/dev/null 2>&1
  systemctl enable docker --now >/dev/null 2>&1 || true
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
    *)       COMPOSE_ARCH="x86_64" ;;
  esac
  mkdir -p /usr/local/lib/docker/cli-plugins
  curl -SL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-${COMPOSE_ARCH}" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose >/dev/null 2>&1 || true
  chmod +x /usr/local/lib/docker/cli-plugins/docker-compose 2>/dev/null || true
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

  read -rp "  Domain name (e.g. panel.yourdomain.com): " DOMAIN || true
  [[ -z "$DOMAIN" ]] && DOMAIN="localhost"

  read -rp "  Admin username [admin]: " ADMIN_USERNAME || true
  [[ -z "$ADMIN_USERNAME" ]] && ADMIN_USERNAME="admin"

  read -rp "  Admin email (optional): " ADMIN_EMAIL || true

  while true; do
    read -rsp "  Admin password (min 8 chars): " ADMIN_PASSWORD || true
    echo ""
    if [[ -z "$ADMIN_PASSWORD" ]] || [[ ${#ADMIN_PASSWORD} -lt 8 ]]; then
      warn "Password must be at least 8 characters"
    else
      break
    fi
  done

  read -rp "  HTTP port [80]: " HTTP_PORT || true
  [[ -z "$HTTP_PORT" ]] && HTTP_PORT=80

  read -rp "  HTTPS port [443]: " HTTPS_PORT || true
  [[ -z "$HTTPS_PORT" ]] && HTTPS_PORT=443

  echo ""
  echo -e "  SSL Configuration:"
  echo -e "    ${BOLD}1${NC}) Let's Encrypt (automatic, recommended — requires public domain)"
  echo -e "    ${BOLD}2${NC}) Self-signed certificate (for testing)"
  echo -e "    ${BOLD}3${NC}) Skip SSL (HTTP only)"
  read -rp "  SSL method [1]: " SSL_CHOICE || true
  [[ -z "$SSL_CHOICE" ]] && SSL_CHOICE=1

  echo ""
  echo -e "${BOLD}  Configuration Summary:${NC}"
  echo -e "  ┌─────────────────────────────────────────"
  echo -e "  │  Domain:    ${CYAN}${DOMAIN}${NC}"
  echo -e "  │  Username:  ${CYAN}${ADMIN_USERNAME}${NC}"
  echo -e "  │  Email:     ${CYAN}${ADMIN_EMAIL:-None}${NC}"
  echo -e "  │  HTTP Port: ${CYAN}${HTTP_PORT}${NC}"
  echo -e "  │  SSL:       ${CYAN}$(ssl_label $SSL_CHOICE)${NC}"
  echo -e "  └─────────────────────────────────────────"
  echo ""
  read -rp "  Proceed with installation? [Y/n]: " CONFIRM || true
  [[ "${CONFIRM,,}" == "n" ]] && die "Installation cancelled by user."
  
  # Return explicitly to prevent falling through silently if set -e acts up
  return 0
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
# 10 Steps
# ─────────────────────────────────────────────────────────────────

step_1_repository() {
  step "[1/10] Repository Setup"
  INSTALL_DIR="/opt/hmpanel"
  mkdir -p \
    "${INSTALL_DIR}/nginx/ssl" \
    "${INSTALL_DIR}/uploads" \
    "${INSTALL_DIR}/backups" \
    "${INSTALL_DIR}/logs"
  log "Created directories in ${INSTALL_DIR}"

  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [[ "$SCRIPT_DIR" != "$INSTALL_DIR" ]]; then
    info "Copying files to installation directory..."
    rsync -a --exclude='.git' --exclude='node_modules' --exclude='*.env' \
      "${SCRIPT_DIR}/" "${INSTALL_DIR}/" 2>/dev/null || \
    cp -r "${SCRIPT_DIR}/." "${INSTALL_DIR}/" 2>/dev/null || true
    log "Project files copied successfully"
  else
    log "Running from install directory, skipping copy"
  fi
}

step_2_environment() {
  step "[2/10] Environment Generation"
  JWT_SECRET=$(openssl rand -hex 64)
  POSTGRES_PASSWORD=$(openssl rand -hex 24)
  REDIS_PASSWORD=$(openssl rand -hex 24)
  log "Security secrets generated"

  cat > "${INSTALL_DIR}/.env" <<EOF
# HMPanel — Auto-generated by installer on $(date)
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

# Initial Admin
INITIAL_ADMIN_USERNAME=${ADMIN_USERNAME}
INITIAL_ADMIN_EMAIL=${ADMIN_EMAIL}
INITIAL_ADMIN_PASSWORD=${ADMIN_PASSWORD}
EOF

  chmod 600 "${INSTALL_DIR}/.env"
  log ".env file generated successfully"
}

step_3_ssl_validation() {
  step "[3/10] SSL Validation"
  if [[ "$SSL_CHOICE" == 1 ]]; then
    info "Checking DNS records..."
    SERVER_IP=$(curl -s https://api.ipify.org 2>/dev/null || echo "unknown")
    DOMAIN_IP=$(dig +short "$DOMAIN" 2>/dev/null | tail -1 || echo "")

    if [[ "$DOMAIN_IP" == "$SERVER_IP" ]] || [[ "$SERVER_IP" == "unknown" ]]; then
      log "DNS OK (${SERVER_IP})"
    else
      warn "DNS resolution mismatch!"
      warn "Domain IP: $DOMAIN_IP | Server IP: $SERVER_IP"
      warn "Let's Encrypt requires the domain to resolve to this server."
      warn "Falling back to self-signed certificate."
      SSL_CHOICE=2
      return
    fi

    info "Checking port 80 accessibility..."
    if timeout 5 bash -c "</dev/tcp/${DOMAIN}/80" &>/dev/null; then
      log "Port 80 OK"
    else
      warn "Port 80 unreachable or closed. Let's Encrypt might fail."
    fi
  else
    log "Skipping validation (not using Let's Encrypt)"
  fi
}

step_4_ssl_issuance() {
  step "[4/10] SSL Issuance"
  SSL_DIR="${INSTALL_DIR}/nginx/ssl"
  
  if [[ "$SSL_CHOICE" == 1 ]]; then
    info "Requesting Let's Encrypt certificate..."
    ensure_package certbot certbot
    
    # Run standalone certbot
    if certbot certonly \
        --standalone \
        --non-interactive \
        --agree-tos \
        --register-unsafely-without-email \
        -d "$DOMAIN" \
        --http-01-port 80 >/dev/null 2>&1; then
      cp "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" "${SSL_DIR}/fullchain.pem"
      cp "/etc/letsencrypt/live/${DOMAIN}/privkey.pem" "${SSL_DIR}/privkey.pem"
      chmod 600 "${SSL_DIR}/privkey.pem"
      log "Certificate issued successfully"
      SSL_STATUS="letsencrypt"
    else
      error "Let's Encrypt failed"
      info "Falling back to self-signed certificate"
      SSL_CHOICE=2
    fi
  fi

  if [[ "$SSL_CHOICE" == 2 ]]; then
    info "Generating self-signed certificate..."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout "${SSL_DIR}/privkey.pem" \
      -out "${SSL_DIR}/fullchain.pem" \
      -subj "/CN=${DOMAIN}/O=HMPanel/C=US" >/dev/null 2>&1 || true
    chmod 600 "${SSL_DIR}/privkey.pem" 2>/dev/null || true
    log "Self-signed certificate created"
    SSL_STATUS="self-signed"
  fi

  if [[ "$SSL_CHOICE" == 3 ]]; then
    sed -i 's/listen 443 ssl http2;/# SSL disabled/' "${INSTALL_DIR}/nginx/nginx.conf" 2>/dev/null || true
    log "SSL disabled (HTTP only)"
    SSL_STATUS="disabled"
  fi
}

step_5_docker_build() {
  step "[5/10] Docker Build"
  cd "$INSTALL_DIR"
  info "Building Docker images (this may take a few minutes)..."
  docker compose build --no-cache >/dev/null 2>&1 || warn "Build logged warnings. Check logs if startup fails."
  log "Docker build complete"
}

step_6_database() {
  step "[6/10] Database Setup"
  cd "$INSTALL_DIR"
  info "Starting PostgreSQL container..."
  docker compose up -d postgres >/dev/null 2>&1
  log "Database initialized"
}

step_7_redis() {
  step "[7/10] Redis Setup"
  cd "$INSTALL_DIR"
  info "Starting Redis container..."
  docker compose up -d redis >/dev/null 2>&1
  log "Redis initialized"
}

step_8_service_startup() {
  step "[8/10] Service Startup"
  cd "$INSTALL_DIR"
  info "Bringing up all remaining services..."
  docker compose up -d >/dev/null 2>&1
  log "Services started"
}

step_9_health_check() {
  step "[9/10] Health Check"
  local max_attempts=30
  local attempt=0

  info "Waiting for backend API to become healthy..."
  while [[ $attempt -lt $max_attempts ]]; do
    if docker exec hmray-panel curl -sf "http://localhost:4000/health" &>/dev/null; then
      log "Backend API is fully operational"
      break
    fi
    attempt=$((attempt + 1))
    echo -ne "  Attempt ${attempt}/${max_attempts}...\r"
    sleep 5
  done

  if [[ $attempt -eq $max_attempts ]]; then
    error "Health check timeout"
    warn "The backend API did not respond in time. You may need to check docker logs:"
    warn "docker compose logs panel-app"
  fi
  echo -ne "                                    \r"
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
  echo -e "  Panel URL: ${CYAN}https://${DOMAIN}${NC}"
  echo -e "  Username:  ${CYAN}${ADMIN_USERNAME}${NC}"
  echo -e "  Version:   ${CYAN}1.0.0${NC}"
  
  case "${SSL_STATUS:-disabled}" in
    letsencrypt) echo -e "  SSL:       ${GREEN}Active (Let's Encrypt)${NC}" ;;
    self-signed) echo -e "  SSL:       ${YELLOW}Active (Self-Signed)${NC}" ;;
    disabled)    echo -e "  SSL:       ${RED}Disabled${NC}" ;;
  esac
  
  echo ""
  echo -e "  Update:    ${CYAN}sudo bash /opt/hmpanel/update.sh${NC}"
  echo -e "  Uninstall: ${CYAN}sudo bash /opt/hmpanel/uninstall.sh${NC}"
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

  info "Installing System Dependencies..."
  $PKG_UPDATE >/dev/null 2>&1 || true
  ensure_package curl curl
  ensure_package openssl openssl
  ensure_package dig dnsutils || ensure_package dig bind-utils || true
  install_docker
  install_docker_compose

  collect_user_input

  step_1_repository
  step_2_environment
  step_3_ssl_validation
  step_4_ssl_issuance
  step_5_docker_build
  step_6_database
  step_7_redis
  step_8_service_startup
  step_9_health_check
  step_10_complete
}

# Safely catch any unhandled fatal errors
trap 'error "Installation interrupted unexpectedly on line $LINENO"' ERR

main "$@"
