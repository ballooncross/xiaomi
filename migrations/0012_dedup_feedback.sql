-- User-flagged duplicate pairs for adaptive threshold learning
CREATE TABLE IF NOT EXISTS dedup_feedback (
  id TEXT PRIMARY KEY,
  trigger_item_id TEXT NOT NULL,
  matched_item_id TEXT NOT NULL,
  similarity REAL NOT NULL,
  threshold_used REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dedup_feedback_created ON dedup_feedback(created_at DESC);
