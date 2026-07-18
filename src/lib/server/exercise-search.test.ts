import { describe, expect, it } from 'vitest';
import { levenshtein, rankExercises, tokenize, type Searchable } from './exercise-search';

const ex = (name: string, target = 'chest', equipment = 'barbell'): Searchable => ({
	name,
	bodyPart: 'chest',
	equipment,
	target,
	secondaryMuscles: ['triceps', 'shoulders']
});

const dataset: Searchable[] = [
	ex('barbell bench press'),
	ex('dumbbell bench press', 'chest', 'dumbbell'),
	ex('barbell incline bench press'),
	ex('barbell squat', 'quads'),
	ex('cable crossover', 'chest', 'cable'),
	ex('push-up', 'chest', 'body weight')
];

function topName(query: string): string | undefined {
	return rankExercises(query, dataset, 5)[0]?.name;
}

describe('exercise fuzzy search', () => {
	it('tokenizes on non-alphanumeric boundaries', () => {
		expect(tokenize('Barbell Bench-Press!')).toEqual(['barbell', 'bench', 'press']);
	});

	it('matches exact phrase', () => {
		expect(topName('barbell bench press')).toBe('barbell bench press');
	});

	it('is word-order independent', () => {
		for (const q of ['bench barbell press', 'press bench barbell', 'bench press barbell']) {
			expect(topName(q)).toBe('barbell bench press');
		}
	});

	it('supports subset queries', () => {
		const results = rankExercises('barbell press', dataset, 5).map((r) => r.name);
		expect(results).toContain('barbell bench press');
		expect(results).toContain('barbell incline bench press');
		// "barbell squat" has no "press" word, so it must be excluded
		expect(results).not.toContain('barbell squat');
	});

	it('tolerates typos via edit distance', () => {
		expect(topName('bench barbbbell press')).toBe('barbell bench press');
		expect(topName('barbel bench pres')).toBe('barbell bench press');
	});

	it('computes edit distance correctly', () => {
		expect(levenshtein('barbell', 'barbbbell')).toBe(2);
		expect(levenshtein('press', 'pres')).toBe(1);
		expect(levenshtein('abc', 'abc')).toBe(0);
	});

	it('returns alphabetical list for empty query', () => {
		const names = rankExercises('', dataset, 3).map((r) => r.name);
		expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
	});
});
