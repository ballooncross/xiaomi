UPDATE date_reminders
SET note = '', updated_at = CURRENT_TIMESTAMP
WHERE note LIKE '从截图导入%';
