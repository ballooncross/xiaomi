import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTIFY_PREFS, mergeNotifyPrefs, parseNotifyPrefs } from './notify-prefs';

describe('notify prefs', () => {
	it('defaults digest on and COE off', () => {
		expect(DEFAULT_NOTIFY_PREFS).toEqual({
			digestTrends: true,
			digestDates: true,
			coe: false
		});
		expect(parseNotifyPrefs({})).toEqual(DEFAULT_NOTIFY_PREFS);
		expect(parseNotifyPrefs('')).toEqual(DEFAULT_NOTIFY_PREFS);
	});

	it('parses JSON strings and ignores junk fields', () => {
		expect(
			parseNotifyPrefs(
				JSON.stringify({ digestTrends: false, digestDates: true, coe: true, extra: 1 })
			)
		).toEqual({
			digestTrends: false,
			digestDates: true,
			coe: true
		});
	});

	it('merges partial patches', () => {
		expect(mergeNotifyPrefs(DEFAULT_NOTIFY_PREFS, { coe: true })).toEqual({
			digestTrends: true,
			digestDates: true,
			coe: true
		});
	});
});
