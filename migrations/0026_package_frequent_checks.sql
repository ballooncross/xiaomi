ALTER TABLE package_trackings ADD COLUMN frequent_check_at TEXT;

CREATE INDEX IF NOT EXISTS idx_package_trackings_frequent_due
  ON package_trackings(state, frequent_check_at, last_checked_at)
  WHERE frequent_check_at IS NOT NULL;
