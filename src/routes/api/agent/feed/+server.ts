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
  const existingItems = await db.getRecentItemSummaries(14);
  const existingTitles = new Set(existingItems.map(i => normalizeTitle(i.title)));
  const existingUrls = new Set(existingItems.filter(i => i.url).map(i => i.url!));
  const results: Array<{ id: string; status: string; promotedItemId: string | null }> = [];
  let duplicates = 0;
  let promoted = 0;

  for (const input of body.items) {
    if (!input.title || !input.source) continue;

    // Dedup by URL against agent_feeds, retry promotion for pending
    if (input.url) {
      const existing = await db.findAgentFeedByUrl(input.url);
      if (existing) {
        if (existing.status === 'pending' && !existing.promotedItemId) {
          if (!isDuplicateOfExisting(existing.title, existing.url, existingTitles, existingUrls)) {
            const didPromote = await tryPromote(existing, topics, db);
            if (didPromote) promoted++;
          }
        }
        duplicates++;
        continue;
      }
    }

    // Dedup by title similarity against existing items in the main table
    if (isDuplicateOfExisting(input.title, input.url, existingTitles, existingUrls)) {
      duplicates++;
      continue;
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

    await db.insertPreferenceSignal({
      id: crypto.randomUUID(),
      signalType: 'agent_suggestion',
      signalValue: feed.title,
      source: 'agent',
    });

    const shouldPromote = feed.confidence >= 0.45 && matchesAnyTopic(feed, topics);
    if (shouldPromote) {
      const imageUrl = feed.url ? await fetchPageImage(feed.url) : undefined;
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
        artists: [],
        topics: feed.topics,
        raw: feed.metadata,
        score: 0,
        status: 'new',
      };

      const scored = scoreItem(item, topics);
      await db.upsertItem(scored);
      await db.updateAgentFeedStatus(feed.id, 'promoted', item.id);
      existingTitles.add(normalizeTitle(feed.title));
      if (feed.url) existingUrls.add(feed.url);
      feed.status = 'promoted';
      feed.promotedItemId = item.id;
      promoted++;
    }

    results.push({ id: feed.id, status: feed.status, promotedItemId: feed.promotedItemId ?? null });
  }

  return json({ accepted: results.length, duplicates, promoted, items: results });
};

async function tryPromote(
  existing: AgentFeedItem,
  topics: Awaited<ReturnType<ReturnType<typeof getDb>['listTopics']>>,
  db: ReturnType<typeof getDb>
): Promise<boolean> {
  const shouldPromote = existing.confidence >= 0.45 && matchesAnyTopic(existing, topics);
  if (!shouldPromote) return false;

  const imageUrl = existing.url ? await fetchPageImage(existing.url) : undefined;
  const item: RadarItem = {
    id: crypto.randomUUID(),
    sourceId: `agent-${existing.source}`,
    sourceType: 'agent',
    externalId: existing.id,
    kind: existing.kind,
    title: existing.title,
    summary: existing.summary,
    description: existing.relevanceReason,
    url: existing.url,
    imageUrl,
    artists: [],
    topics: existing.topics,
    raw: existing.metadata,
    score: 0,
    status: 'new',
  };
  const scored = scoreItem(item, topics);
  await db.upsertItem(scored);
  await db.updateAgentFeedStatus(existing.id, 'promoted', item.id);
  return true;
}

function isDuplicateOfExisting(title: string, url: string | undefined, existingTitles: Set<string>, existingUrls: Set<string>): boolean {
  if (url && existingUrls.has(url)) return true;
  const normalized = normalizeTitle(title);
  for (const existing of existingTitles) {
    if (titleSimilarity(normalized, existing) > 0.7) return true;
  }
  return false;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s*[-–—|]\s*[^-–—|]+$/, '') // strip " - Source Name" suffix
    .replace(/&nbsp;/g, ' ')
    .replace(/[^\w\s一-鿿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const wordsA = new Set(a.split(' ').filter(w => w.length > 2));
  const wordsB = new Set(b.split(' ').filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let overlap = 0;
  for (const w of wordsA) { if (wordsB.has(w)) overlap++; }
  return overlap / Math.min(wordsA.size, wordsB.size);
}

async function fetchPageImage(url: string): Promise<string | undefined> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok || !(resp.headers.get('content-type') ?? '').includes('text/html')) return undefined;
    const html = await resp.text();
    return metaContent(html, 'property', 'og:image')
      ?? metaContent(html, 'name', 'twitter:image')
      ?? metaContent(html, 'name', 'twitter:image:src');
  } catch { return undefined; }
}

function metaContent(html: string, key: string, value: string): string | undefined {
  const esc = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const p1 = new RegExp(`<meta[^>]+${key}=["']${esc}["'][^>]+content=["']([^"']+)["']`, 'i');
  const p2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${key}=["']${esc}["']`, 'i');
  return html.match(p1)?.[1] || html.match(p2)?.[1] || undefined;
}

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
