import { describe, expect, it } from 'vitest';
import { buildTrendPrompt } from './ai/prompts';
import { buildQueries } from './sources';
import { scoreRelevance } from './scoring';
import type { AgentContext } from './types';

const context: AgentContext = {
  watchTopics: [
    {
      id: 'concerts-coldplay',
      feed: 'concerts',
      name: 'Coldplay',
      aliases: [],
      category: 'general',
      priority: 5,
      mode: 'follow',
      enabled: true
    },
    {
      id: 'trends-ai-jobs',
      feed: 'trends',
      name: 'Singapore AI jobs',
      aliases: ['AI product roles Singapore'],
      category: 'career',
      priority: 4,
      mode: 'follow',
      enabled: true
    }
  ],
  recentItems: { titles: [], urls: [], externalIds: [] },
  preferenceSignals: [],
  structuredContext: null,
  engagementSignals: { highEngagement: [], lowEngagement: [] },
  lastContextVersion: 1
};

describe('concert interest isolation', () => {
  it('does not build news-source queries for concert trackers', () => {
    const queries = buildQueries(context, 'full', []);

    expect(queries.some((query) => query.query.includes('Coldplay'))).toBe(false);
    expect(queries.some((query) => query.query.includes('Singapore AI jobs'))).toBe(true);
  });

  it('does not include concert trackers in the AI news prompt', () => {
    const prompt = buildTrendPrompt(context);

    expect(prompt).not.toContain('Coldplay');
    expect(prompt).toContain('Singapore AI jobs');
  });

  it('does not raise news relevance from a concert tracker', () => {
    const item = scoreRelevance(
      {
        source: 'google-news',
        title: 'Coldplay celebrity news',
        summary: 'An entertainment story about the band',
        kind: 'news',
        confidence: 0.4,
        relevanceReason: 'source match',
        topics: [],
        metadata: {}
      },
      context
    );

    expect(item.confidence).toBe(0.4);
    expect(item.topics).not.toContain('Coldplay');
  });
});
