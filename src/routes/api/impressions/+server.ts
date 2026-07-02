import { json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { mergeLocalEnv } from '$lib/server/env';
import { getDb } from '$lib/server/db';
import type { Env } from '$lib/server/types';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, platform }) => {
  const body = (await request.json().catch(() => ({}))) as { itemIds?: string[]; type?: string };
  if (!body.itemIds || !Array.isArray(body.itemIds) || body.itemIds.length === 0) {
    return json({ error: 'itemIds array is required' }, { status: 400 });
  }

  const db = getDb(mergeLocalEnv(platform?.env as Env | undefined, privateEnv));
  await db.recordImpressions(body.itemIds, body.type);
  return json({ ok: true });
};
