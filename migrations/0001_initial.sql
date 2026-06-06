CREATE TABLE IF NOT EXISTS watch_topics (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('artist', 'topic', 'source')),
  name TEXT NOT NULL,
  aliases TEXT NOT NULL DEFAULT '[]',
  category TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 3,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('ticketmaster', 'bandsintown', 'rss', 'manual')),
  name TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  frequency_minutes INTEGER NOT NULL DEFAULT 360,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  external_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('concert', 'trend', 'news', 'opportunity')),
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
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'saved', 'tracking', 'dismissed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_type, external_id)
);

CREATE TABLE IF NOT EXISTS feedback_events (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('save', 'track', 'not_relevant', 'more_like_this', 'less_like_this')),
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS item_scores (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  scorer TEXT NOT NULL,
  relevance INTEGER NOT NULL,
  novelty INTEGER NOT NULL,
  actionability INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  item_id TEXT,
  channel TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS job_runs (
  id TEXT PRIMARY KEY,
  job_name TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT,
  detail TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS interest_profile_versions (
  id TEXT PRIMARY KEY,
  profile_text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_items_kind_created ON items(kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_score ON items(score DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_item ON feedback_events(item_id, created_at DESC);
