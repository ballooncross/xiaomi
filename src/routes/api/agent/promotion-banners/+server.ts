import { json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { mergeLocalEnv } from '$lib/server/env';
import { isAdminAuthorized } from '$lib/server/request-auth';
import { listQueuedBanners, storeBannerTranscriptions, triggerPromotionCheck } from '$lib/server/promotions/service';
import type { Env } from '$lib/server/types';
import type { RequestHandler } from './$types';

/**
 * Promotion banner reading for the local agent.
 *
 * GET  -> banner images the promotion check could not read from cache.
 * POST -> store the agent's transcriptions; once none are left, re-run the
 *         check so image-only offers are recorded and notified straight away.
 */
export const GET: RequestHandler = async ({ request, platform, locals }) => {
  const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
  if (!isAdminAuthorized(locals, request, env.ADMIN_TOKEN)) return json({ error: 'Unauthorized' }, { status: 401 });
  if (!env.DB) return json({ error: 'Database unavailable' }, { status: 503 });
  return json({ pending: await listQueuedBanners(env.DB) });
};

export const POST: RequestHandler = async ({ request, platform, locals }) => {
  const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
  if (!isAdminAuthorized(locals, request, env.ADMIN_TOKEN)) return json({ error: 'Unauthorized' }, { status: 401 });
  if (!env.DB) return json({ error: 'Database unavailable' }, { status: 503 });
  const body = (await request.json().catch(() => null)) as { transcriptions?: unknown } | null;
  const transcriptions = Array.isArray(body?.transcriptions) ? body.transcriptions.filter(isTranscription) : [];
  if (!transcriptions.length) return json({ error: 'transcriptions are required' }, { status: 400 });
  const { stored, remaining } = await storeBannerTranscriptions(env.DB, transcriptions);
  const rechecked = stored > 0 && remaining === 0;
  if (rechecked) await triggerPromotionCheck(env);
  return json({ stored, remaining, rechecked });
};

function isTranscription(value: unknown): value is { hash: string; text: string } {
  const item = value as { hash?: unknown; text?: unknown } | null;
  return typeof item?.hash === 'string' && /^[0-9a-f]{64}$/.test(item.hash)
    && typeof item.text === 'string' && item.text.length <= 2000;
}
