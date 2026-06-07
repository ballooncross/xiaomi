CREATE TABLE IF NOT EXISTS date_reminders (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  calendar_type TEXT NOT NULL CHECK (calendar_type IN ('gregorian', 'lunar')),
  year INTEGER,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 31),
  lunar_is_leap_month INTEGER NOT NULL DEFAULT 0,
  repeat TEXT NOT NULL DEFAULT 'annual' CHECK (repeat IN ('none', 'annual')),
  note TEXT NOT NULL DEFAULT '',
  pinned INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  remind_days_before TEXT NOT NULL DEFAULT '[0,1,7]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_date_reminders_enabled ON date_reminders(enabled, pinned DESC, title ASC);

INSERT OR IGNORE INTO date_reminders (
  id, title, calendar_type, month, day, lunar_is_leap_month, repeat, note, pinned, enabled, remind_days_before
) VALUES
  ('birthday-erjie', '二姐生日', 'lunar', 5, 1, 0, 'annual', '', 0, 1, '[0,1,7]'),
  ('birthday-dajie', '大姐生日', 'lunar', 5, 1, 0, 'annual', '', 0, 1, '[0,1,7]'),
  ('birthday-dad', '老爸生日', 'lunar', 5, 28, 0, 'annual', '', 0, 1, '[0,1,7]'),
  ('birthday-laoge', '老哥生日', 'lunar', 6, 8, 0, 'annual', '', 0, 1, '[0,1,7]'),
  ('birthday-junjun-1', '君君生日1', 'lunar', 11, 10, 0, 'annual', '', 0, 1, '[0,1,7]'),
  ('birthday-mom', '老妈生日', 'lunar', 11, 14, 0, 'annual', '', 0, 1, '[0,1,7]'),
  ('birthday-sanjie-me', '三姐和我生日', 'lunar', 11, 18, 0, 'annual', '', 0, 1, '[0,1,7]'),
  ('birthday-muchen', '沐辰生日', 'lunar', 11, 19, 0, 'annual', '', 0, 1, '[0,1,7]'),
  ('birthday-junjun-lunar', '君君农历生日', 'lunar', 12, 18, 0, 'annual', '', 1, 1, '[0,1,7]'),
  ('birthday-qianqian', '倩倩生日', 'lunar', 12, 29, 0, 'annual', '', 0, 1, '[0,1,7]'),
  ('birthday-yihang', '屹杭生日', 'lunar', 1, 28, 0, 'annual', '', 0, 1, '[0,1,7]'),
  ('birthday-chunnv', '春女生日', 'lunar', 2, 7, 0, 'annual', '', 0, 1, '[0,1,7]'),
  ('birthday-zoe', 'zoe生日', 'lunar', 3, 22, 0, 'annual', '', 0, 1, '[0,1,7]');

UPDATE items
SET status = 'dismissed', updated_at = CURRENT_TIMESTAMP
WHERE source_id = 'manual-trends';
