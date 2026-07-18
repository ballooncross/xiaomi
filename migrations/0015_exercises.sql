-- Gym exercise reference data, imported from
-- github.com/hasaneyldrm/exercises-dataset (CC-licensed, see attribution).
-- Animation GIFs/thumbnails are hot-linked from jsDelivr rather than stored.
CREATE TABLE IF NOT EXISTS exercises (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  body_part TEXT NOT NULL,
  equipment TEXT NOT NULL,
  target TEXT NOT NULL,
  secondary_muscles TEXT,        -- JSON array of strings
  instructions_en TEXT,
  instructions_zh TEXT,
  gif_url TEXT NOT NULL,
  image_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_exercises_body_part ON exercises(body_part);
CREATE INDEX IF NOT EXISTS idx_exercises_equipment ON exercises(equipment);
CREATE INDEX IF NOT EXISTS idx_exercises_target ON exercises(target);
