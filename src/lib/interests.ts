import type { InterestFeed, ItemKind, TrendCategory } from '$lib/server/types';

const TREND_CATEGORIES = new Set<TrendCategory>(['general', 'business', 'career', 'life', 'geopolitics']);

type LegacyInterestShape = {
  feed?: unknown;
  type?: unknown;
  category?: unknown;
};

/** Infer the explicit lane for rows or API clients created before `feed` existed. */
export function interestFeedOf(interest: LegacyInterestShape): InterestFeed {
  if (interest.feed === 'concerts' || interest.feed === 'trends') return interest.feed;
  return interest.type === 'artist' || interest.category === 'concerts' ? 'concerts' : 'trends';
}

export function normalizeTrendCategory(value: unknown): TrendCategory {
  return typeof value === 'string' && TREND_CATEGORIES.has(value as TrendCategory)
    ? (value as TrendCategory)
    : 'general';
}

export function feedForItemKind(kind: ItemKind): InterestFeed {
  return kind === 'concert' ? 'concerts' : 'trends';
}
