import { redirect, error } from '@sveltejs/kit';
import { exchangeCodeForUser, createSessionCookie } from '$lib/server/auth';
import { getDb } from '$lib/server/db';
import { mergeLocalEnv } from '$lib/server/env';
import { ensureUser, isEmailAllowed } from '$lib/server/users';
import { env as privateEnv } from '$env/dynamic/private';
import type { Env } from '$lib/server/types';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies, platform }) => {
	const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);

	const code = url.searchParams.get('code');
	if (!code) throw error(400, 'Missing authorization code');

	const clientId = env.GOOGLE_CLIENT_ID;
	const clientSecret = env.GOOGLE_CLIENT_SECRET;
	const secret = env.SESSION_SECRET;

	if (!clientId || !clientSecret || !secret) {
		throw error(500, 'Auth not configured');
	}

	const origin = url.origin;
	const redirectUri = `${origin}/auth/callback`;

	const googleUser = await exchangeCodeForUser(code, clientId, clientSecret, redirectUri);
	if (!googleUser) throw error(400, 'Failed to authenticate with Google');

	const db = getDb(env);
	if (!(await isEmailAllowed(db, googleUser.email, env))) {
		throw redirect(303, '/login?error=denied');
	}

	await ensureUser(db, googleUser, env);
	await createSessionCookie(cookies, googleUser, secret);

	throw redirect(303, '/');
};
