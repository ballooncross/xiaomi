# Telegram Setup

Use two bots:

- development bot: local testing only
- production bot: deployed app and scheduled digest

This keeps local experiments from spamming your real production notification channel.

## Create A Bot

1. Open Telegram.
2. Search for `@BotFather`.
3. Send `/newbot`.
4. Pick a name and username (e.g. `MyPersonalRadarBot`).
5. Copy the bot token.

## Per-user digests (recommended)

Each account connects their own Telegram chat from **我的 → 连接 Telegram**. Daily digests fan out to every linked user with that user’s feed and dates.

### Env / secrets

```env
TELEGRAM_BOT_TOKEN=123456789:your_bot_token
TELEGRAM_BOT_USERNAME=MyPersonalRadarBot
TELEGRAM_WEBHOOK_SECRET=<openssl rand -hex 24>
# Optional: ops fallback for COE/ICA alerts, and digests before anyone links
TELEGRAM_CHAT_ID=
```

Sync secrets (filtered):

```bash
npm run secrets:sync:pages
npm run secrets:sync:cron
```

### Set webhook (production, once)

```bash
curl -sS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=https://personal-radar.pages.dev/api/telegram/webhook" \
  -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}"
```

Verify: `curl -sS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"`

### Link a user

1. Sign in to Personal Radar.
2. Open **我的 → 连接 Telegram** (opens `t.me/<bot>?start=<token>`).
3. Tap **Start** in Telegram.
4. Refresh the Me page — status should show connected.
5. Use **发送摘要到 Telegram** to test.

## Optional shared chat ID (ops / fallback)

Still useful for COE/ICA alerts and as a digest fallback when **no** user has linked yet.

1. Message the bot, then open  
   `https://api.telegram.org/bot<TOKEN>/getUpdates`
2. Copy `message.chat.id` into `TELEGRAM_CHAT_ID`.

## Test

Local:

```bash
npm run telegram:test -- "hello from Personal Radar"
```

Cron / admin fan-out (all linked users):

```bash
curl -X POST https://personal-radar.pages.dev/api/admin/jobs \
  -H 'content-type: application/json' \
  -H 'x-admin-token: YOUR_ADMIN_TOKEN' \
  -d '{"job":"daily-digest"}'
```
