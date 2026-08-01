ALTER TABLE dev_requests ADD COLUMN parent_request_id TEXT;

CREATE TABLE IF NOT EXISTS dev_request_runs (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'needs_input', 'failed', 'cancelled')),
  phase TEXT NOT NULL DEFAULT 'planning',
  runner_id TEXT NOT NULL,
  runner_version TEXT NOT NULL DEFAULT '',
  backend TEXT NOT NULL DEFAULT '',
  base_sha TEXT NOT NULL DEFAULT '',
  result_sha TEXT NOT NULL DEFAULT '',
  branch TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  error_category TEXT NOT NULL DEFAULT '',
  lease_expires_at TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (request_id, attempt),
  FOREIGN KEY (request_id) REFERENCES dev_requests(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_dev_request_runs_request
  ON dev_request_runs(request_id, attempt DESC);
CREATE INDEX IF NOT EXISTS idx_dev_request_runs_lease
  ON dev_request_runs(status, lease_expires_at);

CREATE TABLE IF NOT EXISTS dev_request_events (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  phase TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info'
    CHECK (level IN ('info', 'warning', 'error')),
  event_type TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (run_id, sequence),
  FOREIGN KEY (request_id) REFERENCES dev_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES dev_request_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_dev_request_events_request
  ON dev_request_events(request_id, created_at DESC);

CREATE TABLE IF NOT EXISTS dev_request_runners (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'idle',
  version TEXT NOT NULL DEFAULT '',
  backend TEXT NOT NULL DEFAULT '',
  git_sha TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
