-- Aggregate counters only: no identities, queries, IPs or nutrition inputs.
CREATE TABLE usage_daily (
  day TEXT NOT NULL,
  audience TEXT NOT NULL CHECK (audience IN ('guest', 'member')),
  view TEXT NOT NULL,
  metric TEXT NOT NULL CHECK (metric IN ('visit', 'calculation', 'search')),
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, audience, view, metric)
);
