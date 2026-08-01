import { json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { mergeLocalEnv } from '$lib/server/env';
import { getDb } from '$lib/server/db';
import type { DevRequestEvent, DevRequestPhase, DevRequestRun, DevRequestRunStatus, Env } from '$lib/server/types';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url, platform }) => {
	const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
	if (!isAuthorized(request, env)) return json({ error: 'Unauthorized' }, { status: 401 });

	const status = url.searchParams.get('status') ?? undefined;
	const db = getDb(env);
	await db.recoverStaleDevRequests(new Date().toISOString());
	const requests = await db.listDevRequests({ status, limit: 50 });
	const allRecentRequests = await db.listDevRequests({ limit: 50 });
	const byId = new Map(allRecentRequests.map((item) => [item.id, item]));
	const requestsWithContext = requests.map((item) => ({
		...item,
		parent: item.parentRequestId ? byId.get(item.parentRequestId) : undefined
	}));
	const contextIds = new Set(requests.map((item) => item.id));
	for (const item of requests) if (item.parentRequestId) contextIds.add(item.parentRequestId);
	const runs = await db.listDevRequestRuns([...contextIds]);
	return json({ requests: requestsWithContext, runs });
};

export const POST: RequestHandler = async ({ request, platform }) => {
	const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
	if (!isAuthorized(request, env)) return json({ error: 'Unauthorized' }, { status: 401 });
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const db = getDb(env);

	if (body.action === 'heartbeat') {
		const runnerId = cleanString(body.runnerId, 120);
		if (!runnerId) return json({ error: 'runnerId is required' }, { status: 400 });
		await db.upsertDevRequestRunner({
			id: runnerId,
			status: cleanString(body.status, 40) || 'idle',
			version: cleanString(body.version, 80),
			backend: cleanString(body.backend, 80),
			gitSha: cleanString(body.gitSha, 80),
			detail: cleanString(body.detail, 500),
			lastSeenAt: new Date().toISOString()
		});
		return json({ ok: true });
	}

	if (body.action === 'claim') {
		const requestId = cleanString(body.requestId, 80);
		const runId = cleanString(body.runId, 80);
		const runnerId = cleanString(body.runnerId, 120);
		if (!requestId || !runId || !runnerId) {
			return json({ error: 'requestId, runId, and runnerId are required' }, { status: 400 });
		}
		const run: DevRequestRun = {
			id: runId,
			requestId,
			attempt: 0,
			status: 'running',
			phase: 'planning',
			runnerId,
			runnerVersion: cleanString(body.runnerVersion, 80),
			backend: cleanString(body.backend, 80),
			baseSha: cleanString(body.baseSha, 80),
			resultSha: '',
			branch: '',
			summary: '',
			errorCategory: '',
			leaseExpiresAt: cleanString(body.leaseExpiresAt, 80) || new Date(Date.now() + 15 * 60_000).toISOString()
		};
		const claimed = await db.claimDevRequest(requestId, run);
		return claimed ? json({ ok: true, run }) : json({ error: 'Request is no longer pending' }, { status: 409 });
	}

	if (body.action === 'event') {
		const requestId = cleanString(body.requestId, 80);
		const runId = cleanString(body.runId, 80);
		const phase = cleanString(body.phase, 40) as DevRequestPhase;
		if (!requestId || !runId || !phase) return json({ error: 'requestId, runId, and phase are required' }, { status: 400 });
		const event: DevRequestEvent = {
			id: cleanString(body.id, 80) || crypto.randomUUID(),
			requestId,
			runId,
			sequence: Number(body.sequence) || 1,
			phase,
			level: body.level === 'warning' || body.level === 'error' ? body.level : 'info',
			eventType: cleanString(body.eventType, 80) || 'progress',
			message: redact(cleanString(body.message, 16000)),
			payload: sanitizePayload(body.payload)
		};
		await Promise.all([
			db.insertDevRequestEvent(event),
			db.finishDevRequestRun(runId, {
				phase,
				leaseExpiresAt: cleanString(body.leaseExpiresAt, 80) || new Date(Date.now() + 15 * 60_000).toISOString()
			})
		]);
		return json({ ok: true });
	}

	return json({ error: 'Unknown action' }, { status: 400 });
};

export const PATCH: RequestHandler = async ({ request, platform }) => {
	const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
	if (!isAuthorized(request, env)) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = (await request.json().catch(() => ({}))) as {
		id?: string;
		status?: string;
		response?: string;
		branch?: string;
		runId?: string;
		runStatus?: DevRequestRunStatus;
		phase?: DevRequestPhase;
		resultSha?: string;
		errorCategory?: string;
	};
	if (!body.id) return json({ error: 'id is required' }, { status: 400 });

	const db = getDb(env);
	await db.updateDevRequest(body.id, {
		status: body.status,
		response: body.response ? redact(body.response).slice(0, 16000) : body.response,
		branch: body.branch
	});
	if (body.runId) {
		await db.finishDevRequestRun(body.runId, {
			status: body.runStatus,
			phase: body.phase,
			resultSha: body.resultSha,
			branch: body.branch,
			summary: body.response ? redact(body.response).slice(0, 16000) : '',
			errorCategory: body.errorCategory
		});
	}
	return json({ ok: true });
};

function isAuthorized(request: Request, env?: Env): boolean {
	if (!env?.ADMIN_TOKEN) return false;
	return request.headers.get('x-admin-token') === env.ADMIN_TOKEN;
}

function cleanString(value: unknown, maxLength: number): string {
	return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

function sanitizePayload(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	const serialized = redact(JSON.stringify(value)).slice(0, 16000);
	try {
		return JSON.parse(serialized) as Record<string, unknown>;
	} catch {
		return { truncated: true };
	}
}

function redact(value: string): string {
	return value
		.replace(/(x-admin-token["'\s:=]+)[^\s,"']+/gi, '$1[REDACTED]')
		.replace(/((?:api|access|admin|radar)[_-]?token["'\s:=]+)[^\s,"']+/gi, '$1[REDACTED]')
		.replace(/(authorization["'\s:=]+bearer\s+)[^\s,"']+/gi, '$1[REDACTED]');
}
