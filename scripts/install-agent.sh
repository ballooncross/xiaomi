#!/bin/zsh
set -euo pipefail

RADAR_INSTALL_DIR="$HOME/Library/Application Support/Personal Radar"
RADAR_PLIST_PATH="$HOME/Library/LaunchAgents/com.personalradar.agent.plist"
RADAR_USER_DOMAIN="gui/$(id -u)"

mkdir -p "$RADAR_INSTALL_DIR" "$HOME/Library/LaunchAgents"
cp -X "${0:A:h}/run-agent.sh" "$RADAR_INSTALL_DIR/run-agent.sh"
chmod 755 "$RADAR_INSTALL_DIR/run-agent.sh"
cp -X "${0:A:h}/com.personalradar.agent.plist" "$RADAR_PLIST_PATH"

launchctl bootout "$RADAR_USER_DOMAIN"/com.personalradar.agent 2>/dev/null || true
launchctl bootstrap "$RADAR_USER_DOMAIN" "$RADAR_PLIST_PATH"
launchctl kickstart -k "$RADAR_USER_DOMAIN"/com.personalradar.agent

echo "Personal Radar agent installed and started."
