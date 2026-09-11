#!/bin/zsh
# Wrapper for a single scheduled agent run. It executes from a dedicated
# detached worktree so the user's active repository branch is never involved.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh" >/dev/null 2>&1

# Bound how long git waits on the network. A stalled connection otherwise
# blocks for the operating system's full TCP timeout, which is longer than the
# gap between scheduled cycles and so delays the following cycle too.
export GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -o BatchMode=yes -o ConnectTimeout=10}"

RADAR_SOURCE_ROOT="${RADAR_SOURCE_ROOT:-${0:A:h}/..}"
RADAR_AGENT_RUNTIME="${RADAR_AGENT_RUNTIME:-$HOME/Library/Application Support/Personal Radar/agent-runtime}"
RADAR_DEPS_HASH_FILE="${RADAR_AGENT_RUNTIME:h}/agent-package-lock.sha256"

radar_log() { print -r -- "[$(date -u '+%H:%M:%S')] run-agent: $*" }

# A failed fetch must not cost the whole cycle. The runtime worktree already
# holds a working checkout, and one cycle on slightly older code beats no cycle
# at all, so report the failure and carry on with the last revision fetched.
if ! git -C "$RADAR_SOURCE_ROOT" fetch origin master; then
  radar_log "git fetch failed; continuing with the revision already fetched"
fi

mkdir -p "${RADAR_AGENT_RUNTIME:h}"
if [ ! -e "$RADAR_AGENT_RUNTIME/.git" ]; then
  # Nothing to fall back on before the worktree exists, so this stays fatal.
  if ! git -C "$RADAR_SOURCE_ROOT" worktree add --detach "$RADAR_AGENT_RUNTIME" origin/master; then
    radar_log "could not create the runtime worktree"
    exit 1
  fi
else
  if [ -n "$(git -C "$RADAR_AGENT_RUNTIME" status --porcelain)" ]; then
    radar_log "runtime worktree is dirty; refusing to overwrite it"
    exit 1
  fi
  # A no-op when the fetch failed, because origin/master still points at the
  # last revision that was fetched successfully.
  if ! git -C "$RADAR_AGENT_RUNTIME" checkout --detach origin/master; then
    radar_log "could not check out origin/master in the runtime worktree"
    exit 1
  fi
fi

RADAR_LOCK_HASH="$(shasum -a 256 "$RADAR_AGENT_RUNTIME/package-lock.json" | awk '{print $1}')"
RADAR_INSTALLED_HASH=""
if [ -f "$RADAR_DEPS_HASH_FILE" ]; then
  RADAR_INSTALLED_HASH="$(<"$RADAR_DEPS_HASH_FILE")"
fi
if [ ! -d "$RADAR_AGENT_RUNTIME/node_modules" ] || [ "$RADAR_LOCK_HASH" != "$RADAR_INSTALLED_HASH" ]; then
  if ! npm --prefix "$RADAR_AGENT_RUNTIME" ci --no-audit --no-fund; then
    radar_log "dependency install failed"
    exit 1
  fi
  echo "$RADAR_LOCK_HASH" > "$RADAR_DEPS_HASH_FILE"
fi
if [ -f "$RADAR_SOURCE_ROOT/scripts/.env" ]; then
  ln -sf "$RADAR_SOURCE_ROOT/scripts/.env" "$RADAR_AGENT_RUNTIME/scripts/.env"
fi

cd "$RADAR_AGENT_RUNTIME" || exit 1
exec npx tsx scripts/agent.ts --once
