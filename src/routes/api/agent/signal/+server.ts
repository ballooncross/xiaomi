import { json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { mergeLocalEnv } from '$lib/server/env';
import { getAdminScopedDb } from '$lib/server/users';
import { compileContext } from '$lib/server/context-compiler';
import type { Env, PreferenceSignal, SignalType } from '$lib/server/types';
import type { RequestHandler } from './$types';

type SignalInput = {
  type: string;
  value: string;
  relatedItemId?: string;
  relatedTopicId?: string;
  source?: string;
};

const VALID_TYPES = new Set<SignalType>([
  'feedback', 'topic_added', 'topic_removed', 'note', 'interest',
  'not_interested', 'more_like_this', 'region_hint', 'free_text', 'agent_suggestion',
  'source_suggestion',
]);

export const POST: RequestHandler = async ({ request, platform }) => {
  const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
  if (!isAuthorized(request, env)) return json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { signals?: SignalInput[] };
  if (!body.signals || !Array.isArray(body.signals) || body.signals.length === 0) {
    return json({ error: 'signals array is required' }, { status: 400 });
  }

  const db = await getAdminScopedDb(env);
  let accepted = 0;

  for (const input of body.signals) {
    if (!input.type || !VALID_TYPES.has(input.type as SignalType)) continue;
    if (!input.value && input.type !== 'agent_suggestion') continue;

    const signal: PreferenceSignal = {
      id: crypto.randomUUID(),
      signalType: input.type as SignalType,
      signalValue: input.value ?? '',
      relatedItemId: input.relatedItemId,
      relatedTopicId: input.relatedTopicId,
      source: input.source ?? 'agent',
    };

    await db.insertPreferenceSignal(signal);
    accepted++;

    // Auto-create blacklist topic for "not_interested" signals
    if (input.type === 'not_interested' && input.value) {
      const topics = await db.listTopics();
      const alreadyExists = topics.some(
        (t) => t.name.toLowerCase() === input.value.toLowerCase()
      );
      if (!alreadyExists) {
        await db.upsertTopic({
          id: `blacklist-${slug(input.value)}`,
          type: 'topic',
          name: input.value,
          aliases: [],
          category: 'general',
          priority: 1,
          mode: 'blacklist',
          enabled: true,
        });
      }
    }
  }

  // Auto-recompile context if enough new signals accumulated
  let contextRecompileTriggered = false;
  const latestContext = await db.getLatestAiContext();
  const currentSignalCount = (await db.listPreferenceSignals({ limit: 1000 })).length;
  const lastCompiledCount = latestContext ? (latestContext.stats?.totalFeedbackEvents ?? 0) : 0;
  if (currentSignalCount - lastCompiledCount >= 5 || !latestContext) {
    await compileContext(db);
    contextRecompileTriggered = true;
  }

  return json({ accepted, contextRecompileTriggered });
};

function isAuthorized(request: Request, env?: Env): boolean {
  if (!env?.ADMIN_TOKEN) return true;
  return request.headers.get('x-admin-token') === env.ADMIN_TOKEN;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9一-鿿]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
