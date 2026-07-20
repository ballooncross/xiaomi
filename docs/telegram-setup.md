# Telegram Setup

## Why a bot exists

The bot is **not** a global announcement channel and **not** “admin’s Telegram.”

It is the app’s API identity: Personal Radar calls Telegram as that bot to send DMs into each user’s private chat with the bot.

| Message type | Who receives it |
|--------------|-----------------|
| Daily digest / manual digest | Every user who linked Telegram (their own feed) |
| COE / ICA / extension ops alerts | Only users in `ADMIN_EMAILS` who linked Telegram |

No shared `TELEGRAM_CHAT_ID` is required.

## Create one bot (admin, once)

1. Open Telegram → `@BotFather` → `/newbot`
2. Copy token and username (e.g. `MyPersonalRadarBot`)

```env
TELEGRAM_BOT_TOKEN=123456789:AA...
TELEGRAM_BOT_USERNAME=xiaomiRadarBot
# username only — not t.me/xiaomiRadarBot, not @xiaomiRadarBot
TELEGRAM_WEBHOOK_SECRET=<openssl rand -hex 24>
ADMIN_EMAILS=tofu.hike@gmail.com
```

```bash
npm run secrets:sync:pages
npm run secrets:sync:cron
```

### Set webhook (once)

```bash
curl -sS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=https://personal-radar.pages.dev/api/telegram/webhook" \
  -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}"
```

## Each user links their own chat

1. Sign in → **我的 → 连接 Telegram**
2. Telegram opens → tap **Start**
3. That user’s digests go to that chat only

Admins use the same flow. After an admin links, COE/ICA alerts reach them.

## Authorization (related)

- Login allowlist: Me → 允许登录的邮箱 (DB)
- Admin role: `ADMIN_EMAILS` env
- Which screens/APIs are admin-only: hardcoded (`isAdmin`), not a per-feature env matrix
