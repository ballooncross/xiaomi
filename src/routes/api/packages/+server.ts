import { json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { getDb } from '$lib/server/db';
import { mergeLocalEnv } from '$lib/server/env';
import { isFeatureAllowed } from '$lib/server/features';
import { requireSessionUser } from '$lib/server/request-auth';
import {
  addTrackedPackage,
  listTrackedPackages,
  removeTrackedPackage
} from '$lib/server/package-tracking/service';
import type { Env } from '$lib/server/types';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform, locals }) => {
  const user = requireSessionUser(locals);
  const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
  if (!(await packageFeatureAllowed(env, user.isAdmin))) {
    return json({ error: 'Package tracking is disabled' }, { status: 403 });
  }
  return json({ packages: await listTrackedPackages(env, user.id) });
};

export const POST: RequestHandler = async ({ request, platform, locals }) => {
  const user = requireSessionUser(locals);
  const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
  if (!(await packageFeatureAllowed(env, user.isAdmin))) {
    return json({ error: 'Package tracking is disabled' }, { status: 403 });
  }
  const body: { trackingNumber?: string; label?: string } =
    await request.json<{ trackingNumber?: string; label?: string }>().catch(() => ({}));
  if (!body.trackingNumber?.trim()) return json({ error: 'trackingNumber is required' }, { status: 400 });
  try {
    const result = await addTrackedPackage(env, user.id, body.trackingNumber, body.label);
    return json({ ...result, packages: await listTrackedPackages(env, user.id) }, { status: result.created ? 201 : 200 });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unable to add package' }, { status: 502 });
  }
};

export const DELETE: RequestHandler = async ({ request, platform, locals }) => {
  const user = requireSessionUser(locals);
  const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
  if (!(await packageFeatureAllowed(env, user.isAdmin))) {
    return json({ error: 'Package tracking is disabled' }, { status: 403 });
  }
  const body: { id?: string } = await request.json<{ id?: string }>().catch(() => ({}));
  if (!body.id) return json({ error: 'id is required' }, { status: 400 });
  const removed = await removeTrackedPackage(env, user.id, body.id);
  if (!removed) return json({ error: 'Package was not found' }, { status: 404 });
  return json({ ok: true, packages: await listTrackedPackages(env, user.id) });
};

async function packageFeatureAllowed(env: Env, isAdmin: boolean): Promise<boolean> {
  return isFeatureAllowed(getDb(env), 'package_tracking', isAdmin);
}
