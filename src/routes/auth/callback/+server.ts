import { redirect, error } from '@sveltejs/kit';
import { exchangeCodeForUser, isAllowedEmail, createSessionCookie, setEnvAllowedEmails } from '$lib/server/auth';
import { mergeLocalEnv } from '$lib/server/env';
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

	setEnvAllowedEmails(env.ALLOWED_EMAILS);

	const origin = url.origin;
	const redirectUri = `${origin}/auth/callback`;

	const user = await exchangeCodeForUser(code, clientId, clientSecret, redirectUri);
	if (!user) throw error(400, 'Failed to authenticate with Google');

	if (!isAllowedEmail(user.email)) {
		throw redirect(303, '/login?error=denied');
	}

	await createSessionCookie(cookies, user, secret);

	throw redirect(303, '/');
};
