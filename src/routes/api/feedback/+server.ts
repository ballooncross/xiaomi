import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { env as privateEnv } from '$env/dynamic/private';
import { mergeLocalEnv } from '$lib/server/env';
import type { Env, FeedbackAction } from '$lib/server/types';
import type { RequestHandler } from './$types';

const actions = new Set<FeedbackAction>(['save', 'track', 'unsave', 'not_relevant', 'more_like_this', 'less_like_this', 'viewed', 'duplicate']);

export const POST: RequestHandler = async ({ request, platform }) => {
  const body = (await request.json()) as { itemId?: string; action?: FeedbackAction; reason?: string };
  if (!body.itemId || !body.action || !actions.has(body.action)) {
    return json({ error: 'Invalid feedback payload' }, { status: 400 });
  }

  const db = getDb(mergeLocalEnv(platform?.env as Env | undefined, privateEnv));
  await db.recordFeedback(body.itemId, body.action, body.reason);
  return json({ ok: true });
};
