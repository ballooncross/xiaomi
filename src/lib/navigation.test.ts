import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, RADAR_VIEW_IDS, FEATURE_GROUPS, VIEW_PATHS, normalizeMiddleNav } from './navigation';

describe('navigation configuration', () => {
	it('accepts every configurable navigation item', () => {
		const viewIds = new Set<string>(RADAR_VIEW_IDS);

		for (const item of NAV_ITEMS) {
			expect(viewIds.has(item.id)).toBe(true);
			expect(normalizeMiddleNav([item.id], { fallbackToDefault: false })).toEqual([item.id]);
		}
	});

	it('deduplicates entries, rejects unknown entries, and limits the middle navigation to three items', () => {
		expect(
			normalizeMiddleNav(
				['packages', 'unknown', 'packages', 'coe', 'settings', 'me'],
				{ fallbackToDefault: false }
			)
		).toEqual(['packages', 'coe', 'settings']);
	});
});


it('keeps the directory complete without duplicating personal destinations', () => {
 const ids = FEATURE_GROUPS.flatMap((group) => [...group.ids]);
 expect(new Set(ids).size).toBe(ids.length);
 for (const id of [...NAV_ITEMS.map((item) => item.id), 'saved']) expect(ids).toContain(id);
 for (const id of ids) expect(VIEW_PATHS[id]).toBe(`/${id}`);
});
