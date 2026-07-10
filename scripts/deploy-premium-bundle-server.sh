#!/usr/bin/env bash
# Deploy latest panel + premium bundle on production server.
# Run as root on the licensed panel host (e.g. /opt/hmpanel).
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/hmpanel}"
BUNDLE_VERSION="${BUNDLE_VERSION:-1.5.7}"

cd "$INSTALL_DIR" || exit 1

echo "==> [1/5] Sync panel infrastructure & pull images"
curl -fsSL "https://raw.githubusercontent.com/neoauroraproject/hmpanel/main/update.sh" -o /tmp/hmpanel-update.sh
bash /tmp/hmpanel-update.sh

echo "==> [2/5] Restart panel stack"
docker compose up -d --force-recreate panel-app
sleep 8

echo "==> [3/5] Trigger premium bundle update via internal API"
ADMIN_PASS="${ADMIN_PASS:-}"
if [[ -z "$ADMIN_PASS" && -f .env ]]; then
  ADMIN_PASS=$(grep -E '^ADMIN_PASSWORD=' .env | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
fi

if [[ -z "$ADMIN_PASS" ]]; then
  echo "WARN: ADMIN_PASSWORD not set — skip API bundle update; use Settings → Update premium bundle in UI."
else
  TOKEN=$(docker exec hmpanel-panel curl -sS -X POST "http://127.0.0.1:4000/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"admin\",\"password\":\"${ADMIN_PASS}\"}" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')
  if [[ -n "$TOKEN" ]]; then
    docker exec hmpanel-panel curl -sS -X POST "http://127.0.0.1:4000/api/platform/license/update-bundle" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "Content-Type: application/json"
    echo
    docker exec hmpanel-panel curl -sS -X POST "http://127.0.0.1:4000/api/platform/license/reload-plugins" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "Content-Type: application/json"
    echo
  else
    echo "WARN: Could not obtain admin token — update bundle from Settings UI."
  fi
fi

echo "==> [4/5] Verify premium load"
docker logs hmpanel-panel 2>&1 | tail -40 | grep -iE 'premium|bundle|error' || true

echo "==> [5/5] Health check"
docker exec hmpanel-panel curl -sf "http://127.0.0.1:4000/health" && echo " OK"

echo "Done. Expected bundle version: ${BUNDLE_VERSION}. Hard-refresh browser (Ctrl+Shift+R)."
