import { json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { mergeLocalEnv } from '$lib/server/env';
import { parseLocalAgentStatusInput, recordLocalAgentStatus } from '$lib/server/local-agent-status';
import type { Env } from '$lib/server/types';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, platform }) => {
  const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
  if (!isAuthorized(request, env)) return json({ error: 'Unauthorized' }, { status: 401 });

  const input = parseLocalAgentStatusInput(await request.json().catch(() => null));
  if (!input) {
    return json({ error: 'status must be running, ok, or error, and detail is required' }, { status: 400 });
  }

  await recordLocalAgentStatus(env, input);
  return json({ ok: true });
};

function isAuthorized(request: Request, env?: Env): boolean {
  if (!env?.ADMIN_TOKEN) return true;
  return request.headers.get('x-admin-token') === env.ADMIN_TOKEN;
}
