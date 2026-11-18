#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  HMPanel Panel — Uninstaller v3.0
#  https://github.com/HMPanel/panel
#
#  Usage:  sudo bash uninstall.sh [--standard | --complete] [-y]
#    --standard   remove the app, keep database, uploads, backups and .env
#    --complete   remove everything (database, volumes, images, certificates)
#    -y           do not ask for confirmation
# ═══════════════════════════════════════════════════════════════════
set -uo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()     { echo -e "${GREEN}✔${NC}  $*"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $*"; }
error()   { echo -e "${RED}✘${NC}  $*" >&2; }
info()    { echo -e "${BLUE}ℹ${NC}  $*"; }
step()    { echo -e "\n${CYAN}${BOLD}──── $* ────${NC}"; }
die()     { error "$*"; exit 1; }

# Everything the installer and the CLI create. Keep these lists in sync with
# docker-compose.yml, install.sh (write_systemd_unit) and cli.sh.
CONTAINERS=(hmpanel-panel hmpanel-nginx hmpanel-postgres hmpanel-redis hmpanel-host-agent)
LEGACY_CONTAINERS=(panel-app panel-frontend)
DATA_VOLUMES=(hmpanel_pgdata hmpanel_redisdata hmpanel_uploads hmpanel_logs)
APP_VOLUMES=(hmpanel_premium)
LEGACY_VOLUMES=(hmpanel_backups hmpanel_certbot_certs hmpanel_certbot_www)
NETWORKS=(hmpanel_network hmpanel_default)
SERVICES=(hmpanel hmpanel-panel)
APP_IMAGE="ghcr.io/neoauroraproject/hmpanel"
TMP_LEFTOVERS=(/tmp/hmpanel_install /tmp/hmpanel-install.sh /tmp/hmpanel-update.sh /tmp/hmpanel_ssl.lock)

COMPOSE_BIN=()
resolve_compose() {
  if docker compose version &>/dev/null; then COMPOSE_BIN=(docker compose); return 0; fi
  if command -v docker-compose &>/dev/null; then COMPOSE_BIN=(docker-compose); return 0; fi
  return 1
}
compose() {
  if [[ ${#COMPOSE_BIN[@]} -eq 0 ]]; then resolve_compose || return 1; fi
  "${COMPOSE_BIN[@]}" "$@"
}
have_docker() { command -v docker &>/dev/null && docker info &>/dev/null; }

check_root() {
  [[ $EUID -eq 0 ]] || die "This uninstaller must be run as root. Use: sudo bash uninstall.sh"
}

stop_containers() {
  step "Stopping Services"
  # systemd first, otherwise its ExecStop/Restart can bring containers back.
  local svc
  for svc in "${SERVICES[@]}"; do
    if systemctl list-unit-files 2>/dev/null | grep -q "^${svc}\.service"; then
      systemctl stop "$svc" &>/dev/null || true
    fi
  done

  have_docker || { warn "Docker is not running — skipping containers, volumes and images."; return; }

  if [[ -f "${INSTALL_DIR}/docker-compose.yml" ]]; then
    info "Stopping docker compose stack..."
    if [[ "$REMOVE_DATA" == "y" ]]; then
      (cd "$INSTALL_DIR" && compose down -v --remove-orphans --rmi all) &>/dev/null || true
    else
      (cd "$INSTALL_DIR" && compose down --remove-orphans) &>/dev/null || true
    fi
  fi

  # The compose file may be missing, from another version, or under another
  # project name: remove the containers by name so a reinstall never hits
  # "container name is already in use".
  local c removed=0
  for c in "${CONTAINERS[@]}" "${LEGACY_CONTAINERS[@]}"; do
    if docker ps -a --format '{{.Names}}' | grep -qx "$c"; then
      docker rm -f "$c" &>/dev/null && removed=$((removed+1))
    fi
  done
  log "Containers stopped and removed"

  local n
  for n in "${NETWORKS[@]}"; do docker network rm "$n" &>/dev/null || true; done
  log "Docker networks removed"
}

remove_docker_data() {
  have_docker || return
  local v
  # The Premium bundle is app code, not user data. A bundle from an older
  # release can stop a newer panel from booting, so it always goes; activate
  # the license again after reinstalling to download a matching one.
  for v in "${APP_VOLUMES[@]}"; do docker volume rm "$v" &>/dev/null || true; done

  if [[ "$REMOVE_DATA" == "y" ]]; then
    for v in "${DATA_VOLUMES[@]}" "${LEGACY_VOLUMES[@]}"; do docker volume rm "$v" &>/dev/null || true; done
    # Anything else the stack left with our prefix (older releases used other names).
    docker volume ls -q --filter name='^hmpanel_' 2>/dev/null | xargs -r docker volume rm &>/dev/null || true
    log "Docker volumes removed"

    docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null \
      | grep -E "^${APP_IMAGE}:" | xargs -r docker rmi -f &>/dev/null || true
    log "Panel images removed"
  else
    log "Kept data volumes: ${DATA_VOLUMES[*]}"
  fi
}

remove_systemd() {
  step "Removing Systemd Service"
  local svc found=0
  for svc in "${SERVICES[@]}"; do
    if [[ -f "/etc/systemd/system/${svc}.service" ]] || systemctl list-unit-files 2>/dev/null | grep -q "^${svc}\.service"; then
      systemctl disable "$svc" &>/dev/null || true
      rm -f "/etc/systemd/system/${svc}.service"
      rm -f "/etc/systemd/system/multi-user.target.wants/${svc}.service"
      found=1
    fi
  done
  systemctl daemon-reload &>/dev/null || true
  systemctl reset-failed &>/dev/null || true
  if [[ $found -eq 1 ]]; then log "Systemd service removed"; else log "No systemd service found"; fi
}

remove_cli_and_shell() {
  step "Removing CLI and shell hooks"
  rm -f /usr/local/bin/hmpanel /usr/local/bin/hm
  log "CLI binaries removed"

  # Only our own lines: other acme.sh installs and cron jobs on this server stay.
  local rc
  for rc in /root/.bashrc /root/.profile /root/.zshrc "${HOME:-/root}/.bashrc"; do
    [[ -f "$rc" ]] || continue
    sed -i -e '/alias hm=/d' -e '/alias hmpanel=/d' -e "\#${INSTALL_DIR}/acme.sh#d" "$rc" 2>/dev/null || true
  done
  local current_cron
  if current_cron="$(crontab -l 2>/dev/null)"; then
    # Read fully before writing back; a pipe from `crontab -l` into `crontab -` can race.
    printf '%s\n' "$current_cron" | grep -v -e "${INSTALL_DIR}" -e 'hmpanel' | crontab - 2>/dev/null || true
  fi
  rm -f /etc/cron.d/hmpanel* 2>/dev/null || true
  log "Shell aliases and cron entries removed"
}

remove_files() {
  step "Removing Installation Files"
  rm -rf "${TMP_LEFTOVERS[@]}" /tmp/hm-ssl-vhost-* 2>/dev/null || true

  [[ -n "$INSTALL_DIR" && "$INSTALL_DIR" != "/" ]] || die "Refusing to delete install directory '${INSTALL_DIR}'"

  if [[ "$REMOVE_DATA" == "y" ]]; then
    rm -rf "$INSTALL_DIR"
    log "Deleted ${INSTALL_DIR}"
    return
  fi

  # Standard: keep .env (database credentials match the kept volume) and backups.
  local save
  save="$(mktemp -d /tmp/hmpanel_keep.XXXXXX)"
  [[ -d "${INSTALL_DIR}/backups" ]] && mv "${INSTALL_DIR}/backups" "${save}/backups"
  [[ -f "${INSTALL_DIR}/.env" ]] && mv "${INSTALL_DIR}/.env" "${save}/.env"
  rm -rf "$INSTALL_DIR"
  mkdir -p "$INSTALL_DIR"
  [[ -d "${save}/backups" ]] && mv "${save}/backups" "${INSTALL_DIR}/backups"
  [[ -f "${save}/.env" ]] && mv "${save}/.env" "${INSTALL_DIR}/.env"
  rm -rf "$save"
  log "Application files removed; .env and backups kept in ${INSTALL_DIR}"
}

verify_uninstallation() {
  step "Auditing Uninstallation"
  local left=() c v svc

  [[ -e /usr/local/bin/hmpanel ]] && left+=("/usr/local/bin/hmpanel")
  [[ -e /usr/local/bin/hm ]] && left+=("/usr/local/bin/hm")
  for svc in "${SERVICES[@]}"; do
    [[ -f "/etc/systemd/system/${svc}.service" ]] && left+=("systemd unit ${svc}.service")
  done
  if have_docker; then
    for c in "${CONTAINERS[@]}" "${LEGACY_CONTAINERS[@]}"; do
      docker ps -a --format '{{.Names}}' | grep -qx "$c" && left+=("container ${c}")
    done
    for v in "${NETWORKS[@]}"; do
      docker network ls --format '{{.Name}}' | grep -qx "$v" && left+=("network ${v}")
    done
    for v in "${APP_VOLUMES[@]}"; do
      docker volume ls -q | grep -qx "$v" && left+=("volume ${v}")
    done
    if [[ "$REMOVE_DATA" == "y" ]]; then
      while read -r v; do [[ -n "$v" ]] && left+=("volume ${v}"); done < <(docker volume ls -q --filter name='^hmpanel_')
    fi
  fi
  [[ "$REMOVE_DATA" == "y" && -d "$INSTALL_DIR" ]] && left+=("directory ${INSTALL_DIR}")

  echo ""
  if [[ ${#left[@]} -eq 0 ]]; then
    log "Audit passed — nothing left behind."
    echo -e "${GREEN}${BOLD}HMPanel Panel has been uninstalled.${NC}"
    if [[ "$REMOVE_DATA" != "y" ]]; then
      info "Database, uploads, backups and .env were kept. Run install.sh again to reinstall with your data."
    fi
  else
    error "Still present (${#left[@]}):"
    for c in "${left[@]}"; do echo "   - $c"; done
    echo -e "${YELLOW}Run the uninstaller again, or remove these by hand.${NC}"
    exit 1
  fi
}

main() {
  local mode="" assume_yes="n" arg
  for arg in "$@"; do
    case "$arg" in
      --standard) mode=1 ;;
      --complete) mode=2 ;;
      -y|--yes) assume_yes="y" ;;
      -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    esac
  done

  echo -e "${RED}${BOLD}HMPanel Panel Uninstaller v3.0${NC}"
  check_root

  INSTALL_DIR="/opt/hmpanel"
  if [[ ! -d "$INSTALL_DIR" ]]; then
    INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  fi
  info "Install directory: ${INSTALL_DIR}"

  if [[ -z "$mode" ]]; then
    echo -e "${CYAN}${BOLD}Select Uninstall Mode:${NC}"
    echo -e "  1. ${BOLD}Standard Uninstall${NC} - Removes the application. Keeps database, uploads, backups and .env."
    echo -e "  2. ${BOLD}Complete Removal${NC} - Removes EVERYTHING: database, volumes, images, backups, certificates."
    echo -e "  3. Cancel"
    echo ""
    read -rp "Select an option [1-3]: " mode
  fi

  case "$mode" in
    1) REMOVE_DATA="n"; log "Selected: Standard Uninstall" ;;
    2)
      if [[ "$assume_yes" != "y" ]]; then
        echo ""
        echo -e "${YELLOW}${BOLD}  WARNING: Complete Removal cannot be undone!${NC}"
        echo -e "  It permanently deletes the PostgreSQL database, Redis data, uploads,"
        echo -e "  logs, all backups in ${INSTALL_DIR}/backups and SSL certificates."
        echo ""
        read -rp "  Type DELETE to confirm: " confirm
        [[ "$confirm" == "DELETE" ]] || die "Uninstall cancelled."
      fi
      REMOVE_DATA="y"; log "Selected: Complete Removal"
      ;;
    *) die "Uninstall cancelled." ;;
  esac

  # Run from a directory that is about to survive.
  cd / || true

  stop_containers
  remove_docker_data
  remove_systemd
  remove_cli_and_shell
  remove_files
  verify_uninstallation
}

main "$@"
