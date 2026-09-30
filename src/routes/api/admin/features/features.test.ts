import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));

import { GET, PATCH } from './+server';
import type { FeatureState } from '$lib/server/features';

function event(minRole: string, isAdmin = true) {
	return {
		request: new Request('https://radar.example/api/admin/features', {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ id: 'gym_page', enabled: true, minRole })
		}),
		locals: { user: { id: 'user', email: 'admin@example.com', isAdmin } }
	} as Parameters<typeof PATCH>[0];
}

describe('feature settings API', () => {
	it('saves and reads the guest role', async () => {
		try {
			expect((await PATCH(event('guest'))).status).toBe(200);
			const response = await GET(event('guest'));
			const { features } = await response.json() as { features: FeatureState[] };
			expect(features).toContainEqual(expect.objectContaining({ id: 'gym_page', enabled: true, minRole: 'guest' }));
		} finally {
			await PATCH(event('member'));
		}
	});

	it('rejects unknown roles', async () => {
		expect((await PATCH(event('unknown'))).status).toBe(400);
	});

	it('keeps feature editing restricted to administrators', async () => {
		await expect(PATCH(event('guest', false))).rejects.toMatchObject({ status: 403 });
		const guestEvent = event('guest');
		guestEvent.locals = {};
		await expect(PATCH(guestEvent)).rejects.toMatchObject({ status: 401 });
	});
});
