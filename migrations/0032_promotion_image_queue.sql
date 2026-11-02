-- Banner images whose text the local agent has not read yet. Each promotion
-- check replaces the queue with the banners it could not read from cache.
CREATE TABLE promotion_image_queue (
  hash TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  queued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
