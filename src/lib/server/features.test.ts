import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from './db';
import {
	FEATURE_REGISTRY,
	getFeatureAccess,
	isCronJobFeatureEnabled,
	isFeatureAllowed,
	listFeatureStates
} from './features';

describe('feature gates', () => {
	beforeEach(async () => {
		const db = getDb();
		for (const def of FEATURE_REGISTRY) {
			await db.upsertFeatureFlag(def.id, def.defaultEnabled, def.defaultMinRole);
		}
	});

	it('matches registry defaults', async () => {
		const states = await listFeatureStates(getDb());
		expect(states).toHaveLength(FEATURE_REGISTRY.length);
		const ica = states.find((s) => s.id === 'ica_check');
		expect(ica?.enabled).toBe(false);
		expect(ica?.minRole).toBe('admin');
	});

	it('hides admin-only features from members when enabled', async () => {
		const db = getDb();
		await db.upsertFeatureFlag('ica_check', true, 'admin');
		expect(await isFeatureAllowed(db, 'ica_check', false)).toBe(false);
		expect(await isFeatureAllowed(db, 'ica_check', true)).toBe(true);
	});

	it('disables cron when linked feature is off', async () => {
		const db = getDb();
		await db.upsertFeatureFlag('telegram_digest', false, 'member');
		expect(await isCronJobFeatureEnabled(db, 'daily-digest')).toBe(false);
		expect(await isCronJobFeatureEnabled(db, 'fetch-trends')).toBe(true);
	});

	it.each(['guest', 'member', 'admin'] as const)('enforces the %s minimum role for every audience', async (minRole) => {
		const db = getDb();
		await db.upsertFeatureFlag('gym_page', true, minRole);
		for (const user of [undefined, null, false, true]) {
			const expected = minRole === 'guest' || user === true || (minRole === 'member' && user === false);
			expect(await isFeatureAllowed(db, 'gym_page', user)).toBe(expected);
		}
		await db.upsertFeatureFlag('gym_page', false, minRole);
		for (const user of [undefined, null, false, true]) {
			expect(await isFeatureAllowed(db, 'gym_page', user)).toBe(false);
		}
	});

	it('exposes allowed map for page load', async () => {
		const access = await getFeatureAccess(getDb(), false);
		expect(access.gym_page.allowed).toBe(true);
		expect(access.admin_ops.allowed).toBe(false);
	});
});
