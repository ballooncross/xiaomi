import { containsCjk, log } from './utils';
import type { AgentContext, ScanTier, SearchQuery, SourceConfig } from './types';

/**
 * Seed sources. These are data rows, not code: the AI can propose more via
 * source_suggestion signals, which come back through the compiled context and
 * are merged in by mergeLearnedSources().
 */
export const seedSources: SourceConfig[] = [
  {
    id: 'google-news',
    kind: 'rss',
    url: 'https://news.google.com/rss/search?q={query}&hl=en-SG&gl=SG&ceid=SG:en',
    lang: 'en',
    baseConfidence: 0.5,
    maxItems: 6,
    tiers: ['targeted', 'full', 'deep']
  },
  {
    id: 'google-news-cn',
    kind: 'rss',
    url: 'https://news.google.com/rss/search?q={query}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans',
    lang: 'zh',
    baseConfidence: 0.45,
    maxItems: 6,
    tiers: ['targeted', 'full', 'deep']
  },
  {
    id: 'gdelt',
    kind: 'json',
    url: 'https://api.gdeltproject.org/api/v2/doc/doc?query={query}&mode=ArtList&format=json&maxrecords=6&sort=hybridrel&timespan=3d',
    lang: 'any',
    itemsPath: 'articles',
    fields: { title: 'title', url: 'url', publishedAt: 'seendate' },
    baseConfidence: 0.45,
    maxItems: 6,
    tiers: ['full', 'deep']
  },
  {
    id: 'bilibili',
    kind: 'json',
    url: 'https://api.bilibili.com/x/web-interface/search/type?keyword={query}&search_type=article&page=1',
    lang: 'zh',
    itemsPath: 'data.result',
    fields: { title: 'title', summary: 'desc', id: 'id' },
    urlTemplate: 'https://www.bilibili.com/read/cv{id}',
    baseConfidence: 0.4,
    maxItems: 5,
    tiers: ['deep']
  },
  {
    id: 'zhihu-search',
    kind: 'json',
    url: 'https://www.zhihu.com/api/v4/search_v3?q={query}&type=content&limit=6',
    lang: 'zh',
    itemsPath: 'data',
    fields: { title: 'object.question.title', summary: 'object.excerpt', id: 'object.question.id' },
    urlTemplate: 'https://www.zhihu.com/question/{id}',
    baseConfidence: 0.4,
    maxItems: 5,
    tiers: ['full', 'deep']
  },
  {
    id: 'zhihu-hot',
    kind: 'json',
    url: 'https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=15',
    lang: 'zh',
    itemsPath: 'data',
    fields: { title: 'target.title', summary: 'target.excerpt', id: 'target.id' },
    urlTemplate: 'https://www.zhihu.com/question/{id}',
    baseConfidence: 0.35,
    maxItems: 10,
    tiers: ['full', 'deep']
  },
  {
    id: '36kr',
    kind: 'rss',
    url: 'https://36kr.com/feed',
    lang: 'zh',
    filterByQuery: true,
    baseConfidence: 0.4,
    maxItems: 6,
    tiers: ['full', 'deep']
  },
  {
    id: 'weibo-hot',
    kind: 'json',
    url: 'https://weibo.com/ajax/side/hotSearch',
    lang: 'zh',
    itemsPath: 'data.realtime',
    fields: { title: 'word', summary: 'label_name' },
    urlTemplate: 'https://s.weibo.com/weibo?q={title}',
    baseConfidence: 0.3,
    maxItems: 12,
    tiers: ['deep']
  },
  {
    id: 'hackernews',
    kind: 'json',
    url: 'https://hacker-news.firebaseio.com/v0/topstories.json',
    lang: 'en',
    baseConfidence: 0.35,
    maxItems: 20,
    tiers: ['full', 'deep']
  }
];

/** Sources the AI proposed earlier, surfaced back through the compiled context. */
export function mergeLearnedSources(base: SourceConfig[], context: AgentContext): SourceConfig[] {
  const suggested = context.structuredContext?.sources?.suggested ?? [];
  const known = new Set(base.map((source) => source.id));
  const merged = [...base];

  for (const suggestion of suggested) {
    const candidate = validateLearnedConfig(suggestion.config);
    if (!candidate || known.has(candidate.id)) continue;
    known.add(candidate.id);
    merged.push(candidate);
    log(`  Using learned source: ${candidate.id} (${candidate.url})`);
  }

  return merged;
}

