import { XMLParser } from 'fast-xml-parser';
import type { RadarItem, WatchTopic } from '../types';

type GdeltArticle = {
  url?: string;
  url_mobile?: string;
  title?: string;
  seendate?: string;
  socialimage?: string;
  sourcecountry?: string;
  domain?: string;
  language?: string;
};

type RssSource = {
  id: string;
  name: string;
  url: string;
  categories: string[];
};

const rssSources: RssSource[] = [
  {
    id: 'techcrunch',
    name: 'TechCrunch',
    url: 'https://techcrunch.com/feed/',
    categories: ['business', 'career']
  },
  {
    id: 'the-verge',
    name: 'The Verge',
    url: 'https://www.theverge.com/rss/index.xml',
    categories: ['business', 'career']
  },
  {
    id: 'cnbc-world',
    name: 'CNBC World',
    url: 'https://www.cnbc.com/id/100727362/device/rss/rss.html',
    categories: ['business', 'geopolitics']
  },
  {
    id: 'cna',
    name: 'CNA',
    url: 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml',
    categories: ['business', 'career', 'geopolitics']
  }
];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: true
});

export async function buildTrendSearchItems(topics: WatchTopic[]): Promise<RadarItem[]> {
  const trendTopics = topics.filter((topic) => topic.enabled && topic.type === 'topic' && topic.category !== 'concerts');
  const topicItems = await Promise.all(trendTopics.slice(0, 8).map(fetchTopicItems));
  const rssItems = await fetchCuratedRssItems(trendTopics);
  return dedupeItems([...topicItems.flat(), ...rssItems]).slice(0, 40);
}

async function fetchTopicItems(topic: WatchTopic): Promise<RadarItem[]> {
  const [gdeltItems, googleItems] = await Promise.all([fetchGdeltItems(topic), fetchGoogleNewsItems(topic)]);
  return dedupeItems([...gdeltItems, ...googleItems]).slice(0, 6);
}

async function fetchGdeltItems(topic: WatchTopic): Promise<RadarItem[]> {
  const query = buildQuery(topic);
  const params = new URLSearchParams({
    query,
    mode: 'ArtList',
    format: 'json',
    maxrecords: '8',
    sort: 'hybridrel',
    timespan: '7d'
  });

  const response = await fetchWithTimeout(`https://api.gdeltproject.org/api/v2/doc/doc?${params}`);
  if (!response?.ok) return [];
  const data = (await response.json().catch(() => ({}))) as { articles?: GdeltArticle[] };
  return (data.articles ?? [])
    .filter((article) => article.url && article.title)
    .map((article) => articleToItem(topic, {
      sourceId: 'gdelt',
      sourceType: 'gdelt',
      externalId: article.url ?? article.title ?? crypto.randomUUID(),
      title: article.title ?? topic.name,
      summary: article.domain ? `${article.domain}${article.sourcecountry ? ` · ${article.sourcecountry}` : ''}` : topic.name,
      description: article.title ?? topic.name,
      url: article.url_mobile || article.url,
      imageUrl: article.socialimage,
      publishedAt: gdeltDateToIso(article.seendate),
      raw: article
    }));
}

async function fetchGoogleNewsItems(topic: WatchTopic): Promise<RadarItem[]> {
  const params = new URLSearchParams({
    q: buildQuery(topic),
    hl: 'en-SG',
    gl: 'SG',
    ceid: 'SG:en'
  });
  const response = await fetchWithTimeout(`https://news.google.com/rss/search?${params}`);
  if (!response?.ok) return [];
  return (await parseRssItems(await response.text(), {
    sourceId: 'google-news',
    sourceType: 'google_news',
    topic,
    sourceName: 'Google News'
  })).slice(0, 4);
}

async function fetchCuratedRssItems(topics: WatchTopic[]): Promise<RadarItem[]> {
  if (topics.length === 0) return [];
  const responses = await Promise.all(
    rssSources.map(async (source) => {
      const response = await fetchWithTimeout(source.url);
      if (!response?.ok) return [];
      const xml = await response.text();
      const sourceTopics = topics.filter((topic) => source.categories.includes(topic.category));
      if (sourceTopics.length === 0) return [];
      const items = await Promise.all(
        sourceTopics.map(async (topic) => {
          const matchedItems = (await parseRssItems(xml, {
            sourceId: source.id,
            sourceType: 'rss',
            topic,
            sourceName: source.name
          })).filter((item) => matchesTopic(item, topic));
          return Promise.all(matchedItems.slice(0, 4).map(hydrateItemImage));
        })
      );
      const generalItems = (await parseRssItems(xml, {
        sourceId: source.id,
        sourceType: 'rss',
        topic: sourceTopics[0],
        sourceName: source.name,
        hydrateImages: true
      }))
        .slice(0, 3)
        .map((item) => ({
          ...item,
          topics: [source.name, source.categories[0]],
          score: Math.max(35, item.score - 16)
        }));
      return [...items.flat(), ...generalItems];
    })
  );
  return dedupeItems(responses.flat()).slice(0, 24);
}

async function parseRssItems(
  xml: string,
  options: { sourceId: string; sourceType: string; topic: WatchTopic; sourceName: string; hydrateImages?: boolean }
): Promise<RadarItem[]> {
  const parsed = parser.parse(xml) as {
    rss?: { channel?: { item?: unknown[] | unknown } };
    feed?: { entry?: unknown[] | unknown };
  };
  const entries = normalizeArray(parsed.rss?.channel?.item ?? parsed.feed?.entry);
  const items = await Promise.all(entries.slice(0, 16).map((entry) => rssEntryToItem(entry as Record<string, unknown>, options)));
  return items.filter((item): item is RadarItem => Boolean(item));
}

