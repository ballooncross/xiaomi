import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';

it('preserves existing flags and audit data while adding guest to the SQL constraint', () => {
	const db = new DatabaseSync(':memory:');
	try {
		db.exec(readFileSync('migrations/0018_feature_flags.sql', 'utf8'));
		db.exec("UPDATE feature_flags SET updated_by = 'admin@example.com', updated_at = '2026-09-30 00:00:00' WHERE id = 'gym_page'");
		const before = db.prepare('SELECT * FROM feature_flags ORDER BY id').all();
		db.exec(readFileSync('migrations/0029_guest_feature_role.sql', 'utf8'));
		expect(db.prepare('SELECT * FROM feature_flags ORDER BY id').all()).toEqual(before);
		db.exec("UPDATE feature_flags SET min_role = 'guest' WHERE id = 'gym_page'");
		expect(db.prepare("SELECT min_role FROM feature_flags WHERE id = 'gym_page'").get()).toMatchObject({ min_role: 'guest' });
		expect(() => db.exec("UPDATE feature_flags SET min_role = 'unknown'")).toThrow();
	} finally {
		db.close();
	}
});
