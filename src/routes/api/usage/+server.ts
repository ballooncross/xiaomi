import { json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { mergeLocalEnv } from '$lib/server/env';
import { getDb } from '$lib/server/db';
import { isFeatureAllowed } from '$lib/server/features';
import { parseUsageEvent } from '$lib/usage';
import { recordUsage } from '$lib/server/usage';
import type { Env } from '$lib/server/types';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, url, locals, platform }) => {
  if (request.headers.get('origin') !== url.origin) return json({ error: 'Same origin required' }, { status: 403 });
  const text = await request.text();
  if (text.length > 512) return json({ error: 'Payload too large' }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(text); } catch { return json({ error: 'Invalid JSON' }, { status: 400 }); }
  const event = parseUsageEvent(body);
  if (!event) return json({ error: 'Invalid event' }, { status: 400 });
  if (event.audience === 'member' && !locals.user) return json({ error: 'Sign in required' }, { status: 401 });
  const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
  if (event.view === 'gym' && !await isFeatureAllowed(getDb(env), 'gym_page', event.audience === 'guest' ? null : locals.user?.isAdmin)) {
    return json({ error: 'Feature unavailable' }, { status: 403 });
  }
  if (!env.DB) return new Response(null, { status: 204 });
  try {
    await recordUsage(env.DB, event);
    return new Response(null, { status: 204 });
  } catch {
    console.error('Usage counter write failed');
    return json({ error: 'Usage storage unavailable' }, { status: 503 });
  }
};
