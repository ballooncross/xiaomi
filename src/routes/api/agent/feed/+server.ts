import { json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { mergeLocalEnv } from '$lib/server/env';
import { getDb } from '$lib/server/db';
import { scoreItem } from '$lib/server/scoring';
import type { AgentFeedItem, Env, RadarItem } from '$lib/server/types';
import type { RequestHandler } from './$types';

type FeedInput = {
  source: string;
  cadence?: 'hourly' | 'daily' | 'weekly';
  title: string;
  summary?: string;
  url?: string;
  kind?: string;
  confidence?: number;
  relevanceReason?: string;
  topics?: string[];
  metadata?: Record<string, unknown>;
};

export const POST: RequestHandler = async ({ request, platform }) => {
  const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
  if (!isAuthorized(request, env)) return json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { items?: FeedInput[] };
  if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
    return json({ error: 'items array is required' }, { status: 400 });
  }

  const db = getDb(env);
  const topics = await db.listTopics();
  const results: Array<{ id: string; status: string; promotedItemId: string | null }> = [];
  let duplicates = 0;
  let promoted = 0;

  for (const input of body.items) {
    if (!input.title || !input.source) continue;

    // Dedup by URL
    if (input.url) {
      const existing = await db.findAgentFeedByUrl(input.url);
      if (existing) { duplicates++; continue; }
    }

    const feed: AgentFeedItem = {
      id: crypto.randomUUID(),
      source: input.source,
      cadence: input.cadence ?? 'daily',
      title: input.title,
      summary: input.summary ?? '',
      url: input.url,
      kind: validateKind(input.kind),
      confidence: Math.max(0, Math.min(1, input.confidence ?? 0.5)),
      relevanceReason: input.relevanceReason ?? '',
      topics: input.topics ?? [],
      metadata: input.metadata ?? {},
      status: 'pending',
    };

    await db.insertAgentFeed(feed);

    // Record agent_suggestion signal
    await db.insertPreferenceSignal({
      id: crypto.randomUUID(),
      signalType: 'agent_suggestion',
      signalValue: feed.title,
      source: 'agent',
    });

    // Auto-promote high-confidence items that match active watch topics
    const shouldPromote = feed.confidence >= 0.45 && matchesAnyTopic(feed, topics);
    if (shouldPromote) {
      const item: RadarItem = {
        id: crypto.randomUUID(),
        sourceId: `agent-${feed.source}`,
        sourceType: 'agent',
        externalId: feed.id,
        kind: feed.kind,
        title: feed.title,
        summary: feed.summary,
        description: feed.relevanceReason,
        url: feed.url,
        artists: [],
        topics: feed.topics,
        raw: feed.metadata,
        score: 0,
        status: 'new',
      };

      const scored = scoreItem(item, topics);
      await db.upsertItem(scored);
      await db.updateAgentFeedStatus(feed.id, 'promoted', item.id);
      feed.status = 'promoted';
      feed.promotedItemId = item.id;
      promoted++;
    }

    results.push({ id: feed.id, status: feed.status, promotedItemId: feed.promotedItemId ?? null });
  }

  return json({
    accepted: results.length,
    duplicates,
    promoted,
    items: results,
  });
};

function isAuthorized(request: Request, env?: Env): boolean {
  if (!env?.ADMIN_TOKEN) return true;
  return request.headers.get('x-admin-token') === env.ADMIN_TOKEN;
}

function validateKind(kind?: string): AgentFeedItem['kind'] {
  const valid = ['concert', 'trend', 'news', 'opportunity', 'insight'];
  return valid.includes(kind ?? '') ? (kind as AgentFeedItem['kind']) : 'trend';
}

function matchesAnyTopic(feed: AgentFeedItem, topics: Array<{ name: string; aliases: string[]; enabled: boolean; mode: string }>): boolean {
  const feedText = [feed.title, feed.summary, ...feed.topics].join(' ').toLowerCase();
  return topics.some((t) => {
    if (!t.enabled || t.mode === 'blacklist') return false;
    return [t.name, ...t.aliases].some((name) => feedText.includes(name.toLowerCase()));
  });
}
