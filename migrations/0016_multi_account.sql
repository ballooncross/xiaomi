-- Multi-account: users, allowlist, per-user engagement and preferences.
-- Existing personal data is owned by tofu.hike@gmail.com.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL DEFAULT '',
  picture TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS allowed_emails (
  email TEXT NOT NULL PRIMARY KEY COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS user_item_state (
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'saved', 'tracking', 'dismissed', 'viewed')),
  saved_at TEXT,
  tracking_at TEXT,
  viewed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_user_item_state_saved
  ON user_item_state(user_id, saved_at DESC)
  WHERE saved_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_item_state_tracking
  ON user_item_state(user_id, tracking_at DESC)
  WHERE tracking_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY,
  middle_nav_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO users (id, email, name)
VALUES ('user-admin-tofu', 'tofu.hike@gmail.com', 'Admin');

INSERT OR IGNORE INTO allowed_emails (email, created_by)
VALUES ('tofu.hike@gmail.com', 'migration');

-- Rebuild watch_topics with composite PK (user_id, id)
CREATE TABLE watch_topics_v2 (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  aliases TEXT NOT NULL DEFAULT '[]',
  category TEXT NOT NULL DEFAULT 'general',
  priority INTEGER NOT NULL DEFAULT 3,
  enabled INTEGER NOT NULL DEFAULT 1,
  mode TEXT NOT NULL DEFAULT 'follow',
  optimize_status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, id)
);

INSERT INTO watch_topics_v2 (
  user_id, id, type, name, aliases, category, priority, enabled, mode, optimize_status, created_at, updated_at
)
SELECT
  'user-admin-tofu',
  id, type, name, aliases, category, priority, enabled,
  COALESCE(mode, 'follow'),
  COALESCE(optimize_status, 'pending'),
  created_at, updated_at
FROM watch_topics;

DROP TABLE watch_topics;
ALTER TABLE watch_topics_v2 RENAME TO watch_topics;

CREATE INDEX IF NOT EXISTS idx_watch_topics_user ON watch_topics(user_id, enabled, mode);

-- Rebuild date_reminders with composite PK
CREATE TABLE date_reminders_v2 (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  title TEXT NOT NULL,
  calendar_type TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'birthday',
  year INTEGER,
  month INTEGER NOT NULL,
  day INTEGER NOT NULL,
  lunar_is_leap_month INTEGER NOT NULL DEFAULT 0,
  repeat TEXT NOT NULL DEFAULT 'annual',
  note TEXT NOT NULL DEFAULT '',
  pinned INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  remind_days_before TEXT NOT NULL DEFAULT '[0,3,7]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, id)
);

INSERT INTO date_reminders_v2 (
  user_id, id, title, calendar_type, category, year, month, day, lunar_is_leap_month,
  repeat, note, pinned, enabled, remind_days_before, created_at, updated_at
)
SELECT
  'user-admin-tofu',
  id, title, calendar_type, COALESCE(category, 'birthday'), year, month, day, lunar_is_leap_month,
  repeat, note, pinned, enabled, remind_days_before, created_at, updated_at
FROM date_reminders;

DROP TABLE date_reminders;
ALTER TABLE date_reminders_v2 RENAME TO date_reminders;

CREATE INDEX IF NOT EXISTS idx_date_reminders_user ON date_reminders(user_id, enabled, pinned DESC, title ASC);

-- Copy catalog engagement onto admin user state, then clear catalog engagement
INSERT OR IGNORE INTO user_item_state (user_id, item_id, status, saved_at, tracking_at, viewed_at, updated_at)
SELECT
  'user-admin-tofu',
  id,
  status,
  saved_at,
  tracking_at,
  viewed_at,
  updated_at
FROM items
WHERE status IN ('saved', 'tracking', 'dismissed', 'viewed')
   OR saved_at IS NOT NULL
   OR tracking_at IS NOT NULL
   OR viewed_at IS NOT NULL;

UPDATE items
SET status = 'new',
    saved_at = NULL,
    tracking_at = NULL,
    viewed_at = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE status != 'new'
   OR saved_at IS NOT NULL
   OR tracking_at IS NOT NULL
   OR viewed_at IS NOT NULL;

-- Scope preference / learning tables (nullable during backfill, then filled)
ALTER TABLE feedback_events ADD COLUMN user_id TEXT;
ALTER TABLE preference_signals ADD COLUMN user_id TEXT;
ALTER TABLE item_impressions ADD COLUMN user_id TEXT;
ALTER TABLE ai_context_snapshots ADD COLUMN user_id TEXT;
ALTER TABLE interest_profile_versions ADD COLUMN user_id TEXT;

UPDATE feedback_events SET user_id = 'user-admin-tofu' WHERE user_id IS NULL;
UPDATE preference_signals SET user_id = 'user-admin-tofu' WHERE user_id IS NULL;
UPDATE item_impressions SET user_id = 'user-admin-tofu' WHERE user_id IS NULL;
UPDATE ai_context_snapshots SET user_id = 'user-admin-tofu' WHERE user_id IS NULL;
UPDATE interest_profile_versions SET user_id = 'user-admin-tofu' WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_feedback_events_user ON feedback_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_preference_signals_user ON preference_signals(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_item_impressions_user ON item_impressions(user_id, item_id);
