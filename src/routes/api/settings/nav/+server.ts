import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { mergeLocalEnv } from '$lib/server/env';
import { requireSessionUser } from '$lib/server/request-auth';
import { env as privateEnv } from '$env/dynamic/private';
import { normalizeMiddleNav } from '$lib/navigation';
import type { Env } from '$lib/server/types';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform, locals }) => {
	const user = requireSessionUser(locals);
	const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
	const nav = await getDb(env, user.id).getMiddleNav(user.id);
	return json({ nav });
};

export const PUT: RequestHandler = async ({ request, platform, locals }) => {
	const user = requireSessionUser(locals);
	const body = (await request.json().catch(() => ({}))) as { nav?: unknown };
	const nav = normalizeMiddleNav(body.nav, { fallbackToDefault: false });

	const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
	await getDb(env, user.id).setMiddleNav(nav, user.id);
	return json({ ok: true, nav });
};
