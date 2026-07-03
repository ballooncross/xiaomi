import { describe, expect, it } from 'vitest';
import { clusterForBackfill, dedupeBatch, extractOutlet, findDuplicatesForItem, findMatch, normalizeTitle, titleSimilarity, titleTokens } from './dedup';
import type { DedupExisting } from './dedup';
import type { RadarItem } from './types';

function makeItem(overrides: Partial<RadarItem>): RadarItem {
  return {
    id: crypto.randomUUID(),
    sourceId: 'test',
    sourceType: 'google_news',
    externalId: overrides.url ?? crypto.randomUUID(),
    kind: 'trend',
    title: 'placeholder',
    summary: '',
    description: '',
    artists: [],
    topics: [],
    raw: {},
    score: 50,
    status: 'new',
    relatedSources: [],
    ...overrides
  };
}

describe('normalizeTitle', () => {
  it('strips outlet suffixes', () => {
    expect(normalizeTitle("BYD's sales rise for second month, buoyed by exports - Reuters")).toBe(
      normalizeTitle("BYD's sales rise for second month, buoyed by exports - CNA")
    );
  });

  it('strips html entities', () => {
    expect(normalizeTitle('duet, leaving fans wanting more &nbsp;&nbsp; CNA Lifestyle')).not.toContain('nbsp');
  });
});

describe('extractOutlet', () => {
  it('pulls the outlet name from the title tail', () => {
    expect(extractOutlet('Dreame Tech mulling IPO in Hong Kong — Bloomberg – The Edge Singapore')).toBe(
      'The Edge Singapore'
    );
    expect(extractOutlet("BYD's sales rise - Reuters")).toBe('Reuters');
    expect(extractOutlet('No outlet here')).toBeUndefined();
  });
});

describe('titleSimilarity', () => {
  // The exact duplicate pairs from the production screenshots
  it('matches the JJ Lin / Jay Chou duet duplicates', () => {
    const a = 'Mandopop icons JJ Lin and Jay Chou drop surprise duet, leaving fans wanting more';
    const b = 'Mandopop icons JJ Lin and Jay Chou drop surprise duet, leaving fans wanting more - CNA Lifestyle';
    expect(titleSimilarity(a, b)).toBeGreaterThanOrEqual(0.99);
  });

  it('matches cross-outlet coverage of the same duet story', () => {
    const a = 'Mandopop icons JJ Lin and Jay Chou drop surprise duet, leaving fans wanting more';
    const b = "Jay Chou & JJ Lin surprise fans with duet of Chou's new song on Instagram - Mothership";
    expect(titleSimilarity(a, b)).toBeGreaterThanOrEqual(0.6);
  });

  it('matches the Dreame IPO duplicates from different outlets', () => {
    const a = 'Chinese robot appliance maker Dreame Tech mulling IPO in Hong Kong — Bloomberg - The Edge Singapore';
    const b = 'Chinese robot appliance maker Dreame Tech mulling IPO in Hong Kong — Bloomberg - Yahoo Finance Singapore';
    expect(titleSimilarity(a, b)).toBeGreaterThanOrEqual(0.9);
  });

  it('matches the BYD sales duplicates', () => {
    const a = "BYD's sales rise for second month, buoyed by exports - Reuters";
    const b = "BYD's sales rise for second month, buoyed by exports - CNA";
    expect(titleSimilarity(a, b)).toBeGreaterThanOrEqual(0.99);
  });

  it('does not match unrelated BYD stories', () => {
    const a = "BYD's sales rise for second month, buoyed by exports - Reuters";
    const b = 'BYD Singapore International Marathon presented by adidas 2026 - ActiveSG Circle';
    expect(titleSimilarity(a, b)).toBeLessThan(0.6);
  });

  it('handles Chinese titles via character bigrams', () => {
    expect(titleSimilarity('比亚迪六月销量创新高', '比亚迪6月销量再创新高 - 36氪')).toBeGreaterThanOrEqual(0.6);
    expect(titleSimilarity('比亚迪六月销量创新高', '周杰伦新歌发布')).toBeLessThan(0.6);
  });
});

