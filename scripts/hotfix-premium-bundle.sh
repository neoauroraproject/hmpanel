#!/bin/sh
# Emergency hotfix: patch running panel container with fixed premium-bundle service.
# Usage on server: bash scripts/hotfix-premium-bundle.sh
set -e
CONTAINER="${HMPANEL_CONTAINER:-hmpanel-panel}"
echo "Patching container: $CONTAINER"

docker cp backend/dist/platform/premium-bundle.service.js "$CONTAINER:/app/backend/dist/platform/premium-bundle.service.js"
docker cp backend/dist/platform/license-activation.service.js "$CONTAINER:/app/backend/dist/platform/license-activation.service.js"
docker cp backend/dist/platform/platform.controller.js "$CONTAINER:/app/backend/dist/platform/platform.controller.js"

echo "Restarting backend inside container..."
docker exec "$CONTAINER" sh -c 'pkill -f "node backend/dist/main.js" || true; sleep 1; PORT=${BACKEND_PORT:-4000} node backend/dist/main.js &'
sleep 2
echo "Done. Try Update premium bundle again, or POST /api/platform/license/diagnose-bundle"
