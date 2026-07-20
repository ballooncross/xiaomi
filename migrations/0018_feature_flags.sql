-- Configurable feature gates: enable/disable + min role (member | admin).

CREATE TABLE IF NOT EXISTS feature_flags (
  id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  min_role TEXT NOT NULL DEFAULT 'member'
    CHECK (min_role IN ('member', 'admin')),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT
);

-- Seed known features (UI + cron can be gated independently where useful).
INSERT OR IGNORE INTO feature_flags (id, enabled, min_role) VALUES
  ('ica_check', 0, 'admin'),
  ('coe_page', 1, 'member'),
  ('coe_notify', 1, 'admin'),
  ('gym_page', 1, 'member'),
  ('telegram_digest', 1, 'member'),
  ('admin_ops', 1, 'admin'),
  ('dev_requests', 1, 'admin');
