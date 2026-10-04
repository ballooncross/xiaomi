import { afterEach, expect, it, vi } from 'vitest';
import { fetchPromotions } from './fetcher';
import type { Env } from '../types';

const html = `<html><title>The Ride Side</title><body>
  <div class="banner"><img src="https://cdn.shopify.com/banner.jpg" width="1600"></div>
  <p>Boots 10% off</p></body></html>`;
afterEach(() => vi.unstubAllGlobals());

it('reads image-only discounts, then reuses the transcription by image bytes', async () => {
  const cache = new Map<string, string>();
  const env: Env = { AI_ENABLED: 'auto', GEMINI_API_KEY: 'fake-test-key', DB: {
    prepare: (sql: string) => ({ bind: (hash: string, text: string) => ({
      first: async () => cache.has(hash) ? { text: cache.get(hash) } : null,
      run: async () => { if (sql.startsWith('INSERT')) cache.set(hash, text); }
    }) })
  } as unknown as D1Database };
  const fetcher = vi.fn(async (url: string | URL | Request) => {
    const target = String(url);
    if (target === 'https://therideside.com/') return new Response(html);
    if (target.startsWith('https://cdn.shopify.com/')) return new Response('image-bytes', { headers: { 'content-type': 'image/jpeg' } });
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ text: 'Early bird preorder 20% off' }) }] } }] });
  });
  vi.stubGlobal('fetch', fetcher);
  expect(await fetchPromotions(env)).toMatchObject({ warning: null, offers: [{ discount: 10 }, { discount: 20 }] });
  await fetchPromotions(env);
  expect(fetcher.mock.calls.filter(([url]) => String(url).includes('googleapis'))).toHaveLength(1);
});
it('reports missing vision configuration as partial coverage while retaining HTML offers', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(url.includes('shopify') ? 'image' : html,
    { headers: { 'content-type': url.includes('shopify') ? 'image/jpeg' : 'text/html' } })));
  const result = await fetchPromotions({ AI_ENABLED: 'false' });
  expect(result.offers).toHaveLength(1);
  expect(result.warning).toContain('requires enabled Gemini');
});
it('fails closed on source errors and challenge pages', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('down', { status: 503 }))
    .mockResolvedValueOnce(new Response('<title>Verify browser</title>')));
  await expect(fetchPromotions({})).rejects.toThrow('503');
  await expect(fetchPromotions({})).rejects.toThrow('Unexpected homepage');
});
it('reports invalid OCR without treating it as no promotion', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === 'https://therideside.com/') return new Response(html);
    if (url.includes('shopify')) return new Response('image', { headers: { 'content-type': 'image/jpeg' } });
    return Response.json({ candidates: [] });
  }));
  expect((await fetchPromotions({ AI_ENABLED: 'auto', GEMINI_API_KEY: 'fake' })).warning).toContain('Invalid banner transcription');
});
