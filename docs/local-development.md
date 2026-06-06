# Local Development

## Install

```bash
npm install
cp .env.example .env.local
npm run dev
```

The normal Vite dev server runs without Cloudflare bindings. In that mode, the app uses in-memory demo data from `src/lib/server/seed.ts`.

## Local D1

Use Wrangler when you want real persisted local data. This app does not need a Docker database for development because production storage is Cloudflare D1, and Wrangler's local D1 keeps the local runtime closer to production than a separate Postgres/MySQL container would.

```bash
npm run db:migrate:local
npm run db:seed:local
```

The normal `npm run dev` loop intentionally uses in-memory demo data when no Cloudflare D1 binding exists. That is best for fast UI work, but watchlist edits disappear when the dev process restarts.

For Cloudflare-like runtime testing:

```bash
wrangler pages dev .svelte-kit/cloudflare --d1 DB=personal-radar
```

Run `npm run build` before `wrangler pages dev` if the output directory does not exist yet. Wrangler stores local D1 state under its local development files, so no separate database service needs to be started.

## Manual Job Trigger

The app exposes a private job endpoint:

```bash
curl -X POST http://localhost:5173/api/admin/jobs \
  -H 'content-type: application/json' \
  -H 'x-admin-token: change-me' \
  -d '{"job":"all-fetch"}'
```

Supported jobs:

- `concerts`
- `trends`
- `daily-digest`
- `all-fetch`

The concert job has two lanes:

- broad Ticketmaster Singapore music discovery, so popular concerts can appear without manual artist setup
- followed-artist searches on Ticketmaster and Bandsintown

Manual preferences are used as follows:

- `Follow` increases priority for matching concerts or topics
- `Blacklist` suppresses matching concerts, topics, or sources from broad discovery
- `Priority 1-5` controls how much a matching follow preference boosts ranking

If `ADMIN_TOKEN` is not configured in the local environment, the endpoint allows calls for development convenience.

## AI-Off Mode

The app works without any AI provider:

```env
AI_ENABLED=false
```

Rule-based scoring and template Telegram digests still work.

## Local API Keys

For normal local development:

```bash
cp .env.example .env.local
```

Put only local overrides in `.env.local`:

```env
TELEGRAM_BOT_TOKEN=123456:bot-token-from-botfather
TELEGRAM_CHAT_ID=123456789
TICKETMASTER_API_KEY=...
GEMINI_API_KEY=...
DEEPSEEK_API_KEY=...
```

The default base config lives in `src/lib/server/config.ts`. Empty env values do not override those defaults. Restart `npm run dev` after changing env files.

For Wrangler local development:

```bash
cp .env.example .dev.vars
```

`.env`, `.env.local`, and `.dev.vars` are gitignored.

## Telegram Local Test

After you set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`, run:

```bash
npm run telegram:test -- "hello from Personal Radar"
```

Check the Telegram chat where you sent `/start` to the bot. The bot token must be the full `number:letters` token from BotFather.
