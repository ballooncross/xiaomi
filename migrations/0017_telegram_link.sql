-- Per-user Telegram binding for digests (Phase 1.5).

ALTER TABLE users ADD COLUMN telegram_chat_id TEXT;
ALTER TABLE users ADD COLUMN telegram_linked_at TEXT;

CREATE INDEX IF NOT EXISTS idx_users_telegram
  ON users(telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS telegram_link_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_user
  ON telegram_link_tokens(user_id, expires_at);
