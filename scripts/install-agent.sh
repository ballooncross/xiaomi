#!/bin/zsh
set -euo pipefail

RADAR_INSTALL_DIR="$HOME/Library/Application Support/Personal Radar"
RADAR_PLIST_PATH="$HOME/Library/LaunchAgents/com.personalradar.agent.plist"
RADAR_LOG_PATH="$HOME/Library/Logs/personal-radar-agent.log"
RADAR_USER_DOMAIN="gui/$(id -u)"
# Repository the runtime worktree is created from. Defaults to this checkout.
RADAR_SOURCE_ROOT="${RADAR_SOURCE_ROOT:-${0:A:h:h}}"

mkdir -p "$RADAR_INSTALL_DIR" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cp -X "${0:A:h}/run-agent.sh" "$RADAR_INSTALL_DIR/run-agent.sh"
chmod 755 "$RADAR_INSTALL_DIR/run-agent.sh"
sed -e "s|__RADAR_INSTALL_DIR__|$RADAR_INSTALL_DIR|g" \
    -e "s|__RADAR_SOURCE_ROOT__|$RADAR_SOURCE_ROOT|g" \
    -e "s|__RADAR_LOG_PATH__|$RADAR_LOG_PATH|g" \
    "${0:A:h}/com.personalradar.agent.plist" > "$RADAR_PLIST_PATH"

launchctl bootout "$RADAR_USER_DOMAIN"/com.personalradar.agent 2>/dev/null || true
launchctl bootstrap "$RADAR_USER_DOMAIN" "$RADAR_PLIST_PATH"
launchctl kickstart -k "$RADAR_USER_DOMAIN"/com.personalradar.agent

echo "Personal Radar agent installed from $RADAR_SOURCE_ROOT and started."