function validateLearnedConfig(raw: unknown): SourceConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const record = raw as Record<string, unknown>;
  const url = typeof record.url === 'string' ? record.url : '';
  const kind = record.kind === 'json' ? 'json' : record.kind === 'rss' ? 'rss' : undefined;
  const name = typeof record.name === 'string' ? record.name : '';
  if (!url.startsWith('http') || !kind || !name) return undefined;
  // Learned JSON sources need field mappings we cannot guess; only RSS is safe to auto-adopt
  if (kind !== 'rss') return undefined;
  return {
    id: `learned-${name.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, '-').replace(/^-+|-+$/g, '')}`,
    kind,
    url,
    lang: containsCjk(name) || containsCjk(url) ? 'zh' : 'en',
    filterByQuery: !url.includes('{query}'),
    baseConfidence: 0.35,
    maxItems: 5,
    tiers: ['full', 'deep']
  };
}

/** Build the query list for this tier from every interest signal we have. */
export function buildQueries(context: AgentContext, tier: ScanTier, changedTopics: string[]): SearchQuery[] {
  const queries: SearchQuery[] = [];
  const avoid = new Set(
    (context.structuredContext?.constraints?.avoidTopics ?? []).map((topic) => topic.toLowerCase())
  );
  const pushQuery = (query: SearchQuery) => {
    if (avoid.has(query.topic.toLowerCase())) return;
    queries.push(query);
  };

  // 重点跟踪 stories run at EVERY tier, including 10-minute targeted ticks:
  // tracking means the user wants continuing updates, not a one-time bookmark
  for (const story of context.structuredContext?.tracking ?? []) {
    pushQuery({
      query: story.query,
      topic: story.title.slice(0, 60),
      category: 'general',
      lang: containsCjk(story.query) ? 'zh' : 'en'
    });
  }

  const activeTopics = context.watchTopics.filter((topic) => topic.enabled && topic.mode !== 'blacklist');
  const topicsToSearch =
    tier === 'targeted' && changedTopics.length > 0
      ? activeTopics.filter((topic) => changedTopics.some((name) => name.toLowerCase() === topic.name.toLowerCase()))
      : activeTopics;

  for (const topic of topicsToSearch) {
    const terms = [topic.name, ...topic.aliases].filter(Boolean);
    const latinTerms = terms.filter((term) => !containsCjk(term));
    const cjkTerms = terms.filter((term) => containsCjk(term));

    if (latinTerms.length > 0 || cjkTerms.length === 0) {
      pushQuery({
        query: latinTerms.join(' OR ') || topic.name,
        topic: topic.name,
        category: topic.category,
        lang: 'en'
      });
    }
    if (cjkTerms.length > 0) {
      pushQuery({ query: cjkTerms.join(' '), topic: topic.name, category: topic.category, lang: 'zh' });
    }
  }

  if (tier !== 'targeted') {
    for (const emerging of context.structuredContext?.interestProfile?.emerging ?? []) {
      pushQuery({
        query: emerging.suggestedKeywords.join(' OR ') || emerging.topic,
        topic: emerging.topic,
        category: 'general',
        lang: containsCjk(emerging.topic) ? 'zh' : 'en'
      });
    }
    for (const theme of context.structuredContext?.activeThemes ?? []) {
      pushQuery({
        query: theme.theme,
        topic: theme.theme,
        category: 'general',
        lang: containsCjk(theme.theme) ? 'zh' : 'en'
      });
    }
    for (const input of (context.structuredContext?.interestProfile?.naturalLanguageInputs ?? []).slice(0, 5)) {
      pushQuery({
        query: input.split(/\s+/).slice(0, 6).join(' '),
        topic: input.slice(0, 60),
        category: 'general',
        lang: containsCjk(input) ? 'zh' : 'en'
      });
    }
    for (const high of context.engagementSignals.highEngagement) {
      if (!queries.some((query) => query.topic.toLowerCase() === high.topic.toLowerCase())) {
        pushQuery({
          query: high.topic,
          topic: high.topic,
          category: 'general',
          lang: containsCjk(high.topic) ? 'zh' : 'en'
        });
      }
    }
  }

  return queries;
}

/** Which sources run for a query (or standalone) at this tier. */
export function sourcesForTier(sources: SourceConfig[], tier: ScanTier): {
  queryDriven: SourceConfig[];
  standalone: SourceConfig[];
} {
  const eligible = sources.filter((source) => source.tiers.includes(tier));
  return {
    queryDriven: eligible.filter((source) => source.url.includes('{query}') || source.filterByQuery),
    standalone: eligible.filter((source) => !source.url.includes('{query}') && !source.filterByQuery)
  };
}
