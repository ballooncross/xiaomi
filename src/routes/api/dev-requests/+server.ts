import { json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { mergeLocalEnv } from '$lib/server/env';
import { getDb } from '$lib/server/db';
import type { DevRequest, Env } from '$lib/server/types';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, platform }) => {
	const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
	const body = (await request.json().catch(() => ({}))) as { text?: string; token?: string };
	if (env?.ADMIN_TOKEN && body.token !== env.ADMIN_TOKEN) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const text = body.text?.trim();
	if (!text || text.length < 4) {
		return json({ error: 'text is required (min 4 chars)' }, { status: 400 });
	}
	if (text.length > 5000) {
		return json({ error: 'text too long (max 5000 chars)' }, { status: 400 });
	}

	const db = getDb(env);
	const request_: DevRequest = {
		id: crypto.randomUUID(),
		text,
		status: 'pending',
		response: ''
	};
	await db.insertDevRequest(request_);
	return json({ ok: true, request: request_ });
};

export const GET: RequestHandler = async ({ platform }) => {
	const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
	const db = getDb(env);
	const requests = await db.listDevRequests({ limit: 20 });
	return json({ requests });
};
