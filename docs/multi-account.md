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
| Digests / Telegram | stay single shared chat until Phase 1.5 | — |
| Admin tools | global | gated by `ADMIN_EMAILS` |

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

## Phase 1.5

Per-user Telegram bind + digest fan-out (not in this cut). Digests still use the first `ADMIN_EMAILS` account + shared `TELEGRAM_CHAT_ID`.
