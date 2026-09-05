import { describe, expect, it } from 'vitest';
import type { CoeBiddingRound } from '$lib/coe';
import { coeChartLabelIndexes, coeRoundsForRange } from '$lib/coe-chart';

function round(month: string, biddingNo: number): CoeBiddingRound {
	return { id: `${month}-${biddingNo}`, month, biddingNo, label: `${month} ${biddingNo}`, categories: [] };
}

describe('COE chart helpers', () => {
	it('filters calendar ranges and returns rounds oldest-first', () => {
		const history = [
			round('2026-07', 2),
			round('2026-07', 1),
			round('2026-06', 2),
			round('2026-02', 1),
			round('2026-01', 2)
		];

		expect(coeRoundsForRange(history, 6).map((item) => item.id)).toEqual([
			'2026-02-1',
			'2026-06-2',
			'2026-07-1',
			'2026-07-2'
		]);
		expect(coeRoundsForRange(history, 'all').map((item) => item.id)).toEqual([
			'2026-01-2',
			'2026-02-1',
			'2026-06-2',
			'2026-07-1',
			'2026-07-2'
		]);
	});

	it('samples axis labels while always retaining the newest point', () => {
		expect(coeChartLabelIndexes(0)).toEqual([]);
		expect(coeChartLabelIndexes(3)).toEqual([0, 1, 2]);
		const indexes = coeChartLabelIndexes(40, 7);
		expect(indexes.length).toBeLessThanOrEqual(7);
		expect(indexes.at(-1)).toBe(39);
	});
});
