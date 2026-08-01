#!/bin/zsh
# Wrapper for a single scheduled agent run. It executes from a dedicated
# detached worktree so the user's active repository branch is never involved.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh" >/dev/null 2>&1

RADAR_SOURCE_ROOT="${RADAR_SOURCE_ROOT:-${0:A:h}/..}"
RADAR_AGENT_RUNTIME="${RADAR_AGENT_RUNTIME:-$HOME/Library/Application Support/Personal Radar/agent-runtime}"
RADAR_DEPS_HASH_FILE="${RADAR_AGENT_RUNTIME:h}/agent-package-lock.sha256"

git -C "$RADAR_SOURCE_ROOT" fetch origin main || exit 1
mkdir -p "${RADAR_AGENT_RUNTIME:h}"
if [ ! -e "$RADAR_AGENT_RUNTIME/.git" ]; then
  git -C "$RADAR_SOURCE_ROOT" worktree add --detach "$RADAR_AGENT_RUNTIME" origin/main || exit 1
else
  if [ -n "$(git -C "$RADAR_AGENT_RUNTIME" status --porcelain)" ]; then
    echo "Agent runtime worktree is dirty; refusing to overwrite it."
    exit 1
  fi
  git -C "$RADAR_AGENT_RUNTIME" checkout --detach origin/main || exit 1
fi

RADAR_LOCK_HASH="$(shasum -a 256 "$RADAR_AGENT_RUNTIME/package-lock.json" | awk '{print $1}')"
RADAR_INSTALLED_HASH=""
if [ -f "$RADAR_DEPS_HASH_FILE" ]; then
  RADAR_INSTALLED_HASH="$(<"$RADAR_DEPS_HASH_FILE")"
fi
if [ ! -d "$RADAR_AGENT_RUNTIME/node_modules" ] || [ "$RADAR_LOCK_HASH" != "$RADAR_INSTALLED_HASH" ]; then
  npm --prefix "$RADAR_AGENT_RUNTIME" ci --no-audit --no-fund || exit 1
  echo "$RADAR_LOCK_HASH" > "$RADAR_DEPS_HASH_FILE"
fi
if [ -f "$RADAR_SOURCE_ROOT/scripts/.env" ]; then
  ln -sf "$RADAR_SOURCE_ROOT/scripts/.env" "$RADAR_AGENT_RUNTIME/scripts/.env"
fi

cd "$RADAR_AGENT_RUNTIME" || exit 1
exec npx tsx scripts/agent.ts --once
