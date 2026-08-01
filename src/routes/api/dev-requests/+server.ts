import { json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { mergeLocalEnv } from '$lib/server/env';
import { getDb } from '$lib/server/db';
import type { DevRequest, Env } from '$lib/server/types';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, platform, locals }) => {
	const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
	const body = (await request.json().catch(() => ({}))) as {
		text?: string;
		token?: string;
		action?: string;
		id?: string;
		parentRequestId?: string;
	};
	if (!authorizeDevRequests(locals, request, env, body.token)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	const db = getDb(env);
	if (body.action === 'retry') {
		if (!body.id) return json({ error: 'id is required' }, { status: 400 });
		const retried = await db.retryDevRequest(body.id);
		return retried
			? json({ ok: true })
			: json({ error: 'Request is already queued or running' }, { status: 409 });
	}

	const text = body.text?.trim();
	if (!text || text.length < 4) {
		return json({ error: 'text is required (min 4 chars)' }, { status: 400 });
	}
	if (text.length > 5000) {
		return json({ error: 'text too long (max 5000 chars)' }, { status: 400 });
	}

	const request_: DevRequest = {
		id: crypto.randomUUID(),
		text,
		status: 'pending',
		response: '',
		parentRequestId: body.parentRequestId
	};
	await db.insertDevRequest(request_);
	return json({ ok: true, request: request_ });
};

export const GET: RequestHandler = async ({ platform, locals, request }) => {
	const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
	if (!authorizeDevRequests(locals, request, env)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const db = getDb(env);
	const requests = await db.listDevRequests({ limit: 20 });
	const [runs, runner] = await Promise.all([
		db.listDevRequestRuns(requests.map((item) => item.id)),
		db.getDevRequestRunner()
	]);
	const requestId = new URL(request.url).searchParams.get('id');
	const events = requestId ? await db.listDevRequestEvents(requestId) : [];
	return json({ requests, runs, events, runner });
};

function authorizeDevRequests(
	locals: App.Locals,
	request: Request,
	env: Env,
	bodyToken?: string
): boolean {
	if (locals.user?.isAdmin) return true;
	if (!env.ADMIN_TOKEN) return false;
	if (request.headers.get('x-admin-token') === env.ADMIN_TOKEN) return true;
	if (bodyToken === env.ADMIN_TOKEN) return true;
	return false;
}
