# Cloudflare Deployment

## 1. Create Cloudflare Resources

Log in:

```bash
wrangler login
```

Create the D1 database:

```bash
wrangler d1 create personal-radar
```

Copy the returned `database_id` into both:

- `wrangler.toml`
- `wrangler.cron.toml`

## 2. Apply Schema And Seed Data

```bash
npm run db:migrate:remote
npm run db:seed:remote
```

## 3. Configure Secrets

Run these commands in your local terminal inside this project directory. They are not Cloudflare Console commands. `wrangler` is Cloudflare's CLI and talks to your Cloudflare account after `wrangler login`.

Pages app:

```bash
wrangler pages secret put ADMIN_TOKEN --project-name personal-radar
wrangler pages secret put TELEGRAM_BOT_TOKEN --project-name personal-radar
wrangler pages secret put TELEGRAM_CHAT_ID --project-name personal-radar
wrangler pages secret put TICKETMASTER_API_KEY --project-name personal-radar
wrangler pages secret put GEMINI_API_KEY --project-name personal-radar
wrangler pages secret put DEEPSEEK_API_KEY --project-name personal-radar
```

Cron worker:

```bash
wrangler secret put ADMIN_TOKEN --config wrangler.cron.toml
wrangler secret put TELEGRAM_BOT_TOKEN --config wrangler.cron.toml
wrangler secret put TELEGRAM_CHAT_ID --config wrangler.cron.toml
wrangler secret put TICKETMASTER_API_KEY --config wrangler.cron.toml
wrangler secret put GEMINI_API_KEY --config wrangler.cron.toml
wrangler secret put DEEPSEEK_API_KEY --config wrangler.cron.toml
```

Only set AI keys if you want AI enabled. The app falls back to rules when keys are missing.

For Ticketmaster, register on the Ticketmaster Developer Portal. The default application has a `Consumer Key`; use that value as `TICKETMASTER_API_KEY`.

## 4. Deploy

```bash
npm run deploy
npm run deploy:cron
```

The Pages app serves the UI and API routes. The separate cron Worker runs scheduled fetch and digest jobs against the same D1 database.

## Cron Schedule

`wrangler.cron.toml` currently configures:

- every 6 hours: fetch concerts and trend placeholders
- `00:30 UTC`: send daily digest, which is `08:30 Asia/Singapore`

## Security

Set `ADMIN_TOKEN` before deploying. The current MVP uses a simple private admin token for job endpoints. The UI itself should eventually sit behind Cloudflare Access or another auth layer before sharing the URL.
