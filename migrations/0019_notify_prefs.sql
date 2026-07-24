-- Per-user Telegram notification subscriptions (shared alerts + digest channels).

ALTER TABLE user_settings ADD COLUMN notify_prefs_json TEXT NOT NULL DEFAULT '{}';

-- COE alerts are opt-in per member; keep global cron gate, open role to members.
UPDATE feature_flags SET min_role = 'member', updated_at = CURRENT_TIMESTAMP
WHERE id = 'coe_notify';
