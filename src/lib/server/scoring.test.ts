import { describe, expect, it } from 'vitest';
import { defaultWatchTopics, demoItems } from './seed';
import { scoreItem } from './scoring';

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
