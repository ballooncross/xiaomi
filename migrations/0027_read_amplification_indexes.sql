-- Indexes for the queries that dominate D1 rows read.
--
-- Each agent cycle ran several full table scans: items twice (recent summaries
-- and dedup), agent_feeds once per submitted item, job_runs once per status
-- report, and the agent outcome stats over the whole outcomes table. Rows read
-- therefore grew with the size of the database and saturated the daily limit.
--
-- Verified with EXPLAIN QUERY PLAN: each of these turns a SCAN into a SEARCH.

-- getRecentItemSummaries and listItemsForDedup filter and order by created_at.
CREATE INDEX IF NOT EXISTS idx_items_created_at ON items(created_at DESC);

-- findAgentFeedByUrl runs once per submitted item. Not UNIQUE: production may
-- already hold duplicate urls, and a failed index build would block deploys.
CREATE INDEX IF NOT EXISTS idx_agent_feeds_url ON agent_feeds(url);

-- getAgentOutcomeStats is now bounded to a trailing window.
CREATE INDEX IF NOT EXISTS idx_agent_outcomes_created ON agent_suggestion_outcomes(created_at);

-- listJobRuns orders by COALESCE(finished_at, started_at); indexing the plain
-- column would still leave a temp b-tree sort in the plan.
CREATE INDEX IF NOT EXISTS idx_job_runs_name_time
  ON job_runs(job_name, COALESCE(finished_at, started_at) DESC);
