import { describe, expect, it } from 'vitest';
import { defaultWatchTopics, demoItems } from './seed';
import { isCrossFeedInterestLeak, isStaleItem, scoreItem } from './scoring';

describe('scoreItem', () => {
  it('prioritizes watched Singapore concerts', () => {
    const scored = scoreItem({ ...demoItems[0], score: 0 }, defaultWatchTopics);
    expect(scored.score).toBeGreaterThanOrEqual(80);
  });

  it('keeps scores capped at 100', () => {
    const scored = scoreItem(
      {
        ...demoItems[0],
        title: 'TWICE Coldplay Eason Chan G.E.M. Singapore concert',
        score: 0
      },
      defaultWatchTopics
    );
    expect(scored.score).toBe(100);
  });

  it('dismisses items that match a blacklist preference', () => {
    const scored = scoreItem(
      {
        ...demoItems[0],
        title: 'Noisy Artist Singapore concert',
        artists: ['Noisy Artist'],
        score: 0,
        status: 'new'
      },
      [
        ...defaultWatchTopics,
        {
          id: 'artist-noisy',
          feed: 'concerts',
          name: 'Noisy Artist',
          aliases: [],
          category: 'general',
          priority: 5,
          mode: 'blacklist',
          enabled: true
        }
      ]
    );

    expect(scored.status).toBe('dismissed');
    expect(scored.score).toBe(0);
  });

  it('does not use concert interests to boost musician news', () => {
    const item = {
      ...demoItems[0],
      kind: 'news' as const,
      sourceType: 'agent',
      title: 'Coldplay shares an entertainment update',
      artists: [],
      topics: ['Coldplay'],
      score: 0
    };

    const scored = scoreItem(item, defaultWatchTopics);
    const baseline = scoreItem(item, defaultWatchTopics.filter((topic) => topic.feed === 'trends'));

    expect(scored.score).toBe(baseline.score);
  });

  it('still uses a same-name trend interest to boost news', () => {
    const item = {
      ...demoItems[0],
      kind: 'news' as const,
      sourceType: 'agent',
      title: 'Coldplay ticketing business changes',
      artists: [],
      topics: ['Coldplay'],
      score: 0
    };
    const trendInterest = {
      ...defaultWatchTopics.find((topic) => topic.name === 'Coldplay')!,
      id: 'trends-coldplay-business',
      feed: 'trends' as const,
      category: 'business' as const
    };

    const scored = scoreItem(item, [...defaultWatchTopics, trendInterest]);

    const concertOnly = scoreItem(item, defaultWatchTopics);
    expect(scored.score).toBeGreaterThan(concertOnly.score);
  });

  it('hides stored musician news unless a trend interest also matches', () => {
    const item = {
      ...demoItems[0],
      kind: 'news' as const,
      title: 'Coldplay celebrity news',
      artists: [],
      topics: ['Coldplay'],
      status: 'new' as const
    };
    const trendInterest = {
      ...defaultWatchTopics.find((topic) => topic.name === 'Coldplay')!,
      id: 'trends-coldplay-business',
      feed: 'trends' as const,
      category: 'business' as const
    };

    expect(isCrossFeedInterestLeak(item, defaultWatchTopics)).toBe(true);
    expect(isCrossFeedInterestLeak(item, [...defaultWatchTopics, trendInterest])).toBe(false);
  });
});

describe('isStaleItem', () => {
  const baseItem = {
    ...demoItems[0],
    kind: 'trend' as const,
    startsAt: undefined
  };

  it('rejects trend items without a publication date', () => {
    expect(isStaleItem({ ...baseItem, publishedAt: undefined, createdAt: new Date().toISOString() })).toBe(true);
  });

  it('rejects trend items older than the maximum age', () => {
    const publishedAt = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString();
    expect(isStaleItem({ ...baseItem, publishedAt })).toBe(true);
  });

  it('keeps recently published trend items', () => {
    const publishedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(isStaleItem({ ...baseItem, publishedAt })).toBe(false);
  });

  it('keeps future events even when they have no publication date', () => {
    const startsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(isStaleItem({ ...baseItem, kind: 'concert', startsAt, publishedAt: undefined })).toBe(false);
  });
});
