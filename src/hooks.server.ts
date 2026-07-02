import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { getSession, setEnvAllowedEmails } from '$lib/server/auth';
import { mergeLocalEnv } from '$lib/server/env';
import { env as privateEnv } from '$env/dynamic/private';
import type { Env } from '$lib/server/types';

const PUBLIC_PATHS = ['/login', '/auth/callback', '/auth/logout'];

export const handle: Handle = async ({ event, resolve }) => {
	const env = mergeLocalEnv(event.platform?.env as Env | undefined, privateEnv);
	const secret = env.SESSION_SECRET;

	if (!secret || !env.GOOGLE_CLIENT_ID) {
		return resolve(event);
	}

	setEnvAllowedEmails(env.ALLOWED_EMAILS);

	if (PUBLIC_PATHS.some((p) => event.url.pathname.startsWith(p))) {
		return resolve(event);
	}

	if (event.url.pathname.startsWith('/api/admin/') || event.url.pathname.startsWith('/api/agent/')) {
		return resolve(event);
	}

	const session = await getSession(event.cookies, secret);

	if (!session) {
		throw redirect(303, '/login');
	}

	event.locals.user = {
		email: session.email,
		name: session.name,
		picture: session.picture
	};

	return resolve(event);
};
