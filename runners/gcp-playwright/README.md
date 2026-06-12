# GCP Playwright Runner

This runner is the external browser fallback for the ICA checker. The Cloudflare cron Worker calls `POST /ica-check` only after Cloudflare Browser Run returns `blocked`, `error`, or is missing its Browser Run binding.

The runner does not send Telegram messages directly. It returns a structured check result to Cloudflare, and Cloudflare records the item in D1 and sends any Telegram alert once.

## Local Test

```bash
cd runners/gcp-playwright
npm install
npx playwright install --with-deps chromium
cp .env.example .env
npm run check:ica
```

## Server

```bash
npm start
curl -X POST http://localhost:8788/ica-check \
  -H "content-type: application/json" \
  -H "x-runner-token: $ICA_FALLBACK_TRIGGER_TOKEN" \
  -d '{"targetBefore":"2026-07-01"}'
```
