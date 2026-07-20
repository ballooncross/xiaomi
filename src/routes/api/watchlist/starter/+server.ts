import { json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { getDb } from '$lib/server/db';
import { mergeLocalEnv } from '$lib/server/env';
import { requireSessionUser } from '$lib/server/request-auth';
import { starterWatchTopics } from '$lib/server/seed';
import type { Env } from '$lib/server/types';
import type { RequestHandler } from './$types';

/** Upsert the shared starter interest pack for the signed-in user (does not remove existing topics). */
export const POST: RequestHandler = async ({ platform, locals }) => {
	const user = requireSessionUser(locals);
	const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
	const db = getDb(env, user.id);

	let added = 0;
	const before = new Set((await db.listTopics()).map((t) => t.id));
	for (const topic of starterWatchTopics) {
		await db.upsertTopic({ ...topic });
		if (!before.has(topic.id)) added += 1;
	}

	return json({
		ok: true,
		added,
		topics: await db.listTopics(),
		items: await db.listItems(24)
	});
};
