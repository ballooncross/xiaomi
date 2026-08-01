/* User interests have two strict processing lanes. Musician watches are event
   trackers only, while trend interests feed news and opportunity discovery. */
ALTER TABLE watch_topics
  ADD COLUMN feed TEXT NOT NULL DEFAULT 'trends'
  CHECK (feed IN ('concerts', 'trends'));

UPDATE watch_topics
SET feed = 'concerts'
WHERE type = 'artist' OR category = 'concerts';

/* `source` was previously searched as a keyword rather than subscribed as a
   real source. Preserve that behavior honestly as a trend topic. Actual source
   configuration remains in the sources and learned-source subsystems. */
UPDATE watch_topics
SET type = 'topic'
WHERE type = 'source';

/* Category is a trend taxonomy, not a second routing field. */
UPDATE watch_topics
SET category = 'general', optimize_status = 'locked'
WHERE feed = 'concerts';

CREATE INDEX IF NOT EXISTS idx_watch_topics_user_feed
  ON watch_topics(user_id, feed, enabled, mode);
