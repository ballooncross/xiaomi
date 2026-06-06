# Personal Radar

Personal Radar is a private monitoring app for Singapore concerts, events, career signals, market/geopolitical trends, and business chances.

The MVP is program-first and AI-assisted:

- deterministic source fetching, matching, scoring, dedupe, and Telegram notifications
- broad Singapore concert discovery, with manual follow and blacklist preferences
- optional AI summaries via Gemini first and DeepSeek fallback
- rule-based fallback when AI keys are missing, rate-limited, or disabled
- feedback buttons to learn what is useful over time

## Stack

- SvelteKit + TypeScript for UI and API routes
- Cloudflare Pages for the app
- Cloudflare D1 for storage
- Cloudflare Workers Cron Triggers for scheduled jobs
- Telegram Bot API for daily digest and urgent alerts

No Docker/container is needed.

Persistence is D1-first. `npm run dev` uses in-memory demo data for the fastest UI loop, and Wrangler local D1 gives you a real persisted SQLite-backed development database when you want to test jobs, feedback, edits, and watchlist changes across restarts.

## Quick Start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open the local URL printed by Vite. Without Cloudflare bindings, the app uses in-memory demo data so the UI works immediately.
Leave `.env.local` values blank until you want Telegram, source APIs, or optional AI locally.

## Key Commands

```bash
npm run dev                 # local web development
npm run check               # type and Svelte checks
npm test                    # unit tests
npm run build               # production build
npm run telegram:test        # send a local Telegram test message
npm run db:migrate:local    # apply D1 migrations locally
npm run db:seed:local       # seed local D1
npm run deploy              # deploy Pages app
npm run deploy:cron         # deploy scheduled worker
```

## Docs

- [Local development](docs/local-development.md)
- [Cloudflare deployment](docs/cloudflare-deployment.md)
- [Telegram setup](docs/telegram-setup.md)
- [AI configuration](docs/ai.md)
