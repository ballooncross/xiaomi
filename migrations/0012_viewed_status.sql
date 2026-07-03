-- SQLite cannot ALTER CHECK constraints, so we recreate the tables.

-- 1. Relax items.status to allow 'viewed'
CREATE TABLE items_new (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  external_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('concert', 'trend', 'news', 'opportunity', 'insight')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  url TEXT,
  image_url TEXT,
  location TEXT,
  starts_at TEXT,
  published_at TEXT,
  artists TEXT NOT NULL DEFAULT '[]',
  topics TEXT NOT NULL DEFAULT '[]',
  raw_json TEXT NOT NULL DEFAULT '{}',
  score INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'saved', 'tracking', 'dismissed', 'viewed')),
  related_item_id TEXT,
  related_sources TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_type, external_id)
);

INSERT INTO items_new SELECT
  id, source_id, source_type, external_id, kind, title, summary, description,
  url, image_url, location, starts_at, published_at, artists, topics, raw_json,
  score, status, related_item_id, COALESCE(related_sources, '[]'),
  created_at, updated_at
FROM items;

DROP TABLE items;
ALTER TABLE items_new RENAME TO items;

CREATE INDEX IF NOT EXISTS idx_items_kind_created ON items(kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_score ON items(score DESC);

-- 2. Relax feedback_events.action to allow 'viewed'
CREATE TABLE feedback_events_new (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('save', 'track', 'not_relevant', 'more_like_this', 'less_like_this', 'viewed')),
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO feedback_events_new SELECT id, item_id, action, reason, created_at FROM feedback_events;

DROP TABLE feedback_events;
ALTER TABLE feedback_events_new RENAME TO feedback_events;

CREATE INDEX IF NOT EXISTS idx_feedback_item ON feedback_events(item_id, created_at DESC);
