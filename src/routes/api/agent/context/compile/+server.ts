import { json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { mergeLocalEnv } from '$lib/server/env';
import { getAdminScopedDb } from '$lib/server/users';
import { compileContext } from '$lib/server/context-compiler';
import type { Env } from '$lib/server/types';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, platform }) => {
  const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
  if (!isAuthorized(request, env)) return json({ error: 'Unauthorized' }, { status: 401 });

  const db = await getAdminScopedDb(env);
  const doc = await compileContext(db);

  return json({
    version: doc.version,
    compiledAt: doc.compiledAt,
    contextSummary: `${doc.interestProfile.primary.length} topics, ${doc.stats.totalFeedbackEvents} feedback events, ${doc.interestProfile.emerging.length} emerging`,
  });
};

function isAuthorized(request: Request, env?: Env): boolean {
  if (!env?.ADMIN_TOKEN) return true;
  return request.headers.get('x-admin-token') === env.ADMIN_TOKEN;
}
