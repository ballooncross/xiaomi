import { load } from 'cheerio';
import { todayInSingapore } from '../lunar';
import { PROMOTION_URL } from '$lib/promotions';

export type Offer = { evidence: string; discount: number; scope: string };
const clean = (text: string) => text.replace(/\s+/g, ' ').trim();

// Keep evidence local to one banner/card: a footer discount must never inherit
// "boots" from an unrelated navigation link.
export function homepageContent(html: string): { blocks: string[]; images: string[]; truncatedImages: boolean } {
  const $ = load(html);
  if (!$('body').length || !/ride\s*side/i.test($('title').text() + $('body').text())) {
    throw new Error('Unexpected homepage content (possibly a challenge page)');
  }
  $('script, style, noscript, nav, footer, [hidden]').remove();
  const blocks = new Set<string>();
  $('p, h1, h2, h3, h4, a, [class*="announcement"], [class*="banner"], [class*="slide"], section').each((_, el) => {
    const text = clean($(el).text());
    if (text.length > 0 && text.length <= 700) blocks.add(text);
  });
  const images = new Set<string>();
  $('[data-bgset], [data-background-image]').each((_, el) => {
    const src = $(el).attr('data-bgset')?.trim().split(/[ ,]/)[0] || $(el).attr('data-background-image');
    if (src) $(el).append($('<img>').attr('src', src).attr('width', '1600'));
  });
  $('img').each((_, el) => {
    const img = $(el);
    if (img.closest('.t4s-product, .product-card, .product-item, [data-product-id]').length) return;
    const alt = clean(img.attr('alt') || '');
    if (alt) blocks.add(alt);
    const src = img.attr('data-src') || img.attr('src') || img.attr('data-srcset')?.split(/[ ,]/)[0];
    if (!src || /\/products\//i.test(src)) return;
    const width = Number(img.attr('width') || 0);
    const banner = img.closest('[class*="banner"], [class*="slide"], [class*="hero"]').length > 0;
    if (!banner && width < 700 && !/banner|slider|homepage|early.?bird|promo/i.test(src)) return;
    try {
      const url = new URL(src.replace(/\{width\}/g, '1600'), PROMOTION_URL);
      if (url.protocol !== 'https:' || !['therideside.com', 'cdn.shopify.com'].includes(url.hostname)) return;
      url.searchParams.set('width', '1600');
      images.add(url.href);
    } catch { /* Ignore malformed image URLs. */ }
  });
  return { blocks: [...blocks], images: [...images].slice(0, 6), truncatedImages: images.size > 6 };
}

export function extractOffers(blocks: string[], now = new Date()): Offer[] {
  const found = new Map<string, Offer>();
  for (const raw of blocks) {
    const evidence = clean(raw);
    if (!evidence || evidence.length > 700 || /\b(expired|ended|sold out|out of stock)\b/i.test(evidence)) continue;
    if (hasExpiredDeadline(evidence, now)) continue;
    const discounts = [...evidence.matchAll(/\b(\d{1,2}(?:\.\d+)?)\s*%\s*(?:off|discount|savings?)\b|\b(?:save|discount(?:\s+of)?)\s*(\d{1,2}(?:\.\d+)?)\s*%/gi)]
      .map((match) => Number(match[1] || match[2])).filter((value) => value > 0 && value < 100);
    if (!discounts.length) continue;
    // Mixed discounts need manual reading: do not attach the largest percentage
    // (e.g. jackets 50%, boots 5%) to the desired gear.
    if (new Set(discounts).size > 1) continue;
    const gear = /\b(boots?|bindings?)\b/i.test(evidence);
    const storewide = /\b(site[ -]?wide|store[ -]?wide|everything|all (?:items|orders|gear|products))\b/i.test(evidence);
    const seasonal = /\b(early[ -]?bird|pre[ -]?orders?|black friday|seasonal)\b/i.test(evidence);
    if (!gear && !storewide && !seasonal) continue;
    if (!gear && !storewide && /\b(jackets?|helmets?|goggles?|apparel|snowboards?)\b/i.test(evidence)) continue;
    if (/\b(?:exclud\w*|except|not (?:valid|applicable)(?: on| for)?)\s+(?:\w+\s+){0,3}(?:boots?|bindings?)\b/i.test(evidence)) continue;
    const scope = gear ? 'boots / bindings' : storewide ? 'storewide — check exclusions' : 'seasonal — gear eligibility unconfirmed';
    found.set(evidence.toLowerCase(), { evidence, discount: discounts[0], scope });
  }
  // Prefer complete enclosing text over duplicated child headings.
  return [...found.values()].filter((offer, _, all) => !all.some((other) =>
    other !== offer && other.evidence.toLowerCase().includes(offer.evidence.toLowerCase())
  ));
}

export async function fingerprint(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(clean(text).toLowerCase());
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Homepage observation is not publication evidence. Explicit elapsed deadlines
// are ignored even if the retailer leaves the banner on its homepage.
export function hasExpiredDeadline(text: string, now: Date): boolean {
  const today = todayInSingapore(now).toISOString().slice(0, 10);
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const deadline = text.match(/(?:until|ends?|ending|valid (?:through|till|until)|expires?)\s*(?:on\s*)?[: ]*(\d{4}-\d{2}-\d{2}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+(?:\s+\d{4})?|[A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?)/i)?.[1];
  if (!deadline) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return deadline < today;
  const parts = deadline.toLowerCase().replace(/(\d)(st|nd|rd|th)/g, '$1').replace(',', '').split(/\s+/);
  const month = months.indexOf((/^\d/.test(parts[0]) ? parts[1] : parts[0]).slice(0, 3));
  const day = Number(/^\d/.test(parts[0]) ? parts[0] : parts[1]);
  if (month < 0 || day < 1 || day > 31) return false;
  const year = parts[2] || today.slice(0, 4);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` < today;
}
