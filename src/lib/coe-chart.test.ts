import { describe, expect, it } from 'vitest';
import type { CoeBiddingRound } from '$lib/coe';
import { coeChartLabelIndexes, coeChartNearestIndex, coeChartTooltipPlacement, coeRoundsForRange } from '$lib/coe-chart';

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

describe('COE chart tooltip helpers', () => {
	it('snaps a pointer position to the nearest round and clamps to the plot', () => {
		expect(coeChartNearestIndex(50, 72, 672, 0)).toBeNull();
		expect(coeChartNearestIndex(500, 72, 672, 1)).toBe(0);
		expect(coeChartNearestIndex(72, 72, 672, 7)).toBe(0);
		expect(coeChartNearestIndex(672, 72, 672, 7)).toBe(6);
		expect(coeChartNearestIndex(372, 72, 672, 7)).toBe(3);
		expect(coeChartNearestIndex(10, 72, 672, 7)).toBe(0);
		expect(coeChartNearestIndex(5000, 72, 672, 7)).toBe(6);
		expect(coeChartNearestIndex(Number.NaN, 72, 672, 7)).toBeNull();
	});

	it('flips the tooltip away from the chart edges and the top', () => {
		expect(coeChartTooltipPlacement(400, 200, 800)).toEqual({ horizontal: 'center', vertical: 'above' });
		expect(coeChartTooltipPlacement(80, 200, 800)).toEqual({ horizontal: 'left', vertical: 'above' });
		expect(coeChartTooltipPlacement(760, 200, 800)).toEqual({ horizontal: 'right', vertical: 'above' });
		expect(coeChartTooltipPlacement(400, 40, 800)).toEqual({ horizontal: 'center', vertical: 'below' });
	});
});
