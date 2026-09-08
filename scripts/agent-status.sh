#!/bin/zsh
# Show whether the Personal Radar local agent is scheduled, running, and what
# its last cycle did. Read-only; safe to run at any time.
#
#   npm run agent:status
#   RADAR_STATUS_LOG_LINES=30 npm run agent:status

RADAR_LABEL="com.personalradar.agent"
RADAR_USER_DOMAIN="gui/$(id -u)"
RADAR_PLIST_PATH="$HOME/Library/LaunchAgents/$RADAR_LABEL.plist"
RADAR_LOG_PATH="$HOME/Library/Logs/personal-radar-agent.log"
RADAR_STATUS_LOG_LINES="${RADAR_STATUS_LOG_LINES:-8}"

echo "== launchd scheduler ($RADAR_LABEL) =="
if RADAR_PRINT="$(launchctl print "$RADAR_USER_DOMAIN/$RADAR_LABEL" 2>/dev/null)"; then
  echo "installed: yes"
  print -r -- "$RADAR_PRINT" | grep -E '^\s*(state|last exit code|runs|path) =' | sed 's/^[[:space:]]*/  /'
  if [ -f "$RADAR_PLIST_PATH" ]; then
    RADAR_INTERVAL="$(/usr/libexec/PlistBuddy -c 'Print :StartInterval' "$RADAR_PLIST_PATH" 2>/dev/null)"
    [ -n "$RADAR_INTERVAL" ] && echo "  interval = ${RADAR_INTERVAL}s ($((RADAR_INTERVAL / 60)) min)"
  fi
  echo "  (state = not running means idle between cycles; job state = exited with code 0 is healthy)"
else
  echo "installed: no  (scripts/install-agent.sh installs it)"
fi

echo
echo "== agent processes right now =="
RADAR_PROCS="$(ps -axo pid=,etime=,command= | grep -E 'scripts/agent\.ts|run-agent\.sh' | grep -v -E 'grep|agent-status\.sh')"
if [ -n "$RADAR_PROCS" ]; then
  echo "  PID  ELAPSED  COMMAND"
  print -r -- "$RADAR_PROCS" | sed 's/^/  /'
  if print -r -- "$RADAR_PROCS" | grep -q 'scripts/agent.ts' && ! print -r -- "$RADAR_PROCS" | grep -q -- '--once'; then
    echo "  WARNING: a foreground loop (no --once) is running. Do not run it beside the scheduler."
  fi
else
  echo "  (none; a scheduled cycle is a short-lived process, so this is the normal idle state)"
fi

echo
echo "== last $RADAR_STATUS_LOG_LINES log lines ($RADAR_LOG_PATH) =="
if [ -f "$RADAR_LOG_PATH" ]; then
  tail -n "$RADAR_STATUS_LOG_LINES" "$RADAR_LOG_PATH" | sed 's/^/  /'
else
  echo "  (no log yet; the scheduler has not run on this machine)"
fi
