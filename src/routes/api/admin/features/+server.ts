import { json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { getDb } from '$lib/server/db';
import { mergeLocalEnv } from '$lib/server/env';
import {
	FEATURE_REGISTRY,
	listFeatureStates,
	type FeatureId,
	type FeatureRole
} from '$lib/server/features';
import { requireAdminUser } from '$lib/server/request-auth';
import type { Env } from '$lib/server/types';
import type { RequestHandler } from './$types';

const knownIds = new Set(FEATURE_REGISTRY.map((f) => f.id));

export const GET: RequestHandler = async ({ platform, locals }) => {
	requireAdminUser(locals);
	const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
	const features = await listFeatureStates(getDb(env));
	return json({ features });
};

export const PATCH: RequestHandler = async ({ request, platform, locals }) => {
	const admin = requireAdminUser(locals);
	const body = (await request.json().catch(() => ({}))) as {
		id?: string;
		enabled?: boolean;
		minRole?: FeatureRole;
	};

	const id = body.id?.trim() as FeatureId | undefined;
	if (!id || !knownIds.has(id)) {
		return json({ error: 'Unknown feature id' }, { status: 400 });
	}
	if (typeof body.enabled !== 'boolean') {
		return json({ error: 'enabled must be a boolean' }, { status: 400 });
	}
	if (body.minRole !== 'member' && body.minRole !== 'admin') {
		return json({ error: 'minRole must be member or admin' }, { status: 400 });
	}

	const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
	const db = getDb(env);
	await db.upsertFeatureFlag(id, body.enabled, body.minRole, admin.email);
	const features = await listFeatureStates(db);
	return json({ ok: true, features });
};
