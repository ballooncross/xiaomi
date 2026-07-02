ALTER TABLE date_reminders ADD COLUMN category TEXT NOT NULL DEFAULT 'birthday'
  CHECK (category IN ('birthday', 'child_birthday', 'anniversary', 'memorial', 'other'));
