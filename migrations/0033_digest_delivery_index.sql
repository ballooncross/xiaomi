CREATE INDEX IF NOT EXISTS idx_notifications_sent_item
ON notifications(type, item_id) WHERE status = 'sent';
