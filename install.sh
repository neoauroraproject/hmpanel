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
  echo -e "  ${BOLD}Installation Mode${NC}"
  echo -e "  ${BOLD}1${NC}) Fast Install (Recommended)"
  echo -e "  ${BOLD}2${NC}) Advanced Install"
  read -rp "  Select mode [1]: " INSTALL_MODE || true
  [[ -z "$INSTALL_MODE" ]] && INSTALL_MODE=1

  echo ""
  if [[ "$INSTALL_MODE" == 1 ]]; then
    info "Fast Install Selected"
    read -rp "  Domain name (e.g. panel.yourdomain.com): " DOMAIN || true
    [[ -z "$DOMAIN" ]] && DOMAIN="localhost"
    
    read -rp "  Admin username [admin]: " ADMIN_USERNAME || true
    [[ -z "$ADMIN_USERNAME" ]] && ADMIN_USERNAME="admin"
    
    while true; do
      read -rsp "  Admin password (min 8 chars): " ADMIN_PASSWORD || true
      echo ""
      if [[ -z "$ADMIN_PASSWORD" ]] || [[ ${#ADMIN_PASSWORD} -lt 8 ]]; then
        warn "Password must be at least 8 characters"
      else
        break
      fi
    done

    ADMIN_EMAIL=""
    HTTP_PORT=80
    HTTPS_PORT=443
    SSL_CHOICE=1 # Attempt Let's Encrypt automatically afterwards
  else
    info "Advanced Install Selected"
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
  fi

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
  if [[ "$SCRIPT_DIR" != "$INSTALL_DIR" ]]; then
    run_with_spinner "Copying files to installation directory" rsync -a --exclude='.git' --exclude='node_modules' --exclude='*.env' "${SCRIPT_DIR}/" "${INSTALL_DIR}/" || cp -r "${SCRIPT_DIR}/." "${INSTALL_DIR}/"
  else
    log "Running from install directory, skipping copy"
  fi
}

step_2_environment() {
  step "[2/10] Environment"
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
    sed -i 's/listen 443 ssl http2;/# SSL disabled/' "${INSTALL_DIR}/nginx/nginx.conf" 2>/dev/null || true
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
  if ! run_with_spinner "Starting PostgreSQL container" docker compose up -d postgres; then
    die "Failed to start database container."
  fi
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
  if ! run_with_spinner "Building Docker images" docker compose build --no-cache; then
    die "Docker build failed."
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
    if docker exec HMPanel-panel curl -sf "http://localhost:4000/health" &>/dev/null; then
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
    error "Health check timeout"
    warn "The backend API did not respond in time. You may need to check docker logs:"
    warn "docker compose logs panel-app"
  fi
}

step_8_ssl() {
  step "[8/10] SSL"
  SSL_DIR="${INSTALL_DIR}/nginx/ssl"
  SSL_STATUS="disabled"
  
  if [[ "$SSL_CHOICE" == 1 ]]; then
    ensure_package certbot certbot

    while true; do
      info "Checking external HTTP challenge port (80) required by Let's Encrypt..."
      if ! timeout 5 bash -c "</dev/tcp/${DOMAIN}/80" &>/dev/null; then
         warn "Port 80 unreachable or closed. Let's Encrypt might fail."
      else
         log "Port 80 reachable"
      fi

      info "Requesting Let's Encrypt certificate..."
      
      # Stop Nginx temporarily to free port 80
      docker stop HMPanel-nginx >/dev/null 2>&1 || true

      local le_success=false
      local certbot_exit=0
      run_with_spinner "Running Certbot standalone" certbot certonly \
          --standalone \
          --non-interactive \
          --agree-tos \
          --register-unsafely-without-email \
          -d "$DOMAIN" \
          --http-01-port 80 || certbot_exit=$?
      
      if [[ $certbot_exit -eq 0 && -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" && -f "/etc/letsencrypt/live/${DOMAIN}/privkey.pem" ]]; then
        cp "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" "${SSL_DIR}/fullchain.pem"
        cp "/etc/letsencrypt/live/${DOMAIN}/privkey.pem" "${SSL_DIR}/privkey.pem"
        chmod 600 "${SSL_DIR}/privkey.pem"
        log "Certificate issued successfully"
        SSL_STATUS="letsencrypt"
        le_success=true
      fi
      
      # Restart nginx
      docker start HMPanel-nginx >/dev/null 2>&1 || true

      if [[ "$le_success" == true ]]; then
        break
      fi

      error "Let's Encrypt failed."
      
      if [[ "$INSTALL_MODE" == 2 ]]; then
        echo -e "  ${BOLD}SSL Issuance Failed. Choose an option:${NC}"
        echo -e "  1) Retry Let's Encrypt"
        echo -e "  2) Use Self-Signed Certificate"
        echo -e "  3) Switch to HTTP Only"
        read -rp "  Choice [2]: " fb_choice || true
        [[ -z "$fb_choice" ]] && fb_choice=2
        
        if [[ "$fb_choice" == 1 ]]; then
          continue
        elif [[ "$fb_choice" == 3 ]]; then
          SSL_CHOICE=3
          sed -i 's/listen 443 ssl http2;/# SSL disabled/' "${INSTALL_DIR}/nginx/nginx.conf" 2>/dev/null || true
          docker exec HMPanel-nginx nginx -s reload >/dev/null 2>&1 || true
          SSL_STATUS="disabled"
          break
        else
          SSL_CHOICE=2
          SSL_STATUS="self-signed"
          break
        fi
      else
        warn "SSL failed but installation will continue with self-signed certificate."
        SSL_CHOICE=2
        SSL_STATUS="self-signed"
        break
      fi
    done
  fi

  if [[ "$SSL_CHOICE" == 2 ]]; then
    # We already generated a dummy self-signed cert in step 2.
    log "Using self-signed certificate"
    SSL_STATUS="self-signed"
  fi

  if [[ "$SSL_CHOICE" == 3 ]]; then
    log "SSL disabled (HTTP only)"
    SSL_STATUS="disabled"
  fi
}

step_9_final_verification() {
  step "[9/10] Final Verification"
  local panel_status="Stopped"
  if docker inspect -f '{{.State.Status}}' HMPanel-panel 2>/dev/null | grep -q "running"; then
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
  
  if docker inspect -f '{{.State.Status}}' HMPanel-panel 2>/dev/null | grep -q "running"; then
    echo -e "  Panel Status: ${GREEN}Running${NC}"
  else
    echo -e "  Panel Status: ${RED}Stopped/Failed${NC}"
  fi
  
  echo -e "  Version:      ${CYAN}1.0.0${NC}"
  echo -e "  Edition:      ${CYAN}Community${NC}"
  
  if [[ "$SSL_STATUS" == "letsencrypt" || "$SSL_STATUS" == "self-signed" ]]; then
    echo -e "  URL:          ${CYAN}https://${DOMAIN}${NC}"
  else
    local SERVER_IP
    SERVER_IP=$(curl -s https://api.ipify.org 2>/dev/null || echo "SERVER_IP")
    echo -e "  URL:          ${CYAN}http://${SERVER_IP}${NC}"
    echo -e "  URL:          ${CYAN}http://${DOMAIN}${NC}"
  fi
  
  case "${SSL_STATUS:-disabled}" in
    letsencrypt) echo -e "  SSL:          ${GREEN}Active (Let's Encrypt)${NC}" ;;
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
