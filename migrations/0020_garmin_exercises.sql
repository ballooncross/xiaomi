-- Garmin exercise identifiers imported from Garmin Connect's public exercise
-- catalogs, equipment map, and English translation file.
CREATE TABLE IF NOT EXISTS garmin_exercises (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  exercise_key TEXT NOT NULL,
  name TEXT NOT NULL,
  body_part TEXT NOT NULL,
  primary_muscles TEXT NOT NULL,   -- JSON array of strings
  secondary_muscles TEXT NOT NULL, -- JSON array of strings
  equipment TEXT NOT NULL,         -- JSON array of strings
  catalogs TEXT NOT NULL,          -- JSON array of source catalog names
  description TEXT,
  image_url TEXT,
  source_updated_at TEXT NOT NULL,
  UNIQUE(category, exercise_key)
);

CREATE INDEX IF NOT EXISTS idx_garmin_exercises_body_part
  ON garmin_exercises(body_part);
CREATE INDEX IF NOT EXISTS idx_garmin_exercises_category
  ON garmin_exercises(category);
