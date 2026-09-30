import type { RequestEvent } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '$lib/server/db';

vi.mock('$env/dynamic/private', () => ({
	env: { SESSION_SECRET: 'test-secret', GOOGLE_CLIENT_ID: 'test-client' }
}));

import { handle } from './hooks.server';

describe('guest access boundaries', () => {
	beforeEach(async () => {
		await getDb().upsertFeatureFlag('gym_page', true, 'member');
	});

	it.each(['GET', 'HEAD'])('serves the exercise catalog for guests only when configured (%s)', async (method) => {
		await getDb().upsertFeatureFlag('gym_page', true, 'guest');
		const url = new URL('https://radar.example/api/exercises?q=squat');
		const event = {
			url, request: new Request(url, { method }),
			cookies: { get: vi.fn() }, locals: {}
		} as unknown as RequestEvent;
		const response = new Response('{"exercises":[]}');
		const resolve = vi.fn().mockResolvedValue(response);
		expect(await handle({ event, resolve })).toBe(response);
		expect(event.cookies.get).not.toHaveBeenCalled();
	});

	it.each([
		['/api/exercises', 'GET', false, 'guest'],
		['/api/exercises', 'GET', true, 'admin'],
		['/api/exercises', 'POST', true, 'guest'],
		['/api/exercises/private', 'GET', true, 'guest'],
		['/api/packages', 'GET', true, 'guest'],
		['/gym', 'GET', true, 'guest']
	] as const)('keeps %s %s protected with enabled=%s role=%s', async (path, method, enabled, role) => {
		await getDb().upsertFeatureFlag('gym_page', enabled, role);
		const url = new URL(path, 'https://radar.example');
		const event = {
			url, request: new Request(url, { method }),
			cookies: { get: vi.fn(), delete: vi.fn() }, locals: {}
		} as unknown as RequestEvent;
		const resolve = vi.fn();
		await expect(handle({ event, resolve })).rejects.toMatchObject({ status: 303, location: '/login' });
		expect(resolve).not.toHaveBeenCalled();
	});
	it.each(['GET', 'HEAD'])('serves guest tools for %s without reading a session', async (method) => {
		const event = {
			url: new URL('https://radar.example/guest'),
			request: new Request('https://radar.example/guest', { method }),
			cookies: { get: vi.fn(() => '%.%') }, locals: {}
		} as unknown as RequestEvent;
		const response = new Response('Guest tools');
		const resolve = vi.fn().mockResolvedValue(response);
		expect(await handle({ event, resolve })).toBe(response);
		expect(event.cookies.get).not.toHaveBeenCalled();
		expect(event.locals.user).toBeUndefined();
	});

	it.each([
		['/guest', 'POST'], ['/guest/private', 'GET'], ['/guest-other', 'GET'],
		['/gym', 'GET'], ['/', 'GET'], ['/settings', 'GET'],
		['/api/exercises', 'GET'], ['/api/packages', 'GET'],
		['/api/settings/nav', 'POST'], ['/api/interests', 'GET']
	])('keeps %s (%s) behind login', async (path, method) => {
		const url = new URL(path, 'https://radar.example');
		const event = {
			url, request: new Request(url, { method }),
			cookies: { get: vi.fn(), delete: vi.fn() }, locals: {}
		} as unknown as RequestEvent;
		const resolve = vi.fn();
		await expect(handle({ event, resolve })).rejects.toMatchObject({ status: 303, location: '/login' });
		expect(resolve).not.toHaveBeenCalled();
	});
});

describe('sign-in recovery', () => {
	it('redirects a returning browser with a corrupted cookie to login', async () => {
		const cookies = { get: vi.fn(() => '%.%'), delete: vi.fn() };
		const event = {
			url: new URL('https://radar.example/'), cookies, locals: {}
		} as unknown as RequestEvent;
		const resolve = vi.fn();
		await expect(handle({ event, resolve })).rejects.toMatchObject({
			status: 303, location: '/login'
		});
		expect(cookies.delete).toHaveBeenCalledWith('__session', { path: '/' });
		expect(resolve).not.toHaveBeenCalled();
	});

	it('renders login regardless of an existing malformed session cookie', async () => {
		const event = {
			url: new URL('https://radar.example/login'),
			cookies: { get: vi.fn(() => '%.%') }, locals: {}
		} as unknown as RequestEvent;
		const response = new Response('Sign in with Google');
		const resolve = vi.fn().mockResolvedValue(response);
		expect(await handle({ event, resolve })).toBe(response);
	});
});
