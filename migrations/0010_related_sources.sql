-- Merged duplicate coverage: one item keeps links to the other outlets
ALTER TABLE items ADD COLUMN related_sources TEXT NOT NULL DEFAULT '[]';