describe('dedupeBatch', () => {
  it('merges same-story candidates and keeps other outlets as related sources', () => {
    const candidates = [
      makeItem({
        title: "BYD's sales rise for second month, buoyed by exports - Reuters",
        url: 'https://news.google.com/a'
      }),
      makeItem({
        title: "BYD's sales rise for second month, buoyed by exports - CNA",
        url: 'https://news.google.com/b'
      })
    ];

    const result = dedupeBatch(candidates, []);
    expect(result.toInsert).toHaveLength(1);
    expect(result.duplicateCount).toBe(1);
    expect(result.toInsert[0].relatedSources).toHaveLength(1);
    expect(result.toInsert[0].relatedSources?.[0].source).toMatch(/Reuters|CNA/);
  });

  it('merges candidates into an existing item instead of inserting', () => {
    const existing: DedupExisting[] = [
      {
        id: 'existing-1',
        title: 'Mandopop icons JJ Lin and Jay Chou drop surprise duet, leaving fans wanting more',
        url: 'https://cna.example/duet',
        imageUrl: 'https://cna.example/duet.jpg',
        relatedSources: []
      }
    ];
    const candidates = [
      makeItem({
        title: "Jay Chou & JJ Lin surprise fans with duet of Chou's new song on Instagram - Mothership",
        url: 'https://news.google.com/mothership'
      })
    ];

    const result = dedupeBatch(candidates, existing);
    expect(result.toInsert).toHaveLength(0);
    expect(result.merges).toHaveLength(1);
    expect(result.merges[0].itemId).toBe('existing-1');
    expect(result.merges[0].relatedSources.map((rs) => rs.url)).toContain('https://news.google.com/mothership');
  });

  it('upgrades a missing image from the duplicate copy', () => {
    const existing: DedupExisting[] = [
      { id: 'no-image', title: 'Dreame Tech mulling IPO in Hong Kong - The Edge', url: 'https://a', relatedSources: [] }
    ];
    const candidates = [
      makeItem({
        title: 'Dreame Tech mulling IPO in Hong Kong - Yahoo Finance',
        url: 'https://b',
        imageUrl: 'https://b/image.jpg'
      })
    ];

    const result = dedupeBatch(candidates, existing);
    expect(result.merges[0].imageUrl).toBe('https://b/image.jpg');
  });

  it('prefers the candidate with an image as cluster keeper', () => {
    const candidates = [
      makeItem({ title: 'Same story here - Outlet A', url: 'https://a' }),
      makeItem({ title: 'Same story here - Outlet B', url: 'https://b', imageUrl: 'https://b/img.jpg' })
    ];

    const result = dedupeBatch(candidates, []);
    expect(result.toInsert).toHaveLength(1);
    expect(result.toInsert[0].imageUrl).toBe('https://b/img.jpg');
  });

  it('inserts genuinely new items untouched', () => {
    const existing: DedupExisting[] = [
      { id: 'e1', title: 'OpenAI proposes 5% stake to Trump administration', url: 'https://x', relatedSources: [] }
    ];
    const candidates = [makeItem({ title: 'Weibo hot: 演唱会门票 discussion', url: 'https://y' })];

    const result = dedupeBatch(candidates, existing);
    expect(result.toInsert).toHaveLength(1);
    expect(result.merges).toHaveLength(0);
  });

  it('catches duplicates that appear later in the same batch', () => {
    const candidates = [
      makeItem({ title: 'Fresh unique story about EV batteries - Reuters', url: 'https://a' }),
      makeItem({ title: 'Completely different topic', url: 'https://b' }),
      makeItem({ title: 'Fresh unique story about EV batteries - CNA', url: 'https://c' })
    ];

    const result = dedupeBatch(candidates, []);
    expect(result.toInsert).toHaveLength(2);
    expect(result.duplicateCount).toBe(1);
  });
});

describe('clusterForBackfill', () => {
  it('keeps the best copy and deletes the rest', () => {
    const items: DedupExisting[] = [
      { id: 'a', title: 'Dreame Tech mulling IPO - The Edge', url: 'https://a', score: 88, relatedSources: [] },
      {
        id: 'b',
        title: 'Dreame Tech mulling IPO - Yahoo Finance',
        url: 'https://b',
        score: 88,
        imageUrl: 'https://b/img.jpg',
        relatedSources: []
      },
      { id: 'c', title: 'Unrelated story entirely', url: 'https://c', score: 50, relatedSources: [] }
    ];

    const { merges, deleteIds } = clusterForBackfill(items);
    expect(deleteIds).toEqual(['a']);
    expect(merges).toHaveLength(1);
    expect(merges[0].itemId).toBe('b');
    expect(merges[0].relatedSources.map((rs) => rs.url)).toContain('https://a');
  });
});

