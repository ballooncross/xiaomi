import type { Offer } from './parser';

export const GEAR_COLLECTIONS = ['snow-snowboard-boots', 'snow-snowboard-bindings'];

export type ShopifyProduct = {
  handle: string;
  title: string;
  tags: string[];
  variants: { price: string; compare_at_price: string | null; available: boolean }[];
};

const MIN_DISCOUNTED = 3;
const MIN_SHARE = 0.2;

/**
 * A gear sale marks down a share of this season's products on their product
 * pages. Past-season clearance is always discounted, so it never counts.
 */
export function analyzeGearPrices(products: ShopifyProduct[]): { offer: Offer | null; summary: string } {
  const dated = [...new Map(products.map((product) => [product.handle, product])).values()]
    .map((product) => ({ year: modelYear(product), markdown: markdown(product) }));
  const season = Math.max(0, ...dated.map(({ year }) => year ?? 0));
  if (!season) return { offer: null, summary: 'prices: no model years found' };
  const current = dated.filter(({ year }) => year === season);
  const discounted = current.map(({ markdown }) => markdown).filter((pct) => pct > 0);
  const past = dated.filter(({ year, markdown }) => year !== null && year < season && markdown > 0).length;
  const summary = `prices: ${discounted.length}/${current.length} ${season} boots/bindings marked down, ${past} past-season`;
  if (discounted.length < MIN_DISCOUNTED || discounted.length < current.length * MIN_SHARE) return { offer: null, summary };
  const discount = mostCommon(discounted);
  return {
    summary,
    offer: { evidence: `Product prices: ${season} season boots / bindings marked down ${discount}% off`, discount, scope: 'boots / bindings' }
  };
}

function modelYear(product: ShopifyProduct): number | null {
  const years = [...product.title.matchAll(/\b(20\d\d)\b/g)].map((match) => Number(match[1]))
    .concat(product.tags.filter((tag) => /^20\d\d$/.test(tag)).map(Number));
  return years.length ? Math.max(...years) : null;
}

function markdown(product: ShopifyProduct): number {
  return Math.max(0, ...product.variants
    .filter((variant) => variant.available && variant.compare_at_price)
    .map((variant) => Math.round((1 - Number(variant.price) / Number(variant.compare_at_price)) * 100)));
}

function mostCommon(values: number[]): number {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort(([a, countA], [b, countB]) => countB - countA || b - a)[0][0];
}
