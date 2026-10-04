import { describe, expect, it } from 'vitest';
import { extractOffers, fingerprint, homepageContent } from './parser';
const now = new Date('2026-10-04T00:00:00Z');

describe('Ride Side homepage promotions', () => {
  it('finds early-bird and gear promotions without assuming November exists', () => {
    expect(extractOffers(['Early bird pre-order: 10% off', 'Save 20% on boots and bindings', 'November new arrivals'], now))
      .toEqual([
        { evidence: 'Early bird pre-order: 10% off', discount: 10, scope: 'seasonal — gear eligibility unconfirmed' },
        { evidence: 'Save 20% on boots and bindings', discount: 20, scope: 'boots / bindings' }
      ]);
  });
  it('rejects unrelated, excluded, ambiguous, expired and non-discount numbers', () => {
    expect(extractOffers([
      '50% off jackets', '100% comfort boots', '10% off storewide excluding boots and bindings',
      'Boots 5% off, jackets 50% off', '20% off boots — expired',
      'Early bird 10% off ends 30 September 2026', 'Boots 10% off until 2026-10-03',
      'Bindings 10% off ends September 30', 'Bindings 10% off ends 30th September'
    ], now)).toEqual([]);
    expect(extractOffers(['Boots 10% off until 4 October 2026'], now)).toHaveLength(1);
  });
  it('isolates banners from navigation, scripts and footer and reads lazy Shopify images', () => {
    const page = homepageContent(`<html><title>The Ride Side</title><body>
      <nav>Boots Bindings</nav><footer>50% off</footer><script>"Boots 50% off"</script>
      <section class="announcement">Early bird <b>10% off</b> preorders</section>
      <section><p>50% off helmets</p></section>
      <div data-bgset="//therideside.com/cdn/shop/files/hero.jpg 1600w"></div>
      <img src="//cdn.shopify.com/banner.jpg" alt="Boots 20% off" width="1600">
      <img src="https://evil.test/banner.jpg" width="1600">
      <img src="//cdn.shopify.com/products/boot.jpg" width="1600">
      </body></html>`);
    expect(extractOffers(page.blocks, now).map((offer) => offer.discount)).toEqual([10, 20]);
    expect(page.images).toHaveLength(2);
    expect(page.images.every((url) => url.startsWith('https://'))).toBe(true);
    expect(() => homepageContent('<title>Just a moment</title>Verify you are human')).toThrow();
  });
  it('deduplicates enclosing text and stable case/whitespace changes', async () => {
    expect(extractOffers(['Boots 10% off', 'Boots 10% off', 'Boots 10% off — code EARLY'], now)).toHaveLength(1);
    expect(await fingerprint('BOOTS  10% off')).toBe(await fingerprint('boots 10% OFF'));
  });
});
