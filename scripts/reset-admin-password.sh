#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  HMPanel — Reset main (owner / SUPER_ADMIN) password
#
#  One-liner (interactive):
#    bash <(curl -fsSL https://raw.githubusercontent.com/neoauroraproject/hmpanel/main/scripts/reset-admin-password.sh)
#
#  One-liner (with password):
#    bash <(curl -fsSL https://raw.githubusercontent.com/neoauroraproject/hmpanel/main/scripts/reset-admin-password.sh) 'YourNewPassword'
#
#  After update, you can also use:
#    sudo hm admin reset-password
#    sudo hm passwd
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

INSTALL_DIR="/opt/hmpanel"

die() { echo -e "${RED}✘${NC}  $*" >&2; exit 1; }
ok()  { echo -e "${GREEN}✔${NC}  $*"; }

if [[ $EUID -ne 0 ]]; then
  die "Run as root (sudo)."
fi

# Prefer installed CLI when it already includes admin_reset_password.
CLI_BIN=""
if [[ -x /usr/local/bin/hmpanel ]]; then
  CLI_BIN="/usr/local/bin/hmpanel"
elif command -v hm &>/dev/null; then
  CLI_BIN="$(command -v hm)"
elif [[ -f "${INSTALL_DIR}/cli.sh" ]]; then
  CLI_BIN="${INSTALL_DIR}/cli.sh"
fi

if [[ -n "$CLI_BIN" ]] && grep -q 'admin_reset_password()' "$CLI_BIN" 2>/dev/null; then
  exec "$CLI_BIN" admin reset-password "${1:-}"
fi

# ── Standalone fallback (older CLI without this command) ──────────
docker inspect hmpanel-panel &>/dev/null || die "Panel container not found. Is HMPanel installed at ${INSTALL_DIR}?"
docker inspect -f '{{.State.Running}}' hmpanel-panel 2>/dev/null | grep -qi true \
  || die "Panel container is not running."
docker inspect hmpanel-postgres &>/dev/null || die "Postgres container not found."

pg_user="panel_user"
if [[ -f "${INSTALL_DIR}/.env" ]]; then
  pg_user=$(grep -E '^POSTGRES_USER=' "${INSTALL_DIR}/.env" | head -n1 | cut -d= -f2- | tr -d '\r"' || true)
  pg_user="${pg_user:-panel_user}"
fi

new_pass="${1:-}"
if [[ -z "$new_pass" || "$new_pass" == "--json" || "$new_pass" == "--debug" ]]; then
  new_pass=""
  if [[ -r /dev/tty ]]; then
    read -rsp "  New admin password (min 8 chars): " new_pass </dev/tty || true
    echo ""
    read -rsp "  Confirm password: " confirm_pass </dev/tty || true
    echo ""
  else
    read -rsp "  New admin password (min 8 chars): " new_pass || true
    echo ""
    read -rsp "  Confirm password: " confirm_pass || true
    echo ""
  fi
  [[ "$new_pass" == "${confirm_pass:-}" ]] || die "Passwords do not match."
fi
[[ -n "$new_pass" && ${#new_pass} -ge 8 ]] || die "Password must be at least 8 characters."

owner_id=$(docker exec hmpanel-postgres psql -U "$pg_user" -d panel_db -tAc \
  "SELECT id FROM \"Admin\" WHERE \"isOwner\" = true OR role = 'SUPER_ADMIN' ORDER BY \"isOwner\" DESC, \"createdAt\" ASC LIMIT 1" \
  | tr -d '[:space:]')
[[ -n "$owner_id" && "$owner_id" =~ ^[a-zA-Z0-9_-]+$ ]] || die "No SUPER_ADMIN / owner account found."
owner_user=$(docker exec hmpanel-postgres psql -U "$pg_user" -d panel_db -tAc \
  "SELECT username FROM \"Admin\" WHERE id = '${owner_id}'" | tr -d '[:space:]')
[[ -n "$owner_user" ]] || die "No SUPER_ADMIN / owner account found."

hash=$(
  docker exec -e NEW_PASS="$new_pass" hmpanel-panel node -e \
    'require("bcryptjs").hash(process.env.NEW_PASS,10).then(h=>process.stdout.write(h))'
) || true
[[ -n "$hash" && "$hash" == \$2* ]] || die "Failed to hash password with bcryptjs."

docker exec hmpanel-postgres psql -U "$pg_user" -d panel_db -v ON_ERROR_STOP=1 \
  -c "UPDATE \"Admin\" SET \"passwordHash\" = \$hm\$${hash}\$hm\$, \"tokenVersion\" = \"tokenVersion\" + 1, status = 'active' WHERE id = '${owner_id}';" \
  >/dev/null

if [[ -f "${INSTALL_DIR}/.env" ]]; then
  # Escape backslashes and double-quotes for .env double-quoted value.
  esc_pass=$(printf '%s' "$new_pass" | sed 's/\\/\\\\/g; s/"/\\"/g')
  awk -v v="$esc_pass" '
    BEGIN { done=0 }
    index($0, "INITIAL_ADMIN_PASSWORD=") == 1 {
      print "INITIAL_ADMIN_PASSWORD=\"" v "\""
      done=1
      next
    }
    { print }
    END { if (!done) print "INITIAL_ADMIN_PASSWORD=\"" v "\"" }
  ' "${INSTALL_DIR}/.env" > "${INSTALL_DIR}/.env.tmp" \
    && mv "${INSTALL_DIR}/.env.tmp" "${INSTALL_DIR}/.env"
  chmod 600 "${INSTALL_DIR}/.env" 2>/dev/null || true
  chown 1001:1001 "${INSTALL_DIR}/.env" 2>/dev/null || true
fi

ok "Password updated for admin ${CYAN}${owner_user}${NC}"
echo "  Log in again with the new password (old sessions were invalidated)."
