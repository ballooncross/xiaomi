import type { Env, RadarItem, WatchTopic } from '../types';

type BandsintownEvent = {
  id: string;
  url?: string;
  datetime?: string;
  title?: string;
  description?: string;
  venue?: {
    name?: string;
    city?: string;
    country?: string;
  };
  lineup?: string[];
};

export async function fetchBandsintownConcerts(env: Env, topics: WatchTopic[]): Promise<RadarItem[]> {
  const appId = env.BANDSINTOWN_APP_ID || 'personal-radar';
  const artists = topics.filter((topic) => topic.enabled && topic.type === 'artist' && topic.mode !== 'blacklist').slice(0, 18);
  const results = await Promise.all(artists.map((artist) => fetchArtistEvents(appId, artist.name)));
  return results.flat();
}

async function fetchArtistEvents(appId: string, artistName: string): Promise<RadarItem[]> {
  const url = `https://rest.bandsintown.com/artists/${encodeURIComponent(artistName)}/events?app_id=${encodeURIComponent(appId)}&date=upcoming`;
  const response = await fetch(url);
  if (!response.ok) return [];

  const events = (await response.json()) as BandsintownEvent[];
  return events
    .filter((event) => {
      const country = event.venue?.country?.toLowerCase() ?? '';
      const city = event.venue?.city?.toLowerCase() ?? '';
      return country.includes('singapore') || city.includes('singapore');
    })
    .map((event) => ({
      id: crypto.randomUUID(),
      sourceId: 'bandsintown-artists',
      sourceType: 'bandsintown',
      externalId: event.id,
      kind: 'concert',
      title: event.title || `${artistName} in Singapore`,
      summary: `${artistName} event at ${event.venue?.name ?? 'Singapore venue'}`,
      description: event.description || `${artistName} matched your Bandsintown artist watch.`,
      url: event.url,
      location: [event.venue?.name, event.venue?.city, event.venue?.country].filter(Boolean).join(', '),
      startsAt: event.datetime,
      artists: event.lineup?.length ? event.lineup : [artistName],
      topics: ['Singapore concerts'],
      raw: event,
      score: 0,
      status: 'new'
    }));
}