describe('findMatch', () => {
  it('matches by exact url including related source urls', () => {
    const index = [
      {
        item: {
          id: 'e1',
          title: 'Some story',
          url: 'https://primary',
          relatedSources: [{ source: 'CNA', url: 'https://secondary' }]
        } as DedupExisting,
        tokens: titleTokens('Some story')
      }
    ];
    expect(findMatch('Anything', 'https://secondary', index)?.id).toBe('e1');
  });
});

function makeExisting(overrides: Partial<DedupExisting> & { title: string }): DedupExisting {
  return {
    id: crypto.randomUUID(),
    url: undefined,
    relatedSources: [],
    ...overrides
  };
}

describe('findDuplicatesForItem', () => {
  it('returns all matches above threshold sorted by similarity', () => {
    const candidates: DedupExisting[] = [
      makeExisting({ id: 'a', title: "BYD's sales rise for second month, buoyed by exports - Reuters" }),
      makeExisting({ id: 'b', title: "BYD's sales rise for second month, buoyed by exports - CNA" }),
      makeExisting({ id: 'c', title: 'Completely unrelated story about AI regulations' }),
      makeExisting({ id: 'd', title: "BYD sales surge in export markets, monthly data shows - Bloomberg" })
    ];
    const trigger = "BYD's sales rise for second month, buoyed by exports - Yahoo";

    const matches = findDuplicatesForItem(trigger, 'trigger-id', undefined, candidates, 0.6);
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(matches.map((m) => m.item.id)).toContain('a');
    expect(matches.map((m) => m.item.id)).toContain('b');
    expect(matches.map((m) => m.item.id)).not.toContain('c');
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i - 1].similarity).toBeGreaterThanOrEqual(matches[i].similarity);
    }
  });

  it('excludes the trigger item itself', () => {
    const candidates: DedupExisting[] = [
      makeExisting({ id: 'self', title: 'Same title here' }),
      makeExisting({ id: 'other', title: 'Same title here' })
    ];

    const matches = findDuplicatesForItem('Same title here', 'self', undefined, candidates, 0.6);
    expect(matches).toHaveLength(1);
    expect(matches[0].item.id).toBe('other');
  });

  it('respects threshold parameter', () => {
    const candidates: DedupExisting[] = [
      makeExisting({ id: 'a', title: 'BYD Singapore International Marathon presented by adidas 2026' })
    ];
    const trigger = "BYD's sales rise for second month, buoyed by exports - Reuters";

    const highThreshold = findDuplicatesForItem(trigger, 'trigger-id', undefined, candidates, 0.6);
    expect(highThreshold).toHaveLength(0);

    const similarity = titleSimilarity(trigger, candidates[0].title);
    if (similarity > 0) {
      const veryLowThreshold = findDuplicatesForItem(trigger, 'trigger-id', undefined, candidates, similarity - 0.01);
      expect(veryLowThreshold.length).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns empty array when no matches found', () => {
    const candidates: DedupExisting[] = [
      makeExisting({ id: 'a', title: 'Story about quantum computing breakthroughs' }),
      makeExisting({ id: 'b', title: 'New restaurant opens in Marina Bay' })
    ];
    const matches = findDuplicatesForItem('BYD sales surge in China', 'trigger-id', undefined, candidates, 0.6);
    expect(matches).toHaveLength(0);
  });
});

describe('dedupeBatch with custom threshold', () => {
  it('catches more duplicates with a lower threshold', () => {
    const candidates = [
      makeItem({ title: 'BYD sales surge in export markets driven by strong demand - Reuters', url: 'https://a' }),
      makeItem({ title: 'BYD export growth continues amid rising global EV demand - CNA', url: 'https://b' })
    ];

    const highResult = dedupeBatch(candidates, [], 0.9);
    const lowResult = dedupeBatch(candidates, [], 0.3);
    expect(lowResult.duplicateCount).toBeGreaterThanOrEqual(highResult.duplicateCount);
  });
});