async function rssEntryToItem(
  entry: Record<string, unknown>,
  options: { sourceId: string; sourceType: string; topic: WatchTopic; sourceName: string; hydrateImages?: boolean }
): Promise<RadarItem | undefined> {
  const title = textValue(entry.title);
  const url = linkValue(entry.link) || textValue(entry.guid) || textValue(entry.id);
  if (!title || !url) return undefined;

  const description = stripHtml(textValue(entry.description) || textValue(entry.summary) || textValue(entry.content) || title);
  const imageUrl = imageValue(entry) || (options.hydrateImages ? await fetchPageImage(url) : undefined);
  const publishedAt = dateValue(entry.pubDate) || dateValue(entry.published) || dateValue(entry.updated);

  return articleToItem(options.topic, {
    sourceId: options.sourceId,
    sourceType: options.sourceType,
    externalId: url,
    title,
    summary: description || options.sourceName,
    description,
    url,
    imageUrl,
    publishedAt,
    raw: { sourceName: options.sourceName }
  });
}

function articleToItem(
  topic: WatchTopic,
  input: {
    sourceId: string;
    sourceType: string;
    externalId: string;
    title: string;
    summary: string;
    description: string;
    url?: string;
    imageUrl?: string;
    publishedAt?: string;
    raw: unknown;
  }
): RadarItem {
  return {
    id: crypto.randomUUID(),
    sourceId: input.sourceId,
    sourceType: input.sourceType,
    externalId: input.externalId,
    kind: topic.category === 'business' ? 'opportunity' : topic.category === 'geopolitics' ? 'news' : 'trend',
    title: input.title,
    summary: truncate(input.summary, 220),
    description: input.description,
    url: input.url,
    imageUrl: input.imageUrl,
    publishedAt: input.publishedAt,
    topics: [topic.name, topic.category],
    artists: [],
    raw: input.raw,
    score: topic.priority * 12,
    status: 'new'
  };
}

function buildQuery(topic: WatchTopic): string {
  const terms = [topic.name, ...topic.aliases].filter(Boolean).slice(0, 4);
  if (terms.length === 1) return terms[0];
  return terms.map((term) => (term.includes(' ') ? `"${term}"` : term)).join(' OR ');
}

function matchesTopic(item: RadarItem, topic: WatchTopic): boolean {
  const terms = [topic.name, ...topic.aliases].map((term) => term.toLowerCase()).filter(Boolean);
  const haystack = [item.title, item.summary, item.description].join(' ').toLowerCase();
  return terms.some((term) => haystack.includes(term.replace(/^"|"$/g, '')));
}

async function fetchWithTimeout(url: string): Promise<Response | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

function dedupeItems(items: RadarItem[]): RadarItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.url || item.externalId || item.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeArray(value: unknown): unknown[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function textValue(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object' && value && '#text' in value) return textValue((value as { '#text': unknown })['#text']);
  return '';
}

function linkValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return linkValue(value[0]);
  if (typeof value === 'object' && value) {
    const record = value as Record<string, unknown>;
    return textValue(record.href) || textValue(record['@_href']);
  }
  return '';
}

function imageValue(entry: Record<string, unknown>): string | undefined {
  const enclosure = firstRecord(entry.enclosure);
  const mediaContent = firstRecord(entry['media:content']);
  const mediaThumbnail = firstRecord(entry['media:thumbnail']);
  return textValue(mediaContent?.url) || textValue(mediaThumbnail?.url) || textValue(enclosure?.url) || undefined;
}

async function hydrateItemImage(item: RadarItem): Promise<RadarItem> {
  if (item.imageUrl || !item.url) return item;
  const imageUrl = await fetchPageImage(item.url);
  return imageUrl ? { ...item, imageUrl } : item;
}

function firstRecord(value: unknown): Record<string, unknown> | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'object' && first ? (first as Record<string, unknown>) : undefined;
}

async function fetchPageImage(url: string): Promise<string | undefined> {
  const response = await fetchWithTimeout(url);
  const contentType = response?.headers.get('content-type') ?? '';
  if (!response?.ok || !contentType.includes('text/html')) return undefined;
  const html = await response.text().catch(() => '');
  if (!html) return undefined;
  const image =
    metaContent(html, 'property', 'og:image') ||
    metaContent(html, 'property', 'og:image:url') ||
    metaContent(html, 'name', 'twitter:image') ||
    metaContent(html, 'name', 'twitter:image:src');
  if (!image) return undefined;
  try {
    return new URL(image, url).toString();
  } catch {
    return image;
  }
}

function metaContent(html: string, key: 'name' | 'property', value: string): string | undefined {
  const pattern = new RegExp(`<meta[^>]+${key}=["']${escapeRegExp(value)}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i');
  const reversed = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${key}=["']${escapeRegExp(value)}["'][^>]*>`, 'i');
  return html.match(pattern)?.[1] || html.match(reversed)?.[1];
}

function dateValue(value: unknown): string | undefined {
  const raw = textValue(value);
  if (!raw) return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function gdeltDateToIso(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const compact = value.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})Z?$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}T${compact[4]}:${compact[5]}:${compact[6]}Z`;
  return dateValue(value);
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function truncate(value: string, length: number): string {
  if (value.length <= length) return value;
  return `${value.slice(0, length - 3).trim()}...`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
