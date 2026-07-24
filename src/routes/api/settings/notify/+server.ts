import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { mergeLocalEnv } from '$lib/server/env';
import { DEFAULT_NOTIFY_PREFS, mergeNotifyPrefs, parseNotifyPrefs, type NotifyPrefs } from '$lib/notify-prefs';
import { requireSessionUser } from '$lib/server/request-auth';
import { env as privateEnv } from '$env/dynamic/private';
import type { Env } from '$lib/server/types';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform, locals }) => {
	const user = requireSessionUser(locals);
	const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
	const prefs = await getDb(env, user.id).getNotifyPrefs(user.id);
	return json({ prefs });
};

export const PUT: RequestHandler = async ({ request, platform, locals }) => {
	const user = requireSessionUser(locals);
	const body = (await request.json().catch(() => ({}))) as { prefs?: unknown };
	const patch = normalizePatch(body.prefs);
	const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
	const db = getDb(env, user.id);
	const current = await db.getNotifyPrefs(user.id);
	const prefs = mergeNotifyPrefs(current, patch);
	await db.setNotifyPrefs(prefs, user.id);
	return json({ ok: true, prefs });
};

function normalizePatch(raw: unknown): Partial<NotifyPrefs> {
	if (!raw || typeof raw !== 'object') return {};
	const parsed = parseNotifyPrefs({ ...DEFAULT_NOTIFY_PREFS, ...(raw as object) });
	const obj = raw as Record<string, unknown>;
	const patch: Partial<NotifyPrefs> = {};
	if (typeof obj.digestTrends === 'boolean') patch.digestTrends = parsed.digestTrends;
	if (typeof obj.digestDates === 'boolean') patch.digestDates = parsed.digestDates;
	if (typeof obj.coe === 'boolean') patch.coe = parsed.coe;
	return patch;
}
