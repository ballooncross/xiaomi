import type { FeedbackAction, RadarItem, WatchTopic } from './types';

export const MAX_TREND_AGE_DAYS = 28;

const sourceWeight: Record<string, number> = {
  ticketmaster: 24,
  bandsintown: 20,
  gdelt: 18,
  google_news: 16,
  agent: 14,
  rss: 10,
  demo: 0,
  manual: 8
};

export type ScoringContext = {
  impressionCounts?: Map<string, number>;
  contextBoosts?: Map<string, number>;
};

export function scoreItem(item: RadarItem, topics: WatchTopic[], ctx?: ScoringContext): RadarItem {
  const haystack = [item.title, item.summary, item.description, item.location, ...item.artists, ...item.topics]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (topics.some((topic) => topic.enabled && topic.mode === 'blacklist' && matchesTopic(haystack, topic))) {
    return { ...item, score: 0, status: 'dismissed', summary: item.summary || fallbackSummary(item) };
  }

  let score = sourceWeight[item.sourceType] ?? 5;

  for (const topic of topics) {
    if (!topic.enabled || topic.mode === 'blacklist') continue;
    const names = [topic.name, ...topic.aliases].map((value) => value.toLowerCase());
    if (names.some((name) => haystack.includes(name))) score += topic.priority * 10;
  }

  if (item.sourceId === 'ticketmaster-sg-popular') score += 10;
  if (item.kind === 'concert') score += 12;
  if (haystack.includes('singapore') || haystack.includes('sg')) score += 18;
  if (item.startsAt && new Date(item.startsAt).getTime() > Date.now()) score += 8;
  if (item.startsAt && new Date(item.startsAt).getTime() < Date.now()) score -= 55;
  if (haystack.includes('past event') || haystack.includes('already passed')) score -= 35;
  if (item.url) score += 4;

  const hasFutureEvent = item.startsAt && new Date(item.startsAt).getTime() > Date.now();
  if (!hasFutureEvent) {
    score += freshnessDecay(item.publishedAt ?? item.createdAt);
  }

  // Context-based boosts from compiled preferences
  if (ctx?.contextBoosts) {
    for (const topic of item.topics) {
      const boost = ctx.contextBoosts.get(topic.toLowerCase());
      if (boost) score += boost;
    }
  }

  // Impression decay: reduce score for items the user has already seen
  if (ctx?.impressionCounts) {
    const impressions = ctx.impressionCounts.get(item.id) ?? 0;
    if (impressions > 0) {
      score += impressionDecay(impressions, score);
    }
  }

  return { ...item, score: Math.max(0, Math.min(score, 100)), summary: item.summary || fallbackSummary(item) };
}

function matchesTopic(haystack: string, topic: WatchTopic): boolean {
  return [topic.name, ...topic.aliases]
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .some((name) => haystack.includes(name));
}

export function statusForFeedback(action: FeedbackAction): RadarItem['status'] | undefined {
  if (action === 'save') return 'saved';
  if (action === 'track') return 'tracking';
  if (action === 'not_relevant' || action === 'less_like_this') return 'dismissed';
  if (action === 'viewed') return 'viewed';
  return undefined;
}

export function fallbackSummary(item: RadarItem): string {
  const text = item.description || item.title;
  return text.length <= 180 ? text : `${text.slice(0, 177).trim()}...`;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function freshnessDecay(dateStr: string | undefined): number {
  if (!dateStr) return 0;
  const age = Date.now() - new Date(dateStr).getTime();
  if (age < 0 || !Number.isFinite(age)) return 0;
  if (age < DAY) return 20;
  if (age < 3 * DAY) return 12;
  if (age < 7 * DAY) return 4;
  if (age < 14 * DAY) return -15;
  if (age < MAX_TREND_AGE_DAYS * DAY) return -35;
  return -100;
}

export function isStaleItem(item: RadarItem): boolean {
  if (item.startsAt && new Date(item.startsAt).getTime() > Date.now()) return false;
  const requiresPublicationDate = ['trend', 'news', 'opportunity'].includes(item.kind);
  const dateStr = requiresPublicationDate ? item.publishedAt : item.publishedAt ?? item.createdAt;
  if (!dateStr) return requiresPublicationDate;
  const age = Date.now() - new Date(dateStr).getTime();
  if (!Number.isFinite(age)) return requiresPublicationDate;
  return age > MAX_TREND_AGE_DAYS * DAY;
}

function impressionDecay(impressionCount: number, currentScore: number): number {
  const maxImpressions = currentScore >= 90 ? 7
    : currentScore >= 70 ? 4
    : currentScore >= 50 ? 2
    : 1;
  if (impressionCount >= maxImpressions) return -100;
  return -(impressionCount * 5);
}

export function reasonForItem(item: RadarItem): string {
  if (item.kind === 'concert' && item.artists.length > 0) {
    return `匹配你对 ${item.artists[0]} 的关注，以及 ${item.location ?? '活动'} 信号。`;
  }
  if (item.topics.length > 0) return `匹配主题：${item.topics.slice(0, 2).join('、')}。`;
  return '匹配你的关注设置。';
}
