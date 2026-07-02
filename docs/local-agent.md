# Local AI Agent

The local agent runs on your Mac, pulls context from the radar, discovers relevant content, and feeds it back through the agent APIs. Cloudflare stays key-free; the intelligence runs locally.

## Setup

```bash
cp scripts/.env.example scripts/.env
# set RADAR_TOKEN (the ADMIN_TOKEN of the deployed app)
# AI_BACKEND defaults to codex (uses your logged-in Codex CLI, no API key)
```

Run:

```bash
npm run agent -- --once      # single tick
npm run agent:dry            # search but do not submit
# continuous loop, keeps the Mac awake:
nohup caffeinate -i npx tsx scripts/agent.ts > /tmp/radar-agent.log 2>&1 &
```

Monitor: `tail -f /tmp/radar-agent.log` · status `pgrep -fl agent.ts` · stop `kill $(pgrep -f agent.ts)`.

## How a tick works

Every 10 minutes the agent pulls `/api/agent/context` and decides a scan tier:

| Condition | Tier | What runs |
|---|---|---|
| First run | full | all full-tier sources + AI search |
| 24h+ since last deep scan | deep | everything incl. Weibo/Bilibili + AI search |
| 4h+ since last full scan | full | main sources + AI search |
| Context version or 3+ new signals changed | targeted | only new/changed topics, fast sources |
| Nothing changed | skip | nothing |

State lives in `scripts/.agent-state.json` (gitignored); delete it to force a full scan.

## Sources are data, not code

`scripts/lib/sources.ts` holds source configs (RSS or JSON API shapes) executed by the generic engine in `scripts/lib/fetch-engine.ts`. The AI proposes new sources during its search; they are submitted as `source_suggestion` signals, surface back through the compiled context, and valid RSS ones are auto-adopted on later scans. Adding a source manually = adding a config row.

## AI backends (`AI_BACKEND` in scripts/.env)

| Value | Auth | Notes |
|---|---|---|
| `codex` (default) | logged-in Codex CLI | works with enterprise ChatGPT, no API key |
| `claude-code` | logged-in Claude Code CLI | no API key |
| `chatgpt` | `OPENAI_API_KEY` | platform.openai.com account required |
| `deepseek` | `DEEPSEEK_API_KEY` | cheap, good Chinese coverage |
| `claude` | `ANTHROPIC_API_KEY` | direct API |
| `ollama` | none | local model, free |
| `none` | - | disable AI search |

The AI is given interests, context, and constraints — not told where to look — and asked for trends from its own knowledge plus source suggestions. AI item confidence is capped at 0.55 and URLs are only kept when the model is confident they are real.

## Agent APIs (server side)

All under `/api/agent/`, authenticated with the `x-admin-token` header:

- `POST /api/agent/feed` — submit discovered items; batch-deduped against recent items (same story from another outlet becomes a related-source link, not a new item); qualifying items auto-promote into the radar with og:image hydration
- `GET /api/agent/context` — watch topics, feedback patterns, engagement signals, recent items (dedup context), compiled structured context
- `POST /api/agent/signal` — preference signals: `interest`, `note`, `not_interested` (auto-creates blacklist topic), `region_hint`, `source_suggestion`, `free_text`
- `POST /api/agent/context/compile` — force Layer 1 (raw signals) -> Layer 2 (structured context) recompile; also runs after every 5+ new signals and daily at 00:30 UTC
- `GET /api/agent/feed/outcomes` — how agent submissions performed (save/dismiss rates by topic and source)

## Dedup

`src/lib/server/dedup.ts` clusters items by title similarity (outlet suffixes stripped, stopwords removed, CJK bigrams) and merges duplicate coverage into one item with `relatedSources` links. Used by the cron trend fetch and the agent feed endpoint. One-time cleanup of stored duplicates:

```bash
curl -X POST $RADAR_URL/api/admin/jobs -H "x-admin-token: $TOKEN" \
  -H "Content-Type: application/json" -d '{"job":"dedup-items"}'
```
