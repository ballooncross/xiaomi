ALTER TABLE garmin_exercises ADD COLUMN matched_exercise_id TEXT;
ALTER TABLE garmin_exercises ADD COLUMN enrichment_sources TEXT NOT NULL DEFAULT '[]';
ALTER TABLE garmin_exercises ADD COLUMN match_confidence REAL;
ALTER TABLE garmin_exercises ADD COLUMN instructions_en TEXT;
ALTER TABLE garmin_exercises ADD COLUMN instructions_zh TEXT;
ALTER TABLE garmin_exercises ADD COLUMN gif_url TEXT;
ALTER TABLE garmin_exercises ADD COLUMN video_url TEXT;
ALTER TABLE garmin_exercises ADD COLUMN difficulty TEXT;
ALTER TABLE garmin_exercises ADD COLUMN enriched_at TEXT;

CREATE INDEX IF NOT EXISTS idx_garmin_exercises_matched_exercise
  ON garmin_exercises(matched_exercise_id);
