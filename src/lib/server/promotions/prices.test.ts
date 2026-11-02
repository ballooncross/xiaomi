import { expect, it } from 'vitest';
import { analyzeGearPrices, type ShopifyProduct } from './prices';

const product = (handle: string, year: number, price: number, compareAt = price): ShopifyProduct => ({
  handle, title: `${handle.toUpperCase()} SNOWBOARD BOOTS ${year}`, tags: [String(year)],
  variants: [{ price: price.toFixed(2), compare_at_price: compareAt.toFixed(2), available: true }]
});
const thisSeason = Array.from({ length: 10 }, (_, i) => product(`new-${i}`, 2027, 500));
const clearance = Array.from({ length: 6 }, (_, i) => product(`old-${i}`, 2026, 400, 500));

it('ignores past-season clearance and reports a sale only when this season is marked down', () => {
  expect(analyzeGearPrices([...thisSeason, ...clearance])).toEqual({
    offer: null, summary: 'prices: 0/10 2027 boots/bindings marked down, 6 past-season'
  });
  const oneOff = [product('new-0', 2027, 425, 500), ...thisSeason.slice(1)];
  expect(analyzeGearPrices([...oneOff, ...clearance]).offer).toBeNull();
  const sale = [...[0, 1, 2].map((i) => product(`new-${i}`, 2027, 425, 500)), ...thisSeason.slice(3)];
  expect(analyzeGearPrices([...sale, ...clearance]).offer).toEqual({
    evidence: 'Product prices: 2027 season boots / bindings marked down 15% off', discount: 15, scope: 'boots / bindings'
  });
});
