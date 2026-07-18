import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { getSession } from '$lib/server/auth';
import { getDb } from '$lib/server/db';
import { mergeLocalEnv } from '$lib/server/env';
import { ensureUser, isEmailAllowed } from '$lib/server/users';
import { env as privateEnv } from '$env/dynamic/private';
import type { Env } from '$lib/server/types';

const PUBLIC_PATHS = ['/login', '/auth/callback', '/auth/logout'];

export const handle: Handle = async ({ event, resolve }) => {
	const env = mergeLocalEnv(event.platform?.env as Env | undefined, privateEnv);
	const secret = env.SESSION_SECRET;

	if (!secret || !env.GOOGLE_CLIENT_ID) {
		return resolve(event);
	}

	if (PUBLIC_PATHS.some((p) => event.url.pathname.startsWith(p))) {
		return resolve(event);
	}

	// Token-gated machine routes: session optional (handlers check admin token / admin session)
	if (
		event.url.pathname.startsWith('/api/admin/') ||
		event.url.pathname.startsWith('/api/agent/') ||
		event.url.pathname.startsWith('/api/dev-requests')
	) {
		const session = await getSession(event.cookies, secret);
		if (session) {
			const db = getDb(env);
			if (await isEmailAllowed(db, session.email, env)) {
				event.locals.user = await ensureUser(
					db,
					{ email: session.email, name: session.name, picture: session.picture },
					env
				);
			}
		}
		return resolve(event);
	}

	const session = await getSession(event.cookies, secret);
	if (!session) {
		throw redirect(303, '/login');
	}

	const db = getDb(env);
	if (!(await isEmailAllowed(db, session.email, env))) {
		throw redirect(303, '/login?error=denied');
	}

	event.locals.user = await ensureUser(
		db,
		{ email: session.email, name: session.name, picture: session.picture },
		env
	);

	return resolve(event);
};
