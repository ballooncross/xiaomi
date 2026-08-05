import { json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { getDb } from '$lib/server/db';
import { mergeLocalEnv } from '$lib/server/env';
import { isFeatureAllowed } from '$lib/server/features';
import { manuallyMarkPackageDelivered } from '$lib/server/package-tracking/service';
import { requireSessionUser } from '$lib/server/request-auth';
import type { Env } from '$lib/server/types';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, platform, locals }) => {
  const user = requireSessionUser(locals);
  const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
  if (!(await isFeatureAllowed(getDb(env), 'package_tracking', user.isAdmin))) {
    return json({ error: 'Package tracking is disabled' }, { status: 403 });
  }
  try {
    return json({ item: await manuallyMarkPackageDelivered(env, user.id, params.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to mark package delivered';
    return json({ error: message }, { status: message.includes('not found') ? 404 : 500 });
  }
};
