import { Buffer } from 'node:buffer';
import { PROMOTION_URL } from '$lib/promotions';
import type { Env } from '../types';
import { MAX_BANNER_IMAGES, extractOffers, homepageContent } from './parser';
import { GEAR_COLLECTIONS, analyzeGearPrices, type ShopifyProduct } from './prices';

const USER_AGENT = 'PersonalRadar/1.0 (daily promotion watch)';

async function readBounded(response: Response, limit: number): Promise<Uint8Array> {
  if (!response.ok) throw new Error(`Source HTTP ${response.status}`);
  if (!response.body) throw new Error('Empty source response');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new Error('Source response exceeds size limit');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

// Workers reject redirect: 'error', so refuse redirects by status instead.
async function fetchWithoutRedirect(url: string, init: RequestInit): Promise<Response> {
  const response = await fetch(url, { ...init, redirect: 'manual' });
  if (response.status >= 300 && response.status < 400) throw new Error(`Source redirected (HTTP ${response.status})`);
  return response;
}

export type UnreadImage = { hash: string; url: string };

async function fetchGearProducts(): Promise<ShopifyProduct[]> {
  const products: ShopifyProduct[] = [];
  for (const collection of GEAR_COLLECTIONS) {
    const response = await fetchWithoutRedirect(`${PROMOTION_URL}collections/${collection}/products.json?limit=250`, {
      signal: AbortSignal.timeout(20000),
      headers: { accept: 'application/json', 'user-agent': USER_AGENT }
    });
    const data = JSON.parse(new TextDecoder().decode(await readBounded(response, 5_000_000))) as { products?: ShopifyProduct[] };
    if (!Array.isArray(data.products)) throw new Error(`Unexpected ${collection} product data`);
    products.push(...data.products);
  }
  return products;
}

export async function fetchPromotions(env: Env) {
  const response = await fetchWithoutRedirect(PROMOTION_URL, {
    signal: AbortSignal.timeout(20000),
    headers: { accept: 'text/html', 'user-agent': USER_AGENT }
  });
  const html = new TextDecoder().decode(await readBounded(response, 5_000_000));
  const { blocks, images, truncatedImages } = homepageContent(html);
  const warnings: string[] = [];
  const unreadImages: UnreadImage[] = [];
  if (truncatedImages) warnings.push(`Banner limit reached; only the first ${MAX_BANNER_IMAGES} images were read`);
  if (!images.length) warnings.push('No banner images identified; image-only offers may be missed');
  for (const url of images) {
    try {
      const image = await fetchWithoutRedirect(url, { signal: AbortSignal.timeout(15000) });
      const mimeType = image.headers.get('content-type')?.split(';')[0];
      if (!mimeType || !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) throw new Error('Unsupported banner format');
      const bytes = await readBounded(image, 4_000_000);
      const hash = Buffer.from(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)).toString('hex');
      const cached = await env.DB?.prepare('SELECT text FROM promotion_image_text WHERE hash = ?').bind(hash).first<{ text: string }>();
      if (cached) blocks.push(cached.text);
      else unreadImages.push({ hash, url });
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : 'Banner reading failed');
    }
  }
  if (unreadImages.length) warnings.push(`Waiting for the local agent to read ${unreadImages.length} banner image(s)`);
  const offers = extractOffers(blocks);
  let priceSummary: string | null = null;
  try {
    const prices = analyzeGearPrices(await fetchGearProducts());
    priceSummary = prices.summary;
    if (prices.offer) offers.push(prices.offer);
  } catch (error) {
    warnings.push(`Price check failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
  return { offers, warning: [...new Set(warnings)].join('; ') || null, unreadImages, priceSummary };
}
