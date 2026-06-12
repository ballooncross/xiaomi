import { json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { mergeLocalEnv } from '$lib/server/env';
import { getIcaToolStatus, triggerIcaChecker } from '$lib/server/ica-tool';
import type { Env } from '$lib/server/types';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform }) => {
  const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
  return json(await getIcaToolStatus(env));
};

export const POST: RequestHandler = async ({ request, platform }) => {
  const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
  if (!isAuthorized(request, env)) return json({ error: 'Unauthorized' }, { status: 401 });

  try {
    return json(await triggerIcaChecker(env));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'ICA checker failed' }, { status: 500 });
  }
};

function isAuthorized(request: Request, env?: Env): boolean {
  if (!env?.ADMIN_TOKEN) return true;
  return request.headers.get('x-admin-token') === env.ADMIN_TOKEN;
}
