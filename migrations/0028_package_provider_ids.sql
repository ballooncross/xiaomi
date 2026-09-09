-- Provider ids are owned by code (src/lib/server/package-tracking/domain.ts).
-- Drop the hard-coded CHECK list on package_trackings.provider_id so new
-- provider adapters such as LSGJWL do not need a schema change each time.
-- SQLite cannot alter a CHECK constraint in place, so rebuild the table.

CREATE TABLE package_trackings_v2 (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tracking_number TEXT NOT NULL,
  label TEXT,
  provider_id TEXT,
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
  frequent_check_at TEXT,
  UNIQUE (user_id, tracking_number)
);

INSERT INTO package_trackings_v2 (
  id, user_id, tracking_number, label, provider_id, state, status, provider_status,
  latest_event_at, latest_location, estimated_delivery_at, source_url, last_checked_at,
  last_success_at, last_error, unresolved_since, delivered_at, archived_at, created_at,
  updated_at, frequent_check_at
)
SELECT
  id, user_id, tracking_number, label, provider_id, state, status, provider_status,
  latest_event_at, latest_location, estimated_delivery_at, source_url, last_checked_at,
  last_success_at, last_error, unresolved_since, delivered_at, archived_at, created_at,
  updated_at, frequent_check_at
FROM package_trackings;

DROP TABLE package_trackings;
ALTER TABLE package_trackings_v2 RENAME TO package_trackings;

CREATE INDEX IF NOT EXISTS idx_package_trackings_due
  ON package_trackings(state, last_checked_at, created_at);

CREATE INDEX IF NOT EXISTS idx_package_trackings_user
  ON package_trackings(user_id, state, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_package_trackings_frequent_due
  ON package_trackings(state, frequent_check_at, last_checked_at)
  WHERE frequent_check_at IS NOT NULL;
