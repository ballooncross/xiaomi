import type { RadarItem, WatchTopic } from '../types';

export async function buildTrendSearchItems(topics: WatchTopic[]): Promise<RadarItem[]> {
  const trendTopics = topics.filter((topic) => topic.enabled && topic.type === 'topic' && topic.category !== 'concerts');
  return trendTopics.slice(0, 8).map((topic) => {
    const query = encodeURIComponent(topic.name);
    return {
      id: crypto.randomUUID(),
      sourceId: 'manual-trends',
      sourceType: 'manual',
      externalId: `trend-search-${topic.id}`,
      kind: topic.category === 'business' ? 'opportunity' : 'trend',
      title: topic.name,
      summary: `Daily trend search prepared for ${topic.name}.`,
      description: `Open the source search to review current coverage for ${topic.name}. RSS/API ingestion can be added per source.`,
      url: `https://news.google.com/search?q=${query}`,
      imageUrl: imageForCategory(topic.category),
      topics: [topic.name, topic.category],
      artists: [],
      raw: { query: topic.name },
      score: topic.priority * 12,
      status: 'new'
    } satisfies RadarItem;
  });
}

function imageForCategory(category: string): string {
  if (category === 'career') return '/visuals/career.svg';
  if (category === 'business') return '/visuals/business.svg';
  if (category === 'geopolitics') return '/visuals/geopolitics.svg';
  if (category === 'concerts') return '/visuals/concert.svg';
  return '/visuals/news.svg';
}
