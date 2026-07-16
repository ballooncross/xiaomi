-- Keep bookmark/tracking state independent from whether an item was read.
-- Rebuild items so fresh databases also receive the production-only insight/viewed checks.
CREATE TABLE items_saved_read (
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
  saved_at TEXT,
  tracking_at TEXT,
  viewed_at TEXT,
  related_item_id TEXT,
  related_sources TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_type, external_id)
);

WITH ranked_effective_feedback AS (
  SELECT
    item_id,
    action,
    created_at,
    ROW_NUMBER() OVER (PARTITION BY item_id ORDER BY created_at DESC, id DESC) AS rank
  FROM feedback_events
  WHERE action IN ('save', 'track', 'not_relevant', 'less_like_this')
),
latest_effective_feedback AS (
  SELECT item_id, action, created_at
  FROM ranked_effective_feedback
  WHERE rank = 1
),
latest_viewed AS (
  SELECT item_id, MAX(created_at) AS created_at
  FROM feedback_events
  WHERE action = 'viewed'
  GROUP BY item_id
)
INSERT INTO items_saved_read (
  id, source_id, source_type, external_id, kind, title, summary, description, url, image_url,
  location, starts_at, published_at, artists, topics, raw_json, score, status,
  saved_at, tracking_at, viewed_at, related_item_id, related_sources, created_at, updated_at
)
SELECT
  i.id,
  i.source_id,
  i.source_type,
  i.external_id,
  i.kind,
  i.title,
  i.summary,
  i.description,
  i.url,
  i.image_url,
  i.location,
  i.starts_at,
  i.published_at,
  i.artists,
  i.topics,
  i.raw_json,
  i.score,
  CASE
    WHEN latest.action = 'track' THEN 'tracking'
    WHEN latest.action = 'save' THEN 'saved'
    WHEN latest.action IN ('not_relevant', 'less_like_this') THEN 'dismissed'
    ELSE i.status
  END,
  CASE
    WHEN latest.action IN ('save', 'track') THEN latest.created_at
    WHEN latest.action IN ('not_relevant', 'less_like_this') THEN NULL
    WHEN i.status IN ('saved', 'tracking') THEN i.updated_at
    ELSE NULL
  END,
  CASE
    WHEN latest.action = 'track' THEN latest.created_at
    WHEN latest.action IN ('save', 'not_relevant', 'less_like_this') THEN NULL
    WHEN i.status = 'tracking' THEN i.updated_at
    ELSE NULL
  END,
  COALESCE(viewed.created_at, CASE WHEN i.status = 'viewed' THEN i.updated_at END),
  i.related_item_id,
  i.related_sources,
  i.created_at,
  i.updated_at
FROM items i
LEFT JOIN latest_effective_feedback latest ON latest.item_id = i.id
LEFT JOIN latest_viewed viewed ON viewed.item_id = i.id;

DROP TABLE items;
ALTER TABLE items_saved_read RENAME TO items;

CREATE INDEX idx_items_kind_created ON items(kind, created_at DESC);
CREATE INDEX idx_items_score ON items(score DESC);
CREATE INDEX idx_items_saved_at ON items(saved_at DESC) WHERE saved_at IS NOT NULL;
CREATE INDEX idx_items_tracking_at ON items(tracking_at DESC) WHERE tracking_at IS NOT NULL;

-- Expand feedback actions so unsave and duplicate are durable audit events.
CREATE TABLE feedback_events_saved_read (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (
    action IN ('save', 'track', 'unsave', 'not_relevant', 'more_like_this', 'less_like_this', 'viewed', 'duplicate')
  ),
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO feedback_events_saved_read (id, item_id, action, reason, created_at)
SELECT id, item_id, action, reason, created_at
FROM feedback_events;

DROP TABLE feedback_events;
ALTER TABLE feedback_events_saved_read RENAME TO feedback_events;
CREATE INDEX idx_feedback_item ON feedback_events(item_id, created_at DESC);
