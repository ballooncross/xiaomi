-- Expand the role constraint while preserving all existing overrides and audit data.
CREATE TABLE feature_flags_with_guest (
  id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  min_role TEXT NOT NULL DEFAULT 'member'
    CHECK (min_role IN ('guest', 'member', 'admin')),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT
);

INSERT INTO feature_flags_with_guest (id, enabled, min_role, updated_at, updated_by)
SELECT id, enabled, min_role, updated_at, updated_by FROM feature_flags;

DROP TABLE feature_flags;
ALTER TABLE feature_flags_with_guest RENAME TO feature_flags;
