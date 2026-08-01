CREATE TABLE IF NOT EXISTS package_trackings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tracking_number TEXT NOT NULL,
  label TEXT,
  provider_id TEXT CHECK (provider_id IS NULL OR provider_id IN ('yxd', 'dexi', 'mh56')),
  state TEXT NOT NULL DEFAULT 'awaiting_tracking_data'
    CHECK (state IN ('awaiting_tracking_data', 'active', 'needs_attention', 'archived')),
  status TEXT NOT NULL DEFAULT 'awaiting_tracking_data'
    CHECK (status IN (
      'awaiting_tracking_data',
      'info_received',
      'in_transit',
      'out_for_delivery',
      'delivery_attempted',
      'exception',
      'delivered',
      'returned',
      'unknown'
    )),
  provider_status TEXT,
  latest_event_at TEXT,
  latest_location TEXT,
  estimated_delivery_at TEXT,
  source_url TEXT,
  last_checked_at TEXT,
  last_success_at TEXT,
  last_error TEXT,
  unresolved_since TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delivered_at TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, tracking_number)
);

CREATE INDEX IF NOT EXISTS idx_package_trackings_due
  ON package_trackings(state, last_checked_at, created_at);

CREATE INDEX IF NOT EXISTS idx_package_trackings_user
  ON package_trackings(user_id, state, updated_at DESC);

CREATE TABLE IF NOT EXISTS package_tracking_events (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'awaiting_tracking_data',
    'info_received',
    'in_transit',
    'out_for_delivery',
    'delivery_attempted',
    'exception',
    'delivered',
    'returned',
    'unknown'
  )),
  provider_status TEXT NOT NULL,
  message TEXT NOT NULL,
  event_at TEXT NOT NULL,
  location TEXT,
  notified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (package_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_package_tracking_events_package
  ON package_tracking_events(package_id, event_at DESC);

CREATE INDEX IF NOT EXISTS idx_package_tracking_events_pending
  ON package_tracking_events(notified_at, created_at)
  WHERE notified_at IS NULL;

INSERT OR IGNORE INTO feature_flags (id, enabled, min_role)
VALUES ('package_tracking', 1, 'member');
