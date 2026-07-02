#!/usr/bin/env npx tsx
import { XMLParser } from 'fast-xml-parser';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// .env loader
// ---------------------------------------------------------------------------

const scriptDir = dirname(fileURLToPath(import.meta.url));
try {
  const envFile = readFileSync(join(scriptDir, '.env'), 'utf-8');
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
} catch { /* no .env file */ }

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RADAR_URL = process.env.RADAR_URL || 'https://personal-radar.pages.dev';
const RADAR_TOKEN = process.env.RADAR_TOKEN || '';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3:0.6b';
const DRY_RUN = process.argv.includes('--dry-run');
const USE_OLLAMA = process.argv.includes('--ollama');
const ONCE = process.argv.includes('--once');
const POLL_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const FULL_SCAN_INTERVAL_H = 4;
const DEEP_SCAN_INTERVAL_H = 24;
const SIGNAL_CHANGE_THRESHOLD = 3;
const STATE_PATH = join(scriptDir, '.agent-state.json');

const headers: Record<string, string> = {
  'Content-Type': 'application/json',
  ...(RADAR_TOKEN ? { 'x-admin-token': RADAR_TOKEN } : {}),
};

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', trimValues: true });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AgentContext = {
  watchTopics: Array<{
    id: string; name: string; aliases: string[]; category: string;
    priority: number; mode: string; enabled: boolean;
  }>;
  recentItems: { titles: string[]; urls: string[]; externalIds: string[] };
  preferenceSignals: Array<{ signalType: string; signalValue: string; createdAt?: string }>;
  structuredContext: {
    version?: number;
    interestProfile?: {
      primary: Array<{ topic: string; keywords: string[]; strength: number }>;
      emerging: Array<{ topic: string; suggestedKeywords: string[] }>;
      declined: Array<{ topic: string }>;
      naturalLanguageInputs: string[];
    };
    queryStrategies?: Array<{ topic: string; suggestedQueries: string[]; cadence: string }>;
    constraints?: { avoidTopics: string[] };
    activeThemes?: Array<{ theme: string }>;
  } | null;
  engagementSignals: {
    highEngagement: Array<{ topic: string; saveRate: number }>;
    lowEngagement: Array<{ topic: string; dismissRate: number }>;
  };
  lastContextVersion: number;
};

type DiscoveredItem = {
  source: string;
  title: string;
  summary: string;
  url: string;
  kind: string;
  confidence: number;
  relevanceReason: string;
  topics: string[];
  metadata: Record<string, unknown>;
};

type ScanTier = 'skip' | 'targeted' | 'full' | 'deep';

type AgentState = {
  lastContextVersion: number;
  lastSignalCount: number;
  lastTopicIds: string[];
  lastQuickScanAt: string;
  lastFullScanAt: string;
  lastDeepScanAt: string;
  runCount: number;
};

type SearchQuery = {
  query: string;
  topic: string;
  category: string;
  sources: SourceId[];
};

type SourceId = 'google_news' | 'gdelt' | 'hackernews' | 'bilibili' | 'zhihu' | '36kr' | 'baidu_news' | 'weibo';

// ---------------------------------------------------------------------------
// State management
// ---------------------------------------------------------------------------

function loadState(): AgentState {
  try {
    if (existsSync(STATE_PATH)) {
      return JSON.parse(readFileSync(STATE_PATH, 'utf-8')) as AgentState;
    }
  } catch { /* corrupted state, start fresh */ }
  return {
    lastContextVersion: 0,
    lastSignalCount: 0,
    lastTopicIds: [],
    lastQuickScanAt: '',
    lastFullScanAt: '',
    lastDeepScanAt: '',
    runCount: 0,
  };
}

function saveState(state: AgentState) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

// ---------------------------------------------------------------------------
// Decision engine
// ---------------------------------------------------------------------------

