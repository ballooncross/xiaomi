import type { FeedbackAction, RadarItem, WatchTopic } from './types';

const sourceWeight: Record<string, number> = {
  ticketmaster: 24,
  bandsintown: 20,
  rss: 10,
  demo: 0,
  manual: 8
};

export function scoreItem(item: RadarItem, topics: WatchTopic[]): RadarItem {
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
  return undefined;
}

export function fallbackSummary(item: RadarItem): string {
  const text = item.description || item.title;
  return text.length <= 180 ? text : `${text.slice(0, 177).trim()}...`;
}

export function reasonForItem(item: RadarItem): string {
  if (item.kind === 'concert' && item.artists.length > 0) {
    return `Matched your ${item.artists[0]} watch and ${item.location ?? 'event'} signal.`;
  }
  if (item.topics.length > 0) return `Matched ${item.topics.slice(0, 2).join(', ')}.`;
  return 'Matched your watch settings.';
}
