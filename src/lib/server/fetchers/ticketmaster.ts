import type { Env, RadarItem, WatchTopic } from '../types';

type TicketmasterEvent = {
  id: string;
  name: string;
  url?: string;
  images?: Array<{ url: string; width?: number }>;
  dates?: { start?: { dateTime?: string; localDate?: string } };
  _embedded?: {
    venues?: Array<{ name?: string; city?: { name?: string }; country?: { name?: string; countryCode?: string } }>;
    attractions?: Array<{ name?: string }>;
  };
};

export async function fetchTicketmasterConcerts(env: Env, topics: WatchTopic[]): Promise<RadarItem[]> {
  if (!env.TICKETMASTER_API_KEY) return [];

  const artistTopics = topics.filter((topic) => topic.enabled && topic.type === 'artist' && topic.mode !== 'blacklist');
  const blacklist = topics.filter((topic) => topic.enabled && topic.mode === 'blacklist');
  const artistResults = await Promise.all(artistTopics.slice(0, 12).map((topic) => fetchTicketmasterQuery(env, topic.name, 'artist')));
  const popularResults = await fetchTicketmasterQuery(env, undefined, 'popular');
  return [...popularResults, ...artistResults.flat()].filter((item) => !matchesAnyBlacklist(item, blacklist));
}

async function fetchTicketmasterQuery(env: Env, keyword: string | undefined, mode: 'artist' | 'popular'): Promise<RadarItem[]> {
  const params = new URLSearchParams({
    apikey: env.TICKETMASTER_API_KEY ?? '',
    countryCode: 'SG',
    classificationName: 'music',
    size: mode === 'popular' ? '40' : '20',
    sort: 'date,asc'
  });
  if (keyword) params.set('keyword', keyword);

  const response = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?${params}`);
  if (!response.ok) return [];

  const data = (await response.json()) as { _embedded?: { events?: TicketmasterEvent[] } };
  return (data._embedded?.events ?? []).map((event) => {
    const venue = event._embedded?.venues?.[0];
    const artists = (event._embedded?.attractions ?? []).map((attraction) => attraction.name).filter(Boolean) as string[];
    const image = [...(event.images ?? [])].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url;

    return {
      id: crypto.randomUUID(),
      sourceId: mode === 'popular' ? 'ticketmaster-sg-popular' : 'ticketmaster-sg-music',
      sourceType: 'ticketmaster',
      externalId: event.id,
      kind: 'concert',
      title: event.name,
      summary: `${event.name} at ${venue?.name ?? 'Singapore venue'}`,
      description:
        mode === 'popular'
          ? `${event.name} was discovered from the broad Ticketmaster Singapore music feed.`
          : `${event.name} matched your artist watch on Ticketmaster Singapore.`,
      url: event.url,
      imageUrl: image,
      location: [venue?.name, venue?.city?.name, venue?.country?.countryCode].filter(Boolean).join(', '),
      startsAt: event.dates?.start?.dateTime ?? event.dates?.start?.localDate,
      artists,
      topics: mode === 'popular' ? ['Singapore concerts', 'popular discovery'] : ['Singapore concerts'],
      raw: event,
      score: 0,
      status: 'new'
    } satisfies RadarItem;
  });
}

function matchesAnyBlacklist(item: RadarItem, blacklist: WatchTopic[]): boolean {
  if (blacklist.length === 0) return false;
  const haystack = [item.title, item.summary, item.description, item.location, ...item.artists, ...item.topics]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return blacklist.some((topic) =>
    [topic.name, ...topic.aliases]
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
      .some((name) => haystack.includes(name))
  );
}
