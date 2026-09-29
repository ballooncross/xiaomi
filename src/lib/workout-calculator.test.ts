import { describe, expect, it } from 'vitest';
import { calculateWorkoutVolume } from './workout-calculator';

describe('workout volume', () => {
	it('calculates total reps and volume including fractional loads', () => {
		expect(calculateWorkoutVolume(3, 10, 20)).toEqual({ totalReps: 30, volume: 600 });
		expect(calculateWorkoutVolume(4, 8, 12.5)).toEqual({ totalReps: 32, volume: 400 });
	});
	it('supports zero external weight', () => {
		expect(calculateWorkoutVolume(3, 10, 0)).toEqual({ totalReps: 30, volume: 0 });
	});
	it.each([
		[undefined, 10, 20], [3, undefined, 20], [3, 10, undefined],
		[0, 10, 20], [3, -1, 20], [1.5, 10, 20], [3, 2.5, 20],
		[3, 10, -1], [NaN, 10, 20], [3, Infinity, 20], [3, 10, Infinity],
		[Number.MAX_SAFE_INTEGER, 2, 1], [2, 2, Number.MAX_VALUE]
	])('rejects invalid or overflowing inputs (%s, %s, %s)', (sets, reps, weight) => {
		expect(calculateWorkoutVolume(sets, reps, weight)).toBeNull();
	});
});
