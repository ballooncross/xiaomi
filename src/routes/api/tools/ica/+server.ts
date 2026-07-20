import { json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { getDb } from '$lib/server/db';
import { mergeLocalEnv } from '$lib/server/env';
import { isFeatureAllowed } from '$lib/server/features';
import { getIcaToolStatus, triggerIcaChecker } from '$lib/server/ica-tool';
import { isAdminAuthorized } from '$lib/server/request-auth';
import type { Env } from '$lib/server/types';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform, locals }) => {
  const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
  const allowed = await isFeatureAllowed(getDb(env), 'ica_check', Boolean(locals.user?.isAdmin));
  if (!allowed) return json({ error: 'Feature disabled' }, { status: 403 });
  return json(await getIcaToolStatus(env));
};

export const POST: RequestHandler = async ({ request, platform, locals }) => {
  const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
  if (!isAdminAuthorized(locals, request, env.ADMIN_TOKEN)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const allowed = await isFeatureAllowed(getDb(env), 'ica_check', true);
  if (!allowed) return json({ error: 'Feature ica_check is disabled' }, { status: 403 });

  try {
    return json(await triggerIcaChecker(env));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'ICA checker failed' }, { status: 500 });
  }
};
