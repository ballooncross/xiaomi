import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { mergeLocalEnv } from '$lib/server/env';
import { requireSessionUser } from '$lib/server/request-auth';
import { env as privateEnv } from '$env/dynamic/private';
import type { Env } from '$lib/server/types';
import type { RequestHandler } from './$types';

const VALID = new Set(['concerts', 'trends', 'dates', 'gym', 'coe', 'interests', 'me', 'settings']);

export const GET: RequestHandler = async ({ platform, locals }) => {
	const user = requireSessionUser(locals);
	const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
	const nav = await getDb(env, user.id).getMiddleNav(user.id);
	return json({ nav });
};

export const PUT: RequestHandler = async ({ request, platform, locals }) => {
	const user = requireSessionUser(locals);
	const body = (await request.json().catch(() => ({}))) as { nav?: unknown };
	const nav = Array.isArray(body.nav)
		? body.nav.filter((id): id is string => typeof id === 'string' && VALID.has(id)).slice(0, 3)
		: [];

	const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
	await getDb(env, user.id).setMiddleNav(nav, user.id);
	return json({ ok: true, nav });
};
