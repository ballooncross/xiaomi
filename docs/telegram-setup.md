# Telegram Setup

## Why a bot exists

The bot is **not** a global announcement channel and **not** “admin’s Telegram.”

It is the app’s API identity: Personal Radar calls Telegram as that bot to send DMs into each user’s private chat with the bot.

| Message type | Who receives it |
|--------------|-----------------|
| Trend digest (concerts / trends) | Linked users with `digestTrends` on (default on); separate Telegram message |
| Dates reminder | Linked users with `digestDates` on (default on); separate Telegram message when there is something due |
| COE new-round alert | Linked users who subscribed (`coe` on; default off). If nobody subscribed yet, falls back to linked `ADMIN_EMAILS` |
| ICA / extension ops alerts | Only users in `ADMIN_EMAILS` who linked Telegram |

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

Admins use the same flow. After linking, open **我的 → 通知** to choose trend digest, dates reminder, and COE subscription. ICA/extension alerts still go to linked admins only.

## Authorization (related)

- Login allowlist: Me → 允许登录的邮箱 (DB)
- Admin role: `ADMIN_EMAILS` env
- Which screens/APIs are admin-only: hardcoded (`isAdmin`), not a per-feature env matrix
