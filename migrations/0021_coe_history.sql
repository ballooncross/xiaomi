CREATE TABLE IF NOT EXISTS coe_results (
  round_id TEXT NOT NULL,
  month TEXT NOT NULL,
  bidding_no INTEGER NOT NULL,
  round_label TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('A', 'B', 'C', 'D', 'E')),
  category_label TEXT NOT NULL,
  quota INTEGER NOT NULL,
  bids_success INTEGER NOT NULL,
  bids_received INTEGER NOT NULL,
  premium INTEGER NOT NULL,
  source_updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (round_id, category)
);

CREATE INDEX IF NOT EXISTS idx_coe_results_round
  ON coe_results(month DESC, bidding_no DESC, category ASC);
