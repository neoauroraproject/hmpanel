#!/usr/bin/env bash
# Install premium bundle via license server (no GitHub) after DISABLE_PREMIUM recovery.
# Usage on server as root:
#   ADMIN_PASS='your-admin-password' bash scripts/install-premium-bundle-via-license.sh
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/hmpanel}"
CONTAINER="${HMPANEL_CONTAINER:-hmpanel-panel}"
API="http://127.0.0.1:4000/api"

cd "$INSTALL_DIR"
[[ -f .env ]] || { echo "Missing .env"; exit 1; }

ADMIN_PASS="${ADMIN_PASS:-}"
if [[ -z "$ADMIN_PASS" ]]; then
  ADMIN_PASS=$(grep -E '^INITIAL_ADMIN_PASSWORD=' .env | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
fi
if [[ -z "$ADMIN_PASS" ]]; then
  ADMIN_PASS=$(grep -E '^ADMIN_PASSWORD=' .env | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
fi
[[ -n "$ADMIN_PASS" ]] || { echo "Set ADMIN_PASS=..."; exit 1; }

echo "==> Login"
TOKEN=$(docker exec "$CONTAINER" curl -sS -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin\",\"password\":\"${ADMIN_PASS}\"}" \
  | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')
[[ -n "$TOKEN" ]] || { echo "Login failed"; exit 1; }

echo "==> Download + install bundle from license server"
docker exec "$CONTAINER" curl -sS -X POST "$API/platform/license/update-bundle" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
echo

echo "==> Wait for backend (up to 2 min)"
for i in $(seq 1 40); do
  if docker exec "$CONTAINER" curl -sf http://127.0.0.1:4000/health &>/dev/null; then
    echo "OK — panel healthy"
    docker exec "$CONTAINER" cat /opt/hmpanel/premium/manifest.json 2>/dev/null || true
    exit 0
  fi
  sleep 3
done

echo "Health timeout — check: docker logs $CONTAINER --tail 80"
exit 1
