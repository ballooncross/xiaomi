import { describe, expect, it } from 'vitest';
import { defaultWatchTopics, demoItems } from './seed';
import { isStaleItem, scoreItem } from './scoring';

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
          type: 'artist',
          name: 'Noisy Artist',
          aliases: [],
          category: 'concerts',
          priority: 5,
          mode: 'blacklist',
          enabled: true
        }
      ]
    );

    expect(scored.status).toBe('dismissed');
    expect(scored.score).toBe(0);
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
