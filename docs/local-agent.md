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
```

## Running on a schedule

`--once` runs a single tick and exits. Two options keep the agent running.

### Option 1: foreground loop

```bash
npm run agent
```

Without `--once`, the process stays alive and ticks every 10 minutes
(`pollIntervalMs` in `scripts/lib/config.ts`). It stops when the terminal
closes or the Mac sleeps, and it does not reload code or `scripts/.env`
between ticks. Use it for a test session, not as the production runner.

Loop mode checks for other runners first. If the launchd scheduler is
installed, or another `agent.ts` or `run-agent.sh` process is running, it
prints what it found and exits with code 1 instead of starting a second
runner. Pass `--force` to start anyway:

```bash
npm run agent -- --force
```

`--once` runs are never blocked. They only log a warning when another agent
process is mid-cycle, because a short manual tick beside a scheduled cycle is
harmless apart from possible duplicate submissions.

### Option 2: launchd scheduler (recommended)

```bash
scripts/install-agent.sh
```

The installer writes the launch agent plist for the current machine, so the
home directory and repository path are resolved at install time. Run it from
the checkout the runtime worktree should track, or set `RADAR_SOURCE_ROOT`
to point at that checkout.

Dependency installs use the repository `.npmrc`, which pins the public npm
registry. A machine-level `~/.npmrc` pointing at a private registry would
otherwise break `npm ci` for the runtime and for development-request
worktrees.

The installed launch agent runs one `--once` cycle on a fixed interval from a
dedicated detached worktree tracking `origin/main`. Each cycle reloads the
current code and `scripts/.env`, so changing the configured AI backend does
not require a long-lived Node process restart. Dependencies are installed
inside the runtime and refreshed only when `package-lock.json` changes.
Single-run mode exits after the guarded scan even if a timed-out scan still
has unresolved promises, so launchd can start the next scheduled cycle.

The interval is `StartInterval` in `scripts/com.personalradar.agent.plist`,
in seconds. It is currently 1800 (30 minutes) while D1 read amplification is
being fixed; the long-term target is 600. To change it, edit the plist and run
`scripts/install-agent.sh` again. The installer unloads the old service and
bootstraps the new one. `RunAtLoad` is true, so a cycle starts right after
install and after each login. Cycles missed while the Mac sleeps are
coalesced into one run on wake.

Manage the service with `launchctl`:

```bash
launchctl print gui/$(id -u)/com.personalradar.agent          # state, last exit code
launchctl kickstart -k gui/$(id -u)/com.personalradar.agent   # run a cycle now
tail -f ~/Library/Logs/personal-radar-agent.log               # follow the log
launchctl bootout gui/$(id -u)/com.personalradar.agent        # stop and unload
```

`bootout` stops scheduling but leaves the plist and the runtime worktree in
place. Run `scripts/install-agent.sh` to start again. For a full uninstall,
also remove `~/Library/LaunchAgents/com.personalradar.agent.plist` and
`~/Library/Application Support/Personal Radar`, then run `git worktree prune`
in the source checkout.

Do not run a separate continuous `caffeinate` or `nohup` process alongside the
installed scheduler. Multiple legacy runners can race for requests. The
installer warns when it finds a foreground loop already running, but it does
not kill it; stop that process yourself.

### Checking what is running

```bash
npm run agent:status
```

The status script is read-only and prints three things:

1. **Scheduler:** whether `com.personalradar.agent` is loaded in launchd, its
   run count, last exit code, and the configured interval. `state = not
   running` with `last exit code = 0` is the healthy idle state between
   cycles.
2. **Processes:** any `agent.ts` or `run-agent.sh` process alive right now,
   with its elapsed time. A scheduled cycle lives for seconds to a few
   minutes, so an empty list is normal. A process without `--once` is a
   foreground loop and gets a warning.
3. **Log tail:** the last lines of `~/Library/Logs/personal-radar-agent.log`.
   Set `RADAR_STATUS_LOG_LINES=30` for more.

The same checks by hand:

```bash
launchctl print gui/$(id -u)/com.personalradar.agent | grep -E "state|last exit|runs"
pgrep -fl "agent.ts|run-agent.sh"
tail -n 20 ~/Library/Logs/personal-radar-agent.log
```

Each tick also reports `running`, `ok`, or `error` to the radar. Admins can see the latest tick time and detail under 我的 > 工具 > 定时任务状态 > 本地 AI Agent. If the process stops reporting, the last timestamp remains visible so a stale agent is easy to spot.

## How a tick works

On every tick the agent pulls `/api/agent/context` and decides a scan tier:

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
- `POST /api/agent/status`: record the local process tick as `running`, `ok`, or `error` for the admin status card

## Development requests

Development requests use durable attempts and append-only events in D1. The
coding model may edit and test an isolated worktree, but it must not commit,
push, merge, or deploy. The local wrapper owns publication and compares the
final tree to the captured base SHA, so a model-created commit is still
detected rather than mislabeled as no change. Each coding worktree receives an
independent dependency install so tests and build caches are writable.

A request is completed only after `npm test`, `npm run check`, and
`npm run build` pass, the result reaches `main`, the GitHub Deploy workflow
succeeds, and the public version endpoint shows the expected deployed version. Clarifying questions
are stored as `needs_input`, and retries preserve earlier attempts and events.

Claims created by an older runner without a durable run record are detected as
orphans and automatically requeued after twenty minutes.

The Radar admin UI uses the authenticated session for requests. It shows
runner health, phases, attempt summaries, commit SHAs, and event history. Use
补充信息 to create a linked follow-up whose prompt includes the parent request.

## Track vs save

保存 (save) is a bookmark: mild positive signal. 重点跟踪 (track) is a commitment to an ongoing story:

- tracked items appear in the compiled context's `tracking` list with a generated follow-up query ("Dreame Tech mulling IPO latest")
- the agent searches those queries on EVERY tick, including 10-minute targeted ones
- the AI prompt lists tracked stories as highest priority ("hunt for the latest developments")
- track counts double vs save when computing interest strength

## Natural language interests

The 添加关注 card has a free-text box ("我关注追觅 IPO、财务和公司架构新闻，但不关心具体产品发布"). The text is stored verbatim as a Layer 1 `interest` signal via `POST /api/interests` and the context recompiles immediately. The AI backend receives the raw text and respects exclusions when picking items; during full/deep scans it also extracts explicit exclusions into `derivedAvoid`, which come back as `not_interested` signals so the keyword scorer and blacklist learn them too.

## Interest processing lanes

Every user interest has one explicit `feed`: `trends` or `concerts`.

- `trends` entries become news, trend, and opportunity queries. Their `category` adds classification context such as business, career, life, or geopolitics.
- `concerts` entries are artist or show trackers consumed only by Ticketmaster and Bandsintown. They are excluded from AI news prompts, local-agent queries, trend scoring, trend feedback learning, story follow-ups, and interest optimization.
- A musician must be added separately to `trends` if the user intentionally wants news about that musician. A concert tracker alone never authorizes entertainment news or gossip.
- User-entered sources are not a separate interest kind. Actual source configuration belongs to the source registry and learned-source flow.

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
