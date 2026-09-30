import { describe, expect, it, vi } from 'vitest';
import { getDb } from '$lib/server/db';
import { load } from './+page.server';

vi.mock('$env/dynamic/private', () => ({ env: {} }));

describe('guest gym entry', () => {
	it.each([
		[true, 'guest', true],
		[false, 'guest', false],
		[true, 'member', false],
		[true, 'admin', false]
	] as const)('exposes gym with enabled=%s role=%s: %s', async (enabled, role, allowed) => {
		await getDb().upsertFeatureFlag('gym_page', enabled, role);
		const data = await load({} as Parameters<typeof load>[0]);
		expect(data).toEqual({ gymAllowed: allowed });
	});
});
