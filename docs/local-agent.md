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

## Track vs save

保存 (save) is a bookmark: mild positive signal. 重点跟踪 (track) is a commitment to an ongoing story:

- tracked items appear in the compiled context's `tracking` list with a generated follow-up query ("Dreame Tech mulling IPO latest")
- the agent searches those queries on EVERY tick, including 10-minute targeted ones
- the AI prompt lists tracked stories as highest priority ("hunt for the latest developments")
- track counts double vs save when computing interest strength

## Natural language interests

The 添加关注 card has a free-text box ("我关注追觅 IPO、财务和公司架构新闻，但不关心具体产品发布"). The text is stored verbatim as a Layer 1 `interest` signal via `POST /api/interests` and the context recompiles immediately. The AI backend receives the raw text and respects exclusions when picking items; during full/deep scans it also extracts explicit exclusions into `derivedAvoid`, which come back as `not_interested` signals so the keyword scorer and blacklist learn them too.

## Writing interests that actually surface trends

How you phrase an interest determines the search query the agent runs. `buildQueries` (in `scripts/lib/sources.ts`) turns each watch topic into search terms from its **name + aliases**, splitting Latin and CJK terms into separate `en` and `zh` queries.

A watch topic whose name is a long descriptive sentence becomes one literal query and returns little. Example of what *not* to do:

- Topic name: `新加坡展览礼品节宠物节等 比如九月份的another coffee festival`
- Generated query (zh): `新加坡展览礼品节宠物节等 比如九月份的another coffee festival` — a whole sentence, so Google News/GDELT find nothing useful.

Prefer several focused topics with short keyword aliases, including English ones:

| Topic name | Aliases |
|---|---|
| `Singapore Coffee Festival` | `新加坡咖啡节`, `coffee festival Singapore` |
| `Singapore Pet Expo` | `宠物节`, `Pet Expo Singapore` |
| `Singapore gift fair` | `礼品节`, `gift fair Singapore`, `exhibitions Singapore` |

Guidelines:

- Keep the topic name to a few keywords, not a sentence.
- Add both Chinese and English aliases so the agent runs a `zh` **and** an `en` query.
- Put nuance ("but not X") in the **free-text interest** box instead — that goes to the AI backend, which handles exclusions (see *Natural language interests*). Watch-topic names are used verbatim for keyword search and cannot express exclusions.

## Checking whether an interest is being searched

After adding an interest, verify each step of the pipeline:

**1. Is it stored?** Free-text interests land in `preference_signals`; the 添加关注 keyword form creates a `watch_topics` row.

```bash
# watch topic
npx wrangler d1 execute personal-radar --remote --command \
  "SELECT name, aliases, mode, enabled FROM watch_topics WHERE name LIKE '%coffee%';"
# free-text interest
npx wrangler d1 execute personal-radar --remote --command \
  "SELECT signal_value, source, created_at FROM preference_signals WHERE signal_type='interest' ORDER BY created_at DESC LIMIT 5;"
```

**2. Does the agent see it?** It must appear in the live context (`watchTopics`, or `structuredContext.interestProfile.naturalLanguageInputs` for free text):

```bash
curl -s -H "x-admin-token: $TOKEN" $RADAR_URL/api/agent/context | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print([t['name'] for t in d['watchTopics']])"
```

Free-text interests only take effect after a context recompile — `POST /api/interests` recompiles immediately, but if you inserted a signal directly, force it with `POST /api/agent/context/compile`.

**3. Was it actually searched?** Each scan writes a `free_text` log signal, and a new topic triggers a targeted scan immediately:

```bash
npx wrangler d1 execute personal-radar --remote --command \
  "SELECT signal_value, created_at FROM preference_signals WHERE signal_value LIKE '%coffee festival%' ORDER BY created_at DESC LIMIT 5;"
```

**4. Watch the query live.** A dry-run scan logs a `Searching "<query>"` line for every topic — the fastest way to see the exact query and confirm it is not a whole sentence:

```bash
npm run agent:dry
```

## Dedup

`src/lib/server/dedup.ts` clusters items by title similarity (outlet suffixes stripped, stopwords removed, CJK bigrams) and merges duplicate coverage into one item with `relatedSources` links. Used by the cron trend fetch and the agent feed endpoint. One-time cleanup of stored duplicates:

```bash
curl -X POST $RADAR_URL/api/admin/jobs -H "x-admin-token: $TOKEN" \
  -H "Content-Type: application/json" -d '{"job":"dedup-items"}'
```
