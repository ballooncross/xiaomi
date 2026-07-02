import { fetchWithTimeout, getPath, normalizeArray, stripHtml, textValue, xmlParser } from './utils';
import type { DiscoveredItem, SearchQuery, SourceConfig } from './types';

/**
 * Generic fetchers driven by SourceConfig data. Adding a source means adding
 * a config row (possibly learned from the AI at runtime), not writing code.
 * The one exception is Hacker News, whose two-phase API gets a builtin below.
 */
export async function runSource(source: SourceConfig, query: SearchQuery | undefined): Promise<DiscoveredItem[]> {
  const needsQuery = source.url.includes('{query}');
  if (needsQuery && !query?.query) return [];
  if (source.id === 'hackernews') return fetchHackerNews(source);

  const url = needsQuery ? source.url.replace('{query}', encodeURIComponent(query!.query)) : source.url;
  const items = source.kind === 'rss' ? await fetchRssSource(source, url) : await fetchJsonSource(source, url);

  const topics = query ? [query.topic, query.category] : [source.id];
  let results = items.map((item) => ({
    ...item,
    source: source.id,
    kind: query?.category === 'business' ? 'opportunity' : query?.category === 'geopolitics' ? 'news' : 'trend',
    confidence: source.baseConfidence ?? 0.4,
    relevanceReason: query ? `${source.id}: "${query.query}"` : `${source.id} feed`,
    topics,
    metadata: { sourceId: source.id, searchQuery: query?.query }
  }));

  if (source.filterByQuery && query) {
    const terms = query.query
      .toLowerCase()
      .split(/\s+or\s+|\s+/)
      .map((term) => term.replace(/^"|"$/g, ''))
      .filter((term) => term.length > 1);
    results = results.filter((item) => {
      const haystack = `${item.title} ${item.summary}`.toLowerCase();
      return terms.some((term) => haystack.includes(term));
    });
  }

  return results.slice(0, source.maxItems ?? 6);
}

type RawItem = Pick<DiscoveredItem, 'title' | 'summary' | 'url'>;

async function fetchRssSource(source: SourceConfig, url: string): Promise<RawItem[]> {
  const response = await fetchWithTimeout(url);
  if (!response?.ok) return [];
  const xml = await response.text().catch(() => '');
  const parsed = xmlParser.parse(xml) as {
    rss?: { channel?: { item?: unknown } };
    feed?: { entry?: unknown };
  };
  const entries = normalizeArray(parsed.rss?.channel?.item ?? parsed.feed?.entry);
  return entries
    .map((entry) => {
      const record = entry as Record<string, unknown>;
      return {
        title: stripHtml(textValue(record.title)),
        summary: stripHtml(textValue(record.description) || textValue(record.summary) || ''),
        url: linkValue(record.link) || textValue(record.guid) || textValue(record.id) || undefined
      };
    })
    .filter((item) => item.title && item.url);
}

async function fetchJsonSource(source: SourceConfig, url: string): Promise<RawItem[]> {
  const response = await fetchWithTimeout(url);
  if (!response?.ok) return [];
  const data = await response.json().catch(() => undefined);
  if (!data) return [];

  const entries = normalizeArray(getPath(data, source.itemsPath ?? ''));
  const fields = source.fields ?? { title: 'title' };

  return entries
    .map((entry) => {
      const title = stripHtml(String(getPath(entry, fields.title) ?? ''));
      const summary = fields.summary ? stripHtml(String(getPath(entry, fields.summary) ?? '')) : '';
      let itemUrl = fields.url ? String(getPath(entry, fields.url) ?? '') : '';
      if (!itemUrl && source.urlTemplate) {
        itemUrl = source.urlTemplate
          .replace('{id}', String(fields.id ? getPath(entry, fields.id) ?? '' : ''))
          .replace('{title}', encodeURIComponent(title));
      }
      return { title, summary: summary.slice(0, 220), url: itemUrl || undefined };
    })
    .filter((item) => item.title);
}

async function fetchHackerNews(source: SourceConfig): Promise<DiscoveredItem[]> {
  const response = await fetchWithTimeout('https://hacker-news.firebaseio.com/v0/topstories.json');
  if (!response?.ok) return [];
  const ids = ((await response.json().catch(() => [])) as number[]).slice(0, 20);
  const stories = await Promise.all(
    ids.map(async (id) => {
      const storyResponse = await fetchWithTimeout(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
      if (!storyResponse?.ok) return null;
      return (await storyResponse.json().catch(() => null)) as { title?: string; url?: string; score?: number } | null;
    })
  );
  return stories
    .filter((story): story is NonNullable<typeof story> => Boolean(story?.title && story?.url))
    .slice(0, source.maxItems ?? 20)
    .map((story) => ({
      source: 'hackernews',
      title: story.title!,
      summary: `HN score: ${story.score ?? 0}`,
      url: story.url,
      kind: 'trend',
      confidence: source.baseConfidence ?? 0.35,
      relevanceReason: 'Hacker News frontpage',
      topics: ['Hacker News', 'tech'],
      metadata: { hnScore: story.score }
    }));
}

function linkValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return linkValue(value[0]);
  if (typeof value === 'object' && value) {
    const record = value as Record<string, unknown>;
    return textValue(record.href) || textValue(record['@_href']) || textValue(record['#text']);
  }
  return '';
}
