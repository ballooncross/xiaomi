import { describe, expect, it } from 'vitest';
import {
	addGymRecentSearch,
	MAX_GYM_RECENT_SEARCHES,
	normalizeGymSearchQuery,
	parseGymRecentSearches
} from '$lib/gym-recent-searches';

describe('gym recent searches', () => {
	it('normalizes whitespace and puts a new query first', () => {
		expect(normalizeGymSearchQuery('  dumbbell   curl  ')).toBe('dumbbell curl');
		expect(addGymRecentSearch(['squat'], '  dumbbell   curl  ')).toEqual([
			'dumbbell curl',
			'squat'
		]);
	});

	it('deduplicates case-insensitively and caps the history', () => {
		const existing = Array.from({ length: MAX_GYM_RECENT_SEARCHES }, (_, index) => `search ${index}`);
		expect(addGymRecentSearch(existing, 'SEARCH 2')).toEqual([
			'SEARCH 2',
			'search 0',
			'search 1',
			'search 3',
			'search 4',
			'search 5'
		]);
		expect(addGymRecentSearch(existing, 'new search')).toHaveLength(MAX_GYM_RECENT_SEARCHES);
	});

	it('safely parses stored values and ignores invalid entries', () => {
		expect(parseGymRecentSearches('[" squat ",42,"SQUAT","curl"]')).toEqual([
			'squat',
			'curl'
		]);
		expect(parseGymRecentSearches('{bad json')).toEqual([]);
		expect(parseGymRecentSearches('{"query":"squat"}')).toEqual([]);
	});
});
