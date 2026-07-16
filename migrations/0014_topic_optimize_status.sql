-- Tracks whether the local agent may auto-refine an interest into cleaner
-- keyword + alias form. New interests default to 'pending' (open to optimize);
-- once the agent processes one it flips to 'optimized' so it is never churned
-- again. 'locked' means the user opted out of auto-refinement.
ALTER TABLE watch_topics ADD COLUMN optimize_status TEXT NOT NULL DEFAULT 'pending';

-- Existing rows predate the feature (and were already cleaned by hand); mark
-- them optimized so the agent does not rewrite them on first run.
UPDATE watch_topics SET optimize_status = 'optimized';
