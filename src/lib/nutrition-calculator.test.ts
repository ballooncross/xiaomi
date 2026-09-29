import { describe, expect, it } from 'vitest';
import { ACTIVITY_LEVELS, calculateNutrition, type NutritionInput } from './nutrition-calculator';
import { NAV_ITEMS, normalizeMiddleNav } from './navigation';
import { match } from '../params/radarView';

const input: NutritionInput = { age: 30, weight: 70, height: 175, sex: 'male', activity: 'sedentary', goal: 'maintain' };

describe('nutrition calculator', () => {
	it('calculates a known male example and conserves energy across macros', () => {
		const result = calculateNutrition(input)!;
		expect(result.resting).toBe(1648.75);
		expect(result.maintenance).toBe(1978.5);
		expect(result.calories).toBe(1978.5);
		expect(result.protein * 4 + result.fat * 9 + result.carbs * 4).toBeCloseTo(result.calories, 10);
	});
	it('uses the female coefficient and supports fractional measurements', () => {
		expect(calculateNutrition({ ...input, sex: 'female' })!.resting).toBe(1482.75);
		expect(calculateNutrition({ ...input, weight: 70.5, height: 175.5 })!.resting).toBe(1656.875);
	});
	it.each(ACTIVITY_LEVELS)('applies activity factor for $id', ({ id, factor }) => {
		expect(calculateNutrition({ ...input, activity: id })!.maintenance).toBeCloseTo(1648.75 * factor);
	});
	it('adjusts goal calories and all nutrients together', () => {
		const maintain = calculateNutrition(input)!;
		for (const [goal, factor] of [['lose', 0.9], ['gain', 1.1]] as const) {
			const result = calculateNutrition({ ...input, goal })!;
			for (const key of ['calories', 'protein', 'fat', 'carbs'] as const) {
				expect(result[key]).toBeCloseTo(maintain[key] * factor);
			}
		}
	});
	it.each([
		{ age: undefined }, { age: NaN }, { age: 17 }, { age: 101 }, { age: 30.5 },
		{ weight: undefined }, { weight: 0 }, { weight: -1 }, { weight: Infinity }, { weight: 301 },
		{ height: undefined }, { height: NaN }, { height: 99 }, { height: 251 },
		{ activity: '' }, { goal: 'unknown' }
	])('rejects invalid input %j', (invalid) => {
		expect(calculateNutrition({ ...input, ...invalid })).toBeNull();
	});
	it('supports the accepted boundaries with finite positive results', () => {
		for (const values of [{ age: 18, weight: 30, height: 100 }, { age: 100, weight: 300, height: 250 }]) {
			const result = calculateNutrition({ ...input, ...values })!;
			expect(result.calories).toBeGreaterThan(0);
			expect(Number.isFinite(result.calories)).toBe(true);
		}
	});
	it('exposes a routable and persistable navigation option', () => {
		expect(NAV_ITEMS.some((item) => item.id === 'nutrition')).toBe(true);
		expect(match('nutrition')).toBe(true);
		expect(normalizeMiddleNav(['nutrition'])).toEqual(['nutrition']);
	});
});
