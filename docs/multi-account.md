# Multi-account tech plan (Phase 1)

Product decisions are locked in conversation (hard isolate, shared catalog, starter interests, admin allowlist UI, `ADMIN_EMAILS` in env, Telegram later).

## Architecture

```
Google login → session email
  → allowed_emails table (admin-managed)
  → users row (created on first login)
  → all personal reads/writes scoped by users.id
```

| Layer | Shared | Per-user |
|-------|--------|----------|
| Catalog `items` | title, url, kind, base fields | — |
| Engagement | — | `user_item_state` (saved/tracking/viewed/dismissed) |
| Interests | — | `watch_topics.user_id` |
| Dates | — | `date_reminders.user_id` |
| Feedback / signals / impressions / AI context | — | `user_id` column |
| COE / gym exercises | shared | — |
| Ingestion jobs | union of all users’ follow topics for fetch | score/filter applied at read time per user |
| Digests / Telegram | one shared **bot** (API identity) | each user links their own chat; trend vs dates are separate messages + prefs |
| Shared alerts (COE) | shared check job | per-user subscribe in `user_settings.notify_prefs_json` |
| Ops alerts (ICA / extension) | — | linked **admin** Telegrams only (`ADMIN_EMAILS`) |
| Admin tools | global | gated by `ADMIN_EMAILS` |

### Authorization map (not a flexible ACL UI)

| Control | Where | Purpose |
|---------|--------|---------|
| Who can log in | DB `allowed_emails` (Me UI) + bootstrap `ALLOWED_EMAILS` env | Access gate |
| Who is admin | `ADMIN_EMAILS` env | Me admin tools, ICA/extension Telegram, allowlist API |
| Feature visibility | DB `feature_flags` (Me → 功能开关) | Enable/disable + min role (`member` \| `admin`); see `docs/feature-gates.md` |

The Telegram **bot** is not a broadcast channel. It is the app’s identity for calling Telegram’s API so the server can DM each linked chat.

## Schema (`migrations/0016_multi_account.sql`)

- `users` — id, email (unique), name, picture
- `allowed_emails` — email PK; seed `tofu.hike@gmail.com`
- `user_item_state` — (user_id, item_id) + status/timestamps
- `user_settings` — middle nav JSON
- Rebuild `watch_topics` / `date_reminders` with `PRIMARY KEY (user_id, id)`
- Add `user_id` to feedback, preference_signals, impressions, AI context tables
- Backfill: create admin user `tofu.hike@gmail.com`, attach existing personal rows, copy item engagement into `user_item_state`, reset catalog engagement columns

## Auth / roles

- `ALLOWED_EMAILS` env → bootstrap only if `allowed_emails` table empty (optional); primary source is DB
- `ADMIN_EMAILS` env → comma-separated admins (e.g. `tofu.hike@gmail.com`)
- `hooks.server.ts`: session → allowlist check → `ensureUser()` → `locals.user = { id, email, name, picture, isAdmin }`
- New accounts: insert starter interest pack (no dates)

## API

- Page load + `/api/watchlist|reminders|feedback|impressions|interests|digest` require session user and pass `userId` into DB
- `/api/admin/allowlist` — admin session only (list/add/remove)
- `/api/admin/*` jobs + `/api/dev-requests` — admin session **or** `x-admin-token` (token kept for cron/agent)
- Members calling admin routes → 403

## Scoring / feed

- Ingest: fetch using **union** of all enabled follow topics; do **not** write per-user dismiss onto `items`
- `listItems(userId)`: join `user_item_state`, re-`scoreItem` with that user’s topics, hide dismissed/blacklist for that user

## UI (`RadarApp.svelte` Me tab)

- Everyone: profile (email/name), logout, saved entry, dates via nav, interests/settings links
- Admin only: allowlist manager, cron status, manual fetch, ICA, dev requests
- Middle nav: read/write `user_settings` (fallback localStorage)

## Migration owner

Fixed email in SQL: `tofu.hike@gmail.com` (must be in `ADMIN_EMAILS`).

## Phase 1.5 (not this cut)

Per-user Telegram bind + digest fan-out.

## Rollout

1. Set secrets (include in `.env` then bulk):
   ```bash
   ADMIN_EMAILS=tofu.hike@gmail.com
   npx wrangler pages secret bulk .env --project-name personal-radar
   ```
2. Apply migration (CI deploy does this, or locally):
   ```bash
   npm run db:migrate:remote
   ```
3. Deploy app (`main` / GitHub Actions or `npm run deploy`)
4. Admin logs in → existing interests/dates/saved should still be there
5. Me → **允许登录的邮箱** → add friend Gmail
6. Friend logs in → starter interests, empty dates, no admin tools

## Phase 1.5 — Per-user Telegram (implemented)

- Migration `0017_telegram_link.sql`: `users.telegram_chat_id`, `telegram_link_tokens`
- Me → **连接 Telegram** → deep link `t.me/<bot>?start=<token>` → webhook `/api/telegram/webhook`
- Daily digest fans out to every linked user (their own feed + reminders)
- Manual “发送摘要” sends to the signed-in user’s chat
- Env: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`
- COE / ICA / extension alerts → `sendTelegramToAdmins` (admins in `ADMIN_EMAILS` who linked Telegram)
- `TELEGRAM_CHAT_ID` deprecated / unused

Set webhook once (production):

```bash
# Generate secret: openssl rand -hex 24
curl -sS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=https://personal-radar.pages.dev/api/telegram/webhook" \
  -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}"
```

## Phase 2 — Account polish (implemented)

- Home onboarding checklist when Telegram / interests / dates are incomplete
- Clearer empty states (home feed, saved, dates, interests)
- `POST /api/watchlist/starter` + Interests → **恢复基础兴趣** (upsert starter pack; keeps existing topics)
- Allowlist invite copy explains isolation + first-login starter pack
- Middle nav: server `user_settings` wins over `localStorage` on load/refresh

## Phase 3 — Beyond (not started)

- Email / web push if Telegram is not enough
- Shared household calendars or watchlists
- Open signup / promote admins in UI
