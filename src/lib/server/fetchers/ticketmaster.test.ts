import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchTicketmasterConcerts } from './ticketmaster';
import type { WatchTopic } from '../types';

const baseTopic: WatchTopic = {
  id: 'artist-test',
  type: 'artist',
  name: 'Test Artist',
  aliases: [],
  category: 'concerts',
  priority: 5,
  mode: 'follow',
  enabled: true
};

describe('fetchTicketmasterConcerts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches broad Singapore music discovery even without artist follows', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        _embedded: {
          events: [
            {
              id: 'popular-1',
              name: 'Popular Singapore Music Night',
              url: 'https://example.com/popular',
              dates: { start: { dateTime: '2026-08-01T12:00:00Z' } },
              _embedded: {
                venues: [{ name: 'Singapore Indoor Stadium', city: { name: 'Singapore' }, country: { countryCode: 'SG' } }],
                attractions: [{ name: 'Popular Artist' }]
              }
            }
          ]
        }
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    const items = await fetchTicketmasterConcerts({ TICKETMASTER_API_KEY: 'test' }, []);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('keyword=');
    expect(items).toHaveLength(1);
    expect(items[0].sourceId).toBe('ticketmaster-sg-popular');
    expect(items[0].topics).toContain('popular discovery');
  });

  it('filters broad discovery items that match blacklist preferences', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          _embedded: {
            events: [
              {
                id: 'blocked-1',
                name: 'Blocked Artist Singapore',
                _embedded: {
                  venues: [{ name: 'Capitol Theatre', city: { name: 'Singapore' }, country: { countryCode: 'SG' } }],
                  attractions: [{ name: 'Blocked Artist' }]
                }
              }
            ]
          }
        })
      })
    );

    const items = await fetchTicketmasterConcerts(
      { TICKETMASTER_API_KEY: 'test' },
      [{ ...baseTopic, id: 'artist-blocked', name: 'Blocked Artist', mode: 'blacklist' }]
    );

    expect(items).toHaveLength(0);
  });
});
