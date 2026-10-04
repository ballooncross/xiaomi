-- Homepage watches are source subscriptions, separate from news/trend ingestion.
INSERT OR IGNORE INTO sources (id, type, name, config_json, frequency_minutes)
VALUES ('the-ride-side', 'manual', 'The Ride Side promotions', '{"url":"https://therideside.com/","adapter":"rideside-homepage"}', 1440);
CREATE TABLE source_promotion_watches (
  user_id TEXT NOT NULL,
  source_id TEXT NOT NULL REFERENCES sources(id),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  min_discount INTEGER NOT NULL DEFAULT 10 CHECK(min_discount BETWEEN 1 AND 99),
  PRIMARY KEY(user_id, source_id)
);
-- Existing personal owner requested this watch; other accounts opt in themselves.
INSERT INTO source_promotion_watches (user_id, source_id)
SELECT id, 'the-ride-side' FROM users WHERE email = 'tofu.hike@gmail.com' COLLATE NOCASE;
CREATE TABLE promotion_checks (
  source_id TEXT PRIMARY KEY REFERENCES sources(id),
  checked_at TEXT,
  success_at TEXT,
  error TEXT,
  lease_until TEXT
);
INSERT INTO promotion_checks(source_id) VALUES ('the-ride-side');
CREATE TABLE promotion_observations (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  fingerprint TEXT NOT NULL,
  evidence TEXT NOT NULL,
  discount REAL NOT NULL,
  scope TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_promotions_active ON promotion_observations(source_id, active, fingerprint);
CREATE TABLE promotion_deliveries (
  user_id TEXT NOT NULL,
  observation_id TEXT NOT NULL REFERENCES promotion_observations(id),
  sent_at TEXT NOT NULL,
  PRIMARY KEY(user_id, observation_id)
);
CREATE TABLE promotion_image_text (
  hash TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
