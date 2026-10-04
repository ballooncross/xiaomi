import { json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { mergeLocalEnv } from '$lib/server/env';
import { requireSessionUser } from '$lib/server/request-auth';
import { getPromotionData, savePromotionWatch } from '$lib/server/promotions/service';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform, locals }) => {
  const user = requireSessionUser(locals);
  return json(await getPromotionData(mergeLocalEnv(platform?.env, privateEnv), user.id));
};

export const PUT: RequestHandler = async ({ request, platform, locals }) => {
  const user = requireSessionUser(locals);
  const env = mergeLocalEnv(platform?.env, privateEnv);
  const body = await request.json<{ enabled?: unknown; minDiscount?: unknown }>().catch(() => null);
  if (!body || typeof body.enabled !== 'boolean' || typeof body.minDiscount !== 'number' || !Number.isInteger(body.minDiscount) || body.minDiscount < 1 || body.minDiscount > 99) {
    return json({ error: 'Choose a discount between 1 and 99 percent.' }, { status: 400 });
  }
  if (!env.DB) return json({ error: 'Database unavailable' }, { status: 503 });
  await savePromotionWatch(env, user.id, body.enabled, body.minDiscount);
  return json(await getPromotionData(env, user.id));
};
