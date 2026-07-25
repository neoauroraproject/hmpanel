#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  HMPanel — Verbose restore (always shows progress)
#  Usage:
#    curl -fsSL https://raw.githubusercontent.com/neoauroraproject/hmpanel/main/scripts/restore-backup.sh | bash -s -- YOUR_BACKUP.tar.gz
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/hmpanel}"
BACKUP_NAME="${1:-}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
die() { echo -e "${RED}✘${NC}  $*" >&2; exit 1; }
info() { echo -e "${BLUE}ℹ${NC}  $*"; }
log() { echo -e "${GREEN}✔${NC}  $*"; }

[[ $EUID -eq 0 ]] || die "Run as root."
[[ -n "$BACKUP_NAME" ]] || die "Usage: $0 <backup-file-name-or-path>"
[[ -d "$INSTALL_DIR" ]] || die "HMPanel not found at $INSTALL_DIR"
cd "$INSTALL_DIR"

info "Refreshing CLI from GitHub..."
curl -fsSL https://raw.githubusercontent.com/neoauroraproject/hmpanel/main/cli.sh -o "${INSTALL_DIR}/cli.sh"
cp "${INSTALL_DIR}/cli.sh" /usr/local/bin/hmpanel
chmod +x /usr/local/bin/hmpanel
ln -sf /usr/local/bin/hmpanel /usr/local/bin/hm
log "CLI refreshed."

info "Listing backups in ${INSTALL_DIR}/backups ..."
ls -lt "${INSTALL_DIR}/backups"/*.tar.gz 2>/dev/null | head -20 || true

info "Starting restore of: ${BACKUP_NAME}"
# Force verbose path (no --json)
set +e
hm restore "$BACKUP_NAME"
code=$?
set -e

if [[ $code -eq 0 ]]; then
  log "Restore finished OK (exit $code)."
  docker exec hmpanel-postgres psql -U panel_user -d panel_db -c \
    'SELECT (SELECT COUNT(*) FROM "Admin") AS admins, (SELECT COUNT(*) FROM "Panel") AS panels, (SELECT COUNT(*) FROM "Client") AS clients;' \
    || true
  exit 0
else
  die "Restore failed (exit $code). Scroll up for the error details."
fi
