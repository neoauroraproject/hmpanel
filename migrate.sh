#!/usr/bin/env bash
# HMPanel - Architecture Migration Script
# Run this once on your host to fix the broken updater.

echo "Migrating HMPanel to the new Deployment Architecture..."
INSTALL_DIR="/opt/hmpanel"

if [[ ! -d "$INSTALL_DIR" ]]; then
  echo "Error: /opt/hmpanel not found."
  exit 1
fi

cd "$INSTALL_DIR" || exit 1

# Force download the new master updater
curl -fsSL "https://raw.githubusercontent.com/neoauroraproject/hmpanel/main/update.sh" -o update.sh
chmod +x update.sh

# Run the new updater to sync all files and CLI
bash update.sh

echo "Migration Complete! You can now use 'hm' to update."
