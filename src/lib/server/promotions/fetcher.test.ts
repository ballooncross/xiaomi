import { Buffer } from 'node:buffer';
import { afterEach, expect, it, vi } from 'vitest';
import { fetchPromotions } from './fetcher';
import type { Env } from '../types';

const html = `<html><title>The Ride Side</title><body>
  <div class="banner"><img src="https://cdn.shopify.com/banner.jpg" width="1600"></div>
  <p>Boots 10% off</p></body></html>`;
afterEach(() => vi.unstubAllGlobals());

it('uses stored banner text and leaves unread banners for the local agent', async () => {
  const twoBanners = html.replace('</div>', '<img src="https://cdn.shopify.com/sale.jpg" width="1600"></div>');
  const read = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('read-bytes'))).toString('hex');
  const env: Env = { DB: { prepare: () => ({ bind: (hash: string) => ({
    first: async () => hash === read ? { text: 'Early bird preorder 20% off' } : null
  }) }) } as unknown as D1Database };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === 'https://therideside.com/') return new Response(twoBanners);
    if (url.startsWith('https://cdn.shopify.com/')) {
      return new Response(url.includes('banner') ? 'read-bytes' : 'new-bytes', { headers: { 'content-type': 'image/jpeg' } });
    }
    if (url.includes('/products.json')) return Response.json({ products: [] });
    throw new Error(`unexpected request to ${url}`);
  }));
  const result = await fetchPromotions(env);
  expect(result.offers).toMatchObject([{ discount: 10 }, { discount: 20 }]);
  expect(result.unreadImages).toEqual([{ hash: expect.stringMatching(/^[0-9a-f]{64}$/), url: 'https://cdn.shopify.com/sale.jpg?width=1600' }]);
  expect(result.warning).toBe('Waiting for the local agent to read 1 banner image(s)');
});
it('fails closed on source errors and challenge pages', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('down', { status: 503 }))
    .mockResolvedValueOnce(new Response('<title>Verify browser</title>')));
  await expect(fetchPromotions({})).rejects.toThrow('503');
  await expect(fetchPromotions({})).rejects.toThrow('Unexpected homepage');
});
it('refuses redirects with an option the Workers runtime accepts', async () => {
  let homepageStatus = 200;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.redirect === 'error') throw new TypeError('Invalid redirect value, must be one of "follow" or "manual"');
    if (url.includes('shopify')) return new Response(null, { status: 302, headers: { location: 'https://example.com/x.jpg' } });
    return homepageStatus === 200 ? new Response(html) : new Response(null, { status: homepageStatus });
  }));
  const result = await fetchPromotions({});
  expect(result.offers).toHaveLength(1);
  expect(result.warning).toContain('redirected (HTTP 302)');
  homepageStatus = 301;
  await expect(fetchPromotions({})).rejects.toThrow('redirected (HTTP 301)');
});