function decideScanTier(state: AgentState, context: AgentContext): { tier: ScanTier; reason: string; changedTopics: string[] } {
  const now = Date.now();
  const hoursSinceDeep = state.lastDeepScanAt ? (now - new Date(state.lastDeepScanAt).getTime()) / 3600000 : Infinity;
  const hoursSinceFull = state.lastFullScanAt ? (now - new Date(state.lastFullScanAt).getTime()) / 3600000 : Infinity;

  // First run ever
  if (state.runCount === 0) {
    return { tier: 'full', reason: 'First run, initializing', changedTopics: [] };
  }

  // Deep scan: 24+ hours since last
  if (hoursSinceDeep >= DEEP_SCAN_INTERVAL_H) {
    return { tier: 'deep', reason: `${Math.round(hoursSinceDeep)}h since last deep scan`, changedTopics: [] };
  }

  // Full scan: 4+ hours since last
  if (hoursSinceFull >= FULL_SCAN_INTERVAL_H) {
    return { tier: 'full', reason: `${Math.round(hoursSinceFull)}h since last full scan`, changedTopics: [] };
  }

  // Context version changed
  if (context.lastContextVersion > state.lastContextVersion && state.lastContextVersion > 0) {
    const currentTopicIds = context.watchTopics.filter(t => t.enabled && t.mode !== 'blacklist').map(t => t.id);
    const newTopics = currentTopicIds.filter(id => !state.lastTopicIds.includes(id));
    const changedTopicNames = context.watchTopics
      .filter(t => newTopics.includes(t.id))
      .map(t => t.name);
    if (changedTopicNames.length > 0) {
      return { tier: 'targeted', reason: `Context updated (v${state.lastContextVersion} -> v${context.lastContextVersion}), new topics: ${changedTopicNames.join(', ')}`, changedTopics: changedTopicNames };
    }
    return { tier: 'targeted', reason: `Context version changed (v${state.lastContextVersion} -> v${context.lastContextVersion})`, changedTopics: [] };
  }

  // Signal count changed significantly
  const currentSignalCount = context.preferenceSignals.length;
  if (currentSignalCount - state.lastSignalCount >= SIGNAL_CHANGE_THRESHOLD) {
    return { tier: 'targeted', reason: `${currentSignalCount - state.lastSignalCount} new signals since last run`, changedTopics: [] };
  }

  return { tier: 'skip', reason: 'No changes detected', changedTopics: [] };
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

async function main() {
  log('Personal Radar Agent starting');
  log(`  Radar: ${RADAR_URL}`);
  log(`  Mode: ${DRY_RUN ? 'dry-run' : 'live'}, ${ONCE ? 'single run' : `loop every ${POLL_INTERVAL_MS / 60000}min`}`);
  log(`  Ollama: ${USE_OLLAMA ? `${OLLAMA_URL} (${OLLAMA_MODEL})` : 'off'}`);

  if (!RADAR_TOKEN) {
    log('WARNING: No RADAR_TOKEN set. API calls may fail with 401.');
  }

  // Run once immediately, then loop
  await tick();

  if (!ONCE) {
    log(`Next check in ${POLL_INTERVAL_MS / 60000} minutes...`);
    setInterval(async () => {
      try {
        await tick();
        log(`Next check in ${POLL_INTERVAL_MS / 60000} minutes...`);
      } catch (e) {
        log(`ERROR in tick: ${e}`);
      }
    }, POLL_INTERVAL_MS);
  }
}

async function tick() {
  const state = loadState();

  // Fetch context
  const context = await fetchContext();
  if (!context) {
    log('Could not fetch context. Skipping this tick.');
    return;
  }

  // Decide what to do
  const decision = decideScanTier(state, context);
  log(`Decision: ${decision.tier.toUpperCase()} (${decision.reason})`);

  if (decision.tier === 'skip') return;

  // Build queries based on tier
  const queries = buildSearchQueries(context, decision.tier, decision.changedTopics);
  log(`Generated ${queries.length} queries for ${decision.tier} scan`);

  // Search
  const items = await executeSearch(queries, context);
  log(`Found ${items.length} relevant items`);

  // Decide max items based on tier
  const maxItems = decision.tier === 'targeted' ? 8 : decision.tier === 'full' ? 15 : 25;
  items.sort((a, b) => b.confidence - a.confidence);
  const toSubmit = items.slice(0, maxItems);

  if (toSubmit.length === 0) {
    log('No new items to submit.');
  } else if (DRY_RUN) {
    log('DRY RUN, would submit:');
    for (const item of toSubmit) {
      log(`  [${item.confidence.toFixed(2)}] [${item.source}] ${item.title}`);
    }
  } else {
    const result = await submitFeeds(toSubmit);
    log(`Submitted: ${result.accepted} accepted, ${result.duplicates} dupes, ${result.promoted} promoted`);

    const signals = buildSignals(toSubmit, context, decision);
    if (signals.length > 0) {
      await submitSignals(signals);
      log(`Submitted ${signals.length} signals`);
    }
  }

  // Update state
  const now = new Date().toISOString();
  state.lastContextVersion = context.lastContextVersion;
  state.lastSignalCount = context.preferenceSignals.length;
  state.lastTopicIds = context.watchTopics.filter(t => t.enabled && t.mode !== 'blacklist').map(t => t.id);
  state.lastQuickScanAt = now;
  if (decision.tier === 'full' || decision.tier === 'deep') state.lastFullScanAt = now;
  if (decision.tier === 'deep') state.lastDeepScanAt = now;
  state.runCount++;
  saveState(state);
  log(`State saved (run #${state.runCount})`);
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

async function fetchContext(): Promise<AgentContext | null> {
  try {
    const resp = await fetch(`${RADAR_URL}/api/agent/context`, { headers });
    if (!resp.ok) {
      log(`Context fetch failed: ${resp.status} ${resp.statusText}`);
      return null;
    }
    return await resp.json() as AgentContext;
  } catch (e) {
    log(`Context fetch error: ${e}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Query building
// ---------------------------------------------------------------------------

const EN_SOURCES: SourceId[] = ['google_news', 'gdelt'];
const CN_SOURCES: SourceId[] = ['bilibili', 'zhihu', '36kr', 'baidu_news'];
const ALL_SOURCES: SourceId[] = [...EN_SOURCES, ...CN_SOURCES, 'hackernews', 'weibo'];

function buildSearchQueries(context: AgentContext, tier: ScanTier, changedTopics: string[]): SearchQuery[] {
  const queries: SearchQuery[] = [];
  const avoidTopics = new Set(
    context.structuredContext?.constraints?.avoidTopics?.map(t => t.toLowerCase()) ?? []
  );

  const activeTopics = context.watchTopics.filter(t => t.enabled && t.mode !== 'blacklist');

  // For targeted scan, only search changed/new topics, or all if none specified
  const topicsToSearch = (tier === 'targeted' && changedTopics.length > 0)
    ? activeTopics.filter(t => changedTopics.some(ct => ct.toLowerCase() === t.name.toLowerCase()))
    : activeTopics;

  // Sources depend on tier
  const enSources: SourceId[] = tier === 'deep' ? ['google_news', 'gdelt'] : ['google_news'];
  const cnSources: SourceId[] = tier === 'targeted' ? ['baidu_news'] : tier === 'full' ? ['baidu_news', 'zhihu'] : CN_SOURCES;

  for (const topic of topicsToSearch) {
    const terms = [topic.name, ...topic.aliases].filter(Boolean);
    const hasChinese = terms.some(t => /[一-鿿]/.test(t));

    // English query
    queries.push({
      query: terms.filter(t => !/[一-鿿]/.test(t)).join(' OR ') || topic.name,
      topic: topic.name,
      category: topic.category,
      sources: enSources,
    });

    // Chinese query (if topic has Chinese terms or deep scan)
    if (hasChinese || tier === 'deep') {
      const cnTerms = terms.filter(t => /[一-鿿]/.test(t));
      if (cnTerms.length > 0) {
        queries.push({
          query: cnTerms.join(' '),
          topic: topic.name,
          category: topic.category,
          sources: cnSources,
        });
      }
    }
  }

  // Emerging topics (full + deep)
  if (tier !== 'targeted') {
    const emerging = context.structuredContext?.interestProfile?.emerging ?? [];
    for (const e of emerging) {
      if (avoidTopics.has(e.topic.toLowerCase())) continue;
      queries.push({
        query: e.suggestedKeywords.join(' OR ') || e.topic,
        topic: e.topic,
        category: 'general',
        sources: ['google_news'],
      });
    }
  }

  // Active themes (full + deep)
  if (tier !== 'targeted') {
    const themes = context.structuredContext?.activeThemes ?? [];
    for (const theme of themes) {
      if (avoidTopics.has(theme.theme.toLowerCase())) continue;
      queries.push({
        query: theme.theme,
        topic: theme.theme,
        category: 'general',
        sources: ['google_news'],
      });
    }
  }

  // Natural language inputs (full + deep)
  if (tier !== 'targeted') {
    const nlInputs = context.structuredContext?.interestProfile?.naturalLanguageInputs ?? [];
    for (const input of nlInputs.slice(0, 5)) {
      const shortened = input.split(/\s+/).slice(0, 6).join(' ');
      queries.push({
        query: shortened,
        topic: input,
        category: 'general',
        sources: ['google_news'],
      });
    }
  }

  // Hacker News (full + deep only)
  if (tier !== 'targeted') {
    queries.push({ query: '', topic: 'Hacker News', category: 'business', sources: ['hackernews'] });
  }

  // Weibo hot (deep only)
  if (tier === 'deep') {
    queries.push({ query: '', topic: 'Weibo trending', category: 'general', sources: ['weibo'] });
  }

  // Zhihu hot (full + deep)
  if (tier !== 'targeted') {
    queries.push({ query: '', topic: 'Zhihu trending', category: 'general', sources: ['zhihu'] });
  }

  return queries;
}

// ---------------------------------------------------------------------------
// Search execution
// ---------------------------------------------------------------------------

async function executeSearch(queries: SearchQuery[], context: AgentContext): Promise<DiscoveredItem[]> {
  const allItems: DiscoveredItem[] = [];
  const seenUrls = new Set(context.recentItems.urls);
  const seenTitles = new Set(context.recentItems.titles.map(t => t.toLowerCase()));

  for (const query of queries) {
    const sourceNames = query.sources.join(',');
    const label = query.query ? `"${query.query}" [${sourceNames}]` : `[${sourceNames}]`;
    log(`  Searching: ${label}`);

    const items = await searchSources(query);
    for (const item of items) {
      if (item.url && seenUrls.has(item.url)) continue;
      if (seenTitles.has(item.title.toLowerCase())) continue;
      if (item.url) seenUrls.add(item.url);
      seenTitles.add(item.title.toLowerCase());

      const scored = await scoreRelevance(item, context);
      if (scored.confidence >= 0.3) allItems.push(scored);
    }
  }

  return allItems;
}

async function searchSources(query: SearchQuery): Promise<DiscoveredItem[]> {
  const fetchers = query.sources.map(source => {
    switch (source) {
      case 'google_news': return fetchGoogleNews(query);
      case 'gdelt': return fetchGdelt(query);
      case 'hackernews': return fetchHackerNews();
      case 'bilibili': return fetchBilibili(query);
      case 'zhihu': return query.query ? fetchZhihuSearch(query) : fetchZhihuHot(query);
      case '36kr': return fetch36kr(query);
      case 'baidu_news': return fetchBaiduNews(query);
      case 'weibo': return fetchWeiboHot(query);
      default: return Promise.resolve([]);
    }
  });

  const settled = await Promise.allSettled(fetchers);
  return settled.flatMap(r => r.status === 'fulfilled' ? r.value : []);
}

// ---------------------------------------------------------------------------
// English source fetchers
// ---------------------------------------------------------------------------

async function fetchGoogleNews(query: SearchQuery): Promise<DiscoveredItem[]> {
  try {
    const params = new URLSearchParams({ q: query.query, hl: 'en-SG', gl: 'SG', ceid: 'SG:en' });
    const resp = await fetchWithTimeout(`https://news.google.com/rss/search?${params}`);
    if (!resp?.ok) return [];
    const xml = await resp.text();
    const parsed = parser.parse(xml) as { rss?: { channel?: { item?: unknown } } };
    return normalizeArray(parsed.rss?.channel?.item).slice(0, 6).map(entry => {
      const e = entry as Record<string, unknown>;
      return {
        source: 'google-news', title: textValue(e.title), summary: stripHtml(textValue(e.description)),
        url: textValue(e.link), kind: query.category === 'business' ? 'opportunity' : 'trend',
        confidence: 0.5, relevanceReason: `Google News: "${query.query}"`,
        topics: [query.topic, query.category], metadata: { publishedAt: textValue(e.pubDate) },
      };
    }).filter(i => i.title && i.url);
  } catch { return []; }
}

async function fetchGdelt(query: SearchQuery): Promise<DiscoveredItem[]> {
  try {
    const params = new URLSearchParams({ query: query.query, mode: 'ArtList', format: 'json', maxrecords: '6', sort: 'hybridrel', timespan: '3d' });
    const resp = await fetchWithTimeout(`https://api.gdeltproject.org/api/v2/doc/doc?${params}`);
    if (!resp?.ok) return [];
    const data = await resp.json() as { articles?: Array<{ url?: string; title?: string; seendate?: string; domain?: string }> };
    return (data.articles ?? []).filter(a => a.url && a.title).map(a => ({
      source: 'gdelt', title: a.title!, summary: a.domain ? `via ${a.domain}` : '',
      url: a.url!, kind: query.category === 'geopolitics' ? 'news' : 'trend',
      confidence: 0.45, relevanceReason: `GDELT: "${query.query}"`,
      topics: [query.topic, query.category], metadata: { seenDate: a.seendate },
    }));
  } catch { return []; }
}

async function fetchHackerNews(): Promise<DiscoveredItem[]> {
  try {
    const resp = await fetchWithTimeout('https://hacker-news.firebaseio.com/v0/topstories.json');
    if (!resp?.ok) return [];
    const ids = (await resp.json() as number[]).slice(0, 20);
    const stories = await Promise.all(ids.map(async id => {
      const r = await fetchWithTimeout(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
      return r?.ok ? await r.json() as { title?: string; url?: string; score?: number } : null;
    }));
    return stories.filter((s): s is NonNullable<typeof s> => Boolean(s?.title && s?.url)).map(s => ({
      source: 'hackernews', title: s.title!, summary: `HN score: ${s.score ?? 0}`, url: s.url!,
      kind: 'trend', confidence: 0.35, relevanceReason: 'Hacker News frontpage',
      topics: ['Hacker News', 'tech'], metadata: { hnScore: s.score },
    }));
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// Chinese source fetchers
// ---------------------------------------------------------------------------

async function fetchBilibili(query: SearchQuery): Promise<DiscoveredItem[]> {
  try {
    const params = new URLSearchParams({ keyword: query.query, search_type: 'article', page: '1' });
    const resp = await fetchWithTimeout(`https://api.bilibili.com/x/web-interface/search/type?${params}`, 10000);
    if (!resp?.ok) return [];
    const data = await resp.json() as { data?: { result?: Array<{ title?: string; id?: number; desc?: string; pub_date?: number }> } };
    return (data.data?.result ?? []).slice(0, 6).map(r => ({
      source: 'bilibili', title: stripHtml(r.title ?? ''), summary: (r.desc ?? '').slice(0, 200),
      url: `https://www.bilibili.com/read/cv${r.id}`, kind: 'trend',
      confidence: 0.4, relevanceReason: `Bilibili: "${query.query}"`,
      topics: [query.topic, query.category], metadata: { platform: 'bilibili' },
    })).filter(i => i.title);
  } catch { return []; }
}

async function fetchZhihuHot(_query: SearchQuery): Promise<DiscoveredItem[]> {
  try {
    const resp = await fetchWithTimeout('https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=15', 10000);
    if (!resp?.ok) return [];
    const data = await resp.json() as { data?: Array<{ target?: { title?: string; id?: number; excerpt?: string }; detail_text?: string }> };
    return (data.data ?? []).slice(0, 10).map(item => {
      const t = item.target;
      return {
        source: 'zhihu-hot', title: t?.title ?? '', summary: (t?.excerpt ?? '').slice(0, 200),
        url: `https://www.zhihu.com/question/${t?.id}`, kind: 'trend',
        confidence: 0.35, relevanceReason: `Zhihu hot: ${item.detail_text ?? ''}`,
        topics: ['Zhihu', 'general'], metadata: { platform: 'zhihu' },
      };
    }).filter(i => i.title);
  } catch { return []; }
}

async function fetchZhihuSearch(query: SearchQuery): Promise<DiscoveredItem[]> {
  try {
    const params = new URLSearchParams({ q: query.query, type: 'content', limit: '6' });
    const resp = await fetchWithTimeout(`https://www.zhihu.com/api/v4/search_v3?${params}`, 10000);
    if (!resp?.ok) return [];
    const data = await resp.json() as { data?: Array<{ object?: { question?: { title?: string; id?: number }; excerpt?: string } }> };
    return (data.data ?? []).slice(0, 6).map(item => {
      const q = item.object?.question;
      return {
        source: 'zhihu-search', title: q?.title ?? '', summary: (item.object?.excerpt ?? '').slice(0, 200),
        url: q?.id ? `https://www.zhihu.com/question/${q.id}` : '', kind: 'trend',
        confidence: 0.4, relevanceReason: `Zhihu: "${query.query}"`,
        topics: [query.topic, query.category], metadata: { platform: 'zhihu' },
      };
    }).filter(i => i.title && i.url);
  } catch { return []; }
}

async function fetch36kr(query: SearchQuery): Promise<DiscoveredItem[]> {
  try {
    const resp = await fetchWithTimeout('https://36kr.com/feed', 10000);
    if (!resp?.ok) return [];
    const xml = await resp.text();
    const parsed = parser.parse(xml) as { rss?: { channel?: { item?: unknown } } };
    const queryLower = query.query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 1);
    return normalizeArray(parsed.rss?.channel?.item).slice(0, 20)
      .map(entry => {
        const e = entry as Record<string, unknown>;
        return {
          source: '36kr', title: textValue(e.title), summary: stripHtml(textValue(e.description)).slice(0, 200),
          url: textValue(e.link), kind: 'trend' as const,
          confidence: 0.4, relevanceReason: `36kr RSS`,
          topics: [query.topic, query.category], metadata: { platform: '36kr' },
        };
      })
      .filter(i => {
        if (!i.title || !i.url) return false;
        const haystack = `${i.title} ${i.summary}`.toLowerCase();
        return queryTerms.some(t => haystack.includes(t));
      })
      .slice(0, 6);
  } catch { return []; }
}

async function fetchBaiduNews(query: SearchQuery): Promise<DiscoveredItem[]> {
  try {
    const params = new URLSearchParams({ q: query.query, hl: 'zh-CN', gl: 'CN', ceid: 'CN:zh-Hans' });
    const resp = await fetchWithTimeout(`https://news.google.com/rss/search?${params}`);
    if (!resp?.ok) return [];
    const xml = await resp.text();
    const parsed = parser.parse(xml) as { rss?: { channel?: { item?: unknown } } };
    return normalizeArray(parsed.rss?.channel?.item).slice(0, 6).map(entry => {
      const e = entry as Record<string, unknown>;
      return {
        source: 'google-news-cn', title: textValue(e.title), summary: stripHtml(textValue(e.description)),
        url: textValue(e.link), kind: 'trend',
        confidence: 0.45, relevanceReason: `Chinese news: "${query.query}"`,
        topics: [query.topic, query.category], metadata: { locale: 'zh-CN' },
      };
    }).filter(i => i.title && i.url);
  } catch { return []; }
}

async function fetchWeiboHot(_query: SearchQuery): Promise<DiscoveredItem[]> {
  try {
    const resp = await fetchWithTimeout('https://weibo.com/ajax/side/hotSearch', 10000);
    if (!resp?.ok) return [];
    const data = await resp.json() as { data?: { realtime?: Array<{ word?: string; num?: number; label_name?: string }> } };
    return (data.data?.realtime ?? []).slice(0, 15).map(item => ({
      source: 'weibo-hot', title: item.word ?? '', summary: `Hot: ${item.num ?? 0} discussions${item.label_name ? ` [${item.label_name}]` : ''}`,
      url: `https://s.weibo.com/weibo?q=${encodeURIComponent(item.word ?? '')}`, kind: 'trend',
      confidence: 0.3, relevanceReason: 'Weibo trending',
      topics: ['Weibo', 'general'], metadata: { platform: 'weibo', heat: item.num },
    })).filter(i => i.title);
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// Relevance scoring
// ---------------------------------------------------------------------------

async function scoreRelevance(item: DiscoveredItem, context: AgentContext): Promise<DiscoveredItem> {
  const haystack = `${item.title} ${item.summary}`.toLowerCase();

  const avoidTopics = context.structuredContext?.constraints?.avoidTopics ?? [];
  for (const avoid of avoidTopics) {
    if (haystack.includes(avoid.toLowerCase())) return { ...item, confidence: 0 };
  }

  let confidence = item.confidence;
  const matchedTopics: string[] = [];

  for (const topic of context.watchTopics) {
    if (!topic.enabled || topic.mode === 'blacklist') continue;
    const names = [topic.name, ...topic.aliases].map(n => n.toLowerCase());
    if (names.some(n => haystack.includes(n))) {
      confidence += 0.1 * (topic.priority / 5);
      matchedTopics.push(topic.name);
    }
  }

  const nlInputs = context.structuredContext?.interestProfile?.naturalLanguageInputs ?? [];
  for (const input of nlInputs) {
    const keywords = input.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const matchCount = keywords.filter(k => haystack.includes(k)).length;
    if (matchCount >= 2) { confidence += 0.1; matchedTopics.push(input.slice(0, 40)); }
  }

  for (const high of context.engagementSignals.highEngagement) {
    if (haystack.includes(high.topic.toLowerCase())) confidence += 0.1;
  }
  for (const low of context.engagementSignals.lowEngagement) {
    if (haystack.includes(low.topic.toLowerCase())) confidence -= 0.1;
  }

  if (USE_OLLAMA && confidence >= 0.4) {
    const ollamaScore = await scoreWithOllama(item, context);
    if (ollamaScore !== null) confidence = confidence * 0.4 + ollamaScore * 0.6;
  }

  if (matchedTopics.length > 0) {
    item.relevanceReason = `Matches: ${matchedTopics.join(', ')}`;
    item.topics = [...new Set([...item.topics, ...matchedTopics])];
  }

  return { ...item, confidence: Math.max(0, Math.min(1, confidence)) };
}

async function scoreWithOllama(item: DiscoveredItem, context: AgentContext): Promise<number | null> {
  const interests = context.watchTopics.filter(t => t.enabled && t.mode !== 'blacklist').map(t => t.name).join(', ');
  const prompt = `/no_think\nRate 0-100 how relevant this article is to someone interested in: ${interests}\n\nTitle: ${item.title}\nSummary: ${item.summary}\n\nRespond with ONLY a number 0-100.`;
  try {
    const resp = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false }),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as { response?: string };
    const match = data.response?.match(/\d+/);
    return match ? Math.min(100, Math.max(0, parseInt(match[0]))) / 100 : null;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Submission
// ---------------------------------------------------------------------------

async function submitFeeds(items: DiscoveredItem[]): Promise<{ accepted: number; duplicates: number; promoted: number }> {
  try {
    const resp = await fetch(`${RADAR_URL}/api/agent/feed`, { method: 'POST', headers, body: JSON.stringify({ items }) });
    if (!resp.ok) { log(`Feed submit failed: ${resp.status}`); return { accepted: 0, duplicates: 0, promoted: 0 }; }
    return await resp.json() as { accepted: number; duplicates: number; promoted: number };
  } catch (e) { log(`Feed submit error: ${e}`); return { accepted: 0, duplicates: 0, promoted: 0 }; }
}

async function submitSignals(signals: Array<{ type: string; value: string; source: string }>) {
  try {
    await fetch(`${RADAR_URL}/api/agent/signal`, { method: 'POST', headers, body: JSON.stringify({ signals }) });
  } catch (e) { log(`Signal submit error: ${e}`); }
}

function buildSignals(
  submitted: DiscoveredItem[], context: AgentContext,
  decision: { tier: ScanTier; reason: string }
): Array<{ type: string; value: string; source: string }> {
  const signals: Array<{ type: string; value: string; source: string }> = [];

  const knownTopics = new Set(context.watchTopics.map(t => t.name.toLowerCase()));
  const newTopicCounts = new Map<string, number>();
  for (const item of submitted) {
    for (const topic of item.topics) {
      if (!knownTopics.has(topic.toLowerCase()) && !['tech', 'general', 'business', 'career', 'geopolitics', 'concerts', 'Hacker News', 'Zhihu', 'Weibo'].includes(topic)) {
        newTopicCounts.set(topic, (newTopicCounts.get(topic) ?? 0) + 1);
      }
    }
  }
  for (const [topic, count] of newTopicCounts) {
    if (count >= 2) {
      signals.push({ type: 'note', value: `Agent found ${count} items about "${topic}" (not a watch topic).`, source: 'agent' });
    }
  }

  const sources = [...new Set(submitted.map(i => i.source))].join(', ');
  signals.push({
    type: 'free_text',
    value: `[${decision.tier}] ${submitted.length} items from [${sources}]`,
    source: 'agent',
  });

  return signals;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<Response | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { signal: controller.signal }); }
  catch { return undefined; }
  finally { clearTimeout(timeout); }
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

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main().catch(e => { log(`FATAL: ${e}`); process.exit(1); });
