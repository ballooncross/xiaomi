import { json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { mergeLocalEnv } from '$lib/server/env';
import { getDb } from '$lib/server/db';
import { dedupeBatch } from '$lib/server/dedup';
import { hydrateImageForUrl } from '$lib/server/images';
import { isStaleItem, scoreItem } from '$lib/server/scoring';
import type { AgentFeedItem, Env, RadarItem, WatchTopic } from '$lib/server/types';
import type { RequestHandler } from './$types';

type FeedInput = {
  source: string;
  cadence?: 'hourly' | 'daily' | 'weekly';
  title: string;
  summary?: string;
  url?: string;
  imageUrl?: string;
  publishedAt?: string;
  kind?: string;
  confidence?: number;
  relevanceReason?: string;
  topics?: string[];
  metadata?: Record<string, unknown>;
};

const PROMOTE_CONFIDENCE = 0.45;
const MAX_IMAGE_HYDRATIONS = 6;

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
  let accepted = 0;
  let urlDuplicates = 0;

  // Store every non-duplicate submission in agent_feeds, collect promotable ones
  const promotable: Array<{ feed: AgentFeedItem; item: RadarItem }> = [];

  for (const input of body.items) {
    if (!input.title || !input.source) continue;

    if (input.url) {
      const existing = await db.findAgentFeedByUrl(input.url);
      if (existing) {
        urlDuplicates += 1;
        continue;
      }
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
      status: 'pending'
    };

    await db.insertAgentFeed(feed);
    await db.insertPreferenceSignal({
      id: crypto.randomUUID(),
      signalType: 'agent_suggestion',
      signalValue: feed.title,
      source: 'agent'
    });
    accepted += 1;

    const candidate = feedToRadarItem(feed, topics, input.imageUrl, normalizeDate(input.publishedAt));
    if (feed.confidence >= PROMOTE_CONFIDENCE && matchesAnyTopic(feed, topics) && !isStaleItem(candidate)) {
      promotable.push({ feed, item: candidate });
    } else {
      results.push({ id: feed.id, status: feed.status, promotedItemId: null });
    }
  }

  // Batch dedup: candidates vs each other and vs recent stored items
  const existing = await db.listItemsForDedup(14);
  const { toInsert, merges, duplicateCount } = dedupeBatch(
    promotable.map((p) => p.item),
    existing
  );

  let hydrations = 0;
  let promoted = 0;
  for (const item of toInsert) {
    if (item.url && !item.imageUrl && hydrations < MAX_IMAGE_HYDRATIONS) {
      hydrations += 1;
      const { imageUrl, resolvedUrl } = await hydrateImageForUrl(item.url);
      if (imageUrl) item.imageUrl = imageUrl;
      if (resolvedUrl) item.url = resolvedUrl;
    }
    await db.upsertItem(item);
    const source = promotable.find((p) => p.item.id === item.id);
    if (source) {
      await db.updateAgentFeedStatus(source.feed.id, 'promoted', item.id);
      results.push({ id: source.feed.id, status: 'promoted', promotedItemId: item.id });
      promoted += 1;
    }
  }
  for (const merge of merges) {
    await db.applyItemMerge(merge);
  }
  // Feeds whose items merged into existing coverage stay stored, marked dismissed
  for (const { feed, item } of promotable) {
    if (!toInsert.some((i) => i.id === item.id)) {
      await db.updateAgentFeedStatus(feed.id, 'dismissed');
      results.push({ id: feed.id, status: 'dismissed', promotedItemId: null });
    }
  }

  return json({
    accepted,
    duplicates: urlDuplicates + duplicateCount,
    promoted,
    merged: merges.length,
    items: results
  });
};

function feedToRadarItem(feed: AgentFeedItem, topics: WatchTopic[], imageUrl?: string, publishedAt?: string): RadarItem {
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
    imageUrl,
    publishedAt,
    artists: [],
    topics: feed.topics,
    raw: feed.metadata,
    score: 0,
    status: 'new',
    relatedSources: []
  };
  return scoreItem(item, topics);
}

function normalizeDate(value?: string): string | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function isAuthorized(request: Request, env?: Env): boolean {
  if (!env?.ADMIN_TOKEN) return true;
  return request.headers.get('x-admin-token') === env.ADMIN_TOKEN;
}

function validateKind(kind?: string): AgentFeedItem['kind'] {
  const valid = ['concert', 'trend', 'news', 'opportunity', 'insight'];
  return valid.includes(kind ?? '') ? (kind as AgentFeedItem['kind']) : 'trend';
}

function matchesAnyTopic(feed: AgentFeedItem, topics: WatchTopic[]): boolean {
  const feedText = [feed.title, feed.summary, ...feed.topics].join(' ').toLowerCase();
  return topics.some((topic) => {
    if (!topic.enabled || topic.mode === 'blacklist') return false;
    return [topic.name, ...topic.aliases].some((name) => feedText.includes(name.toLowerCase()));
  });
}
