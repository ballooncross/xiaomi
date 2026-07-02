-- Agent feed items: submitted by local AI agent
CREATE TABLE IF NOT EXISTS agent_feeds (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  cadence TEXT NOT NULL DEFAULT 'daily'
    CHECK (cadence IN ('hourly', 'daily', 'weekly')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  url TEXT,
  kind TEXT NOT NULL DEFAULT 'trend'
    CHECK (kind IN ('concert', 'trend', 'news', 'opportunity', 'insight')),
  confidence REAL NOT NULL DEFAULT 0.5,
  relevance_reason TEXT NOT NULL DEFAULT '',
  topics TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'promoted', 'dismissed', 'expired')),
  promoted_item_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_feeds_status ON agent_feeds(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_feeds_source ON agent_feeds(source, cadence);

-- Raw preference signals (Layer 1)
CREATE TABLE IF NOT EXISTS preference_signals (
  id TEXT PRIMARY KEY,
  signal_type TEXT NOT NULL,
  signal_value TEXT NOT NULL DEFAULT '',
  related_item_id TEXT,
  related_topic_id TEXT,
  source TEXT NOT NULL DEFAULT 'ui',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_preference_signals_type ON preference_signals(signal_type, created_at DESC);

-- Compiled AI context snapshots (Layer 2)
CREATE TABLE IF NOT EXISTS ai_context_snapshots (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  context_json TEXT NOT NULL,
  compiled_from TEXT NOT NULL DEFAULT '',
  signal_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_context_version ON ai_context_snapshots(version DESC);

-- Track engagement on agent-submitted items
CREATE TABLE IF NOT EXISTS agent_suggestion_outcomes (
  id TEXT PRIMARY KEY,
  agent_feed_id TEXT NOT NULL,
  outcome TEXT NOT NULL
    CHECK (outcome IN ('saved', 'tracked', 'dismissed', 'clicked', 'ignored')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_outcomes_feed ON agent_suggestion_outcomes(agent_feed_id);

-- Track item impressions (shown to user)
CREATE TABLE IF NOT EXISTS item_impressions (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  impression_type TEXT NOT NULL DEFAULT 'feed'
    CHECK (impression_type IN ('feed', 'digest', 'detail_view')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_impressions_item ON item_impressions(item_id, created_at DESC);

-- Add related_item_id to items for update linking
ALTER TABLE items ADD COLUMN related_item_id TEXT;
