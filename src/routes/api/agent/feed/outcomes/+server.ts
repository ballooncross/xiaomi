import { json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { mergeLocalEnv } from '$lib/server/env';
import { getDb } from '$lib/server/db';
import type { Env } from '$lib/server/types';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, platform }) => {
  const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
  if (!isAuthorized(request, env)) return json({ error: 'Unauthorized' }, { status: 401 });

  const db = getDb(env);
  const stats = await db.getAgentOutcomeStats();
  const recentFeeds = await db.listAgentFeeds({ limit: 20 });

  return json({
    summary: {
      total: stats.total,
      saved: stats.saved,
      tracked: stats.tracked,
      dismissed: stats.dismissed,
      ignored: stats.ignored,
    },
    bySource: stats.bySource,
    byTopic: stats.byTopic,
    recentFeeds: recentFeeds.map((f) => ({
      id: f.id,
      title: f.title,
      source: f.source,
      status: f.status,
      confidence: f.confidence,
      topics: f.topics,
      createdAt: f.createdAt,
    })),
  });
};

function isAuthorized(request: Request, env?: Env): boolean {
  if (!env?.ADMIN_TOKEN) return true;
  return request.headers.get('x-admin-token') === env.ADMIN_TOKEN;
}
