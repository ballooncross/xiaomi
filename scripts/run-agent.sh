#!/bin/zsh
# Wrapper so launchd (which runs with a minimal, non-interactive environment)
# can start the Personal Radar agent. nvm normally lives in ~/.zshrc, which
# non-interactive login shells skip, so node/npx/codex must be put on PATH here.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh" >/dev/null 2>&1

cd "${0:A:h}/.." || exit 1
exec npx tsx scripts/agent.ts
