import { createHmac } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';
import { createSessionCookie, getSession } from './auth';

const secret = 'test-session-secret';
const user = { email: 'test@example.com', name: 'Test', picture: '' };

function cookiesWith(token?: string) {
	return { get: vi.fn(() => token), set: vi.fn(), delete: vi.fn() };
}

function signed(raw: string) {
	const payload = Buffer.from(raw).toString('base64url');
	const signature = createHmac('sha256', secret).update(raw).digest('base64url');
	return `${payload}.${signature}`;
}

describe('session cookie recovery', () => {
	it('leaves a missing cookie alone', async () => {
		const cookies = cookiesWith();
		expect(await getSession(cookies as unknown as Cookies, secret)).toBeNull();
		expect(cookies.delete).not.toHaveBeenCalled();
	});

	it.each([
		'legacy-cookie',
		'%.%',
		'e30.invalid!',
		signed('{'),
		signed('null'),
		signed('{}'),
		signed(JSON.stringify({ ...user, exp: 'never' })),
		signed(JSON.stringify({ ...user, email: null, exp: 9999999999 })),
		signed(JSON.stringify({ ...user, exp: 1 })),
		signed(JSON.stringify({ ...user, exp: 9999999999 })).replace(/.$/, '!')
	])('treats invalid cookie %s as signed out and clears it', async (token) => {
		const cookies = cookiesWith(token);
		expect(await getSession(cookies as unknown as Cookies, secret)).toBeNull();
		expect(cookies.delete).toHaveBeenCalledWith('__session', { path: '/' });
	});

	it('preserves a valid session created by the app', async () => {
		const cookies = cookiesWith();
		await createSessionCookie(cookies as unknown as Cookies, user, secret);
		cookies.get.mockReturnValue(cookies.set.mock.calls[0][1]);
		expect(await getSession(cookies as unknown as Cookies, secret)).toMatchObject(user);
		expect(cookies.delete).not.toHaveBeenCalled();
	});
});
