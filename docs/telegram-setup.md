# Telegram Setup

Use two bots:

- development bot: local testing only
- production bot: deployed app and scheduled digest

This keeps local experiments from spamming your real production notification channel.

## Create A Bot

1. Open Telegram.
2. Search for `@BotFather`.
3. Send `/newbot`.
4. Pick a name and username.
5. Copy the bot token.

For local development, put the development bot values in `.env.local`:

```env
TELEGRAM_BOT_TOKEN=123456789:your_dev_bot_token_suffix
TELEGRAM_CHAT_ID=your_dev_chat_id
```

Use the full BotFather token, including the numeric prefix before `:`. The number before `:` is part of the bot token; it is not your chat ID.

For production, set the production bot token as Cloudflare secrets:

```bash
wrangler pages secret put TELEGRAM_BOT_TOKEN --project-name personal-radar
wrangler secret put TELEGRAM_BOT_TOKEN --config wrangler.cron.toml
```

## Get Your Chat ID

1. Open your bot in Telegram.
2. Send `/start` or any message to the bot.
3. Open this URL in a browser, replacing `<TOKEN>` with the full bot token:

```text
https://api.telegram.org/bot<TOKEN>/getUpdates
```

4. Find `message.chat.id`.

For local development:

```env
TELEGRAM_CHAT_ID=your_dev_chat_id
```

For production:

```bash
wrangler pages secret put TELEGRAM_CHAT_ID --project-name personal-radar
wrangler secret put TELEGRAM_CHAT_ID --config wrangler.cron.toml
```

## Test Daily Digest

For local testing:

```bash
npm run telegram:test -- "hello from Personal Radar"
```

Check the private Telegram chat with your bot. If you are testing a group chat, add the bot to the group and use that group chat ID.

After deployment:

```bash
curl -X POST https://your-app.pages.dev/api/admin/jobs \
  -H 'content-type: application/json' \
  -H 'x-admin-token: YOUR_ADMIN_TOKEN' \
  -d '{"job":"daily-digest"}'
```
