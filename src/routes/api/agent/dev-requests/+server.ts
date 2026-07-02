import { json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { mergeLocalEnv } from '$lib/server/env';
import { getDb } from '$lib/server/db';
import type { Env } from '$lib/server/types';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url, platform }) => {
	const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
	if (!isAuthorized(request, env)) return json({ error: 'Unauthorized' }, { status: 401 });

	const status = url.searchParams.get('status') ?? undefined;
	const db = getDb(env);
	const requests = await db.listDevRequests({ status, limit: 50 });
	return json({ requests });
};

export const PATCH: RequestHandler = async ({ request, platform }) => {
	const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
	if (!isAuthorized(request, env)) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = (await request.json().catch(() => ({}))) as {
		id?: string;
		status?: string;
		response?: string;
		branch?: string;
	};
	if (!body.id) return json({ error: 'id is required' }, { status: 400 });

	const db = getDb(env);
	await db.updateDevRequest(body.id, {
		status: body.status,
		response: body.response,
		branch: body.branch
	});
	return json({ ok: true });
};

function isAuthorized(request: Request, env?: Env): boolean {
	if (!env?.ADMIN_TOKEN) return true;
	return request.headers.get('x-admin-token') === env.ADMIN_TOKEN;
}
