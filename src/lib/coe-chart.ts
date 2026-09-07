import type { CoeBiddingRound } from '$lib/coe';

export type CoeChartRange = 6 | 12 | 36 | 'all';

function monthIndex(month: string): number | null {
	const match = /^(\d{4})-(\d{2})$/.exec(month);
	if (!match) return null;
	const year = Number(match[1]);
	const monthNumber = Number(match[2]);
	if (!Number.isInteger(year) || monthNumber < 1 || monthNumber > 12) return null;
	return year * 12 + monthNumber - 1;
}

/** Returns rounds oldest-first so they can be plotted directly on a time axis. */
export function coeRoundsForRange(
	history: CoeBiddingRound[],
	range: CoeChartRange
): CoeBiddingRound[] {
	if (range === 'all' || history.length === 0) return [...history].reverse();

	const newestMonth = monthIndex(history[0]?.month ?? '');
	if (newestMonth == null) return history.slice(0, range * 2).reverse();

	const firstMonth = newestMonth - range + 1;
	return history
		.filter((round) => {
			const value = monthIndex(round.month);
			return value != null && value >= firstMonth && value <= newestMonth;
		})
		.reverse();
}

export function coeChartLabelIndexes(pointCount: number, maxLabels = 7): number[] {
	if (pointCount <= 0) return [];
	if (pointCount === 1) return [0];
	const interval = Math.max(1, Math.ceil((pointCount - 1) / (maxLabels - 1)));
	const indexes: number[] = [];
	for (let index = 0; index < pointCount - 1; index += interval) indexes.push(index);
	indexes.push(pointCount - 1);
	return indexes;
}

/**
 * Maps a horizontal position inside the plot to the nearest data point index.
 * Positions outside the plot snap to the first or last point.
 */
export function coeChartNearestIndex(
	x: number,
	plotLeft: number,
	plotRight: number,
	pointCount: number
): number | null {
	if (pointCount <= 0 || !Number.isFinite(x)) return null;
	if (pointCount === 1 || plotRight <= plotLeft) return 0;
	const ratio = (x - plotLeft) / (plotRight - plotLeft);
	const index = Math.round(ratio * (pointCount - 1));
	return Math.min(pointCount - 1, Math.max(0, index));
}

export type CoeChartTooltipPlacement = {
	horizontal: 'center' | 'left' | 'right';
	vertical: 'above' | 'below';
};

/** Keeps the tooltip inside the chart near the edges and top. */
export function coeChartTooltipPlacement(
	x: number,
	y: number,
	chartWidth: number,
	edgeMargin = 120,
	topMargin = 96
): CoeChartTooltipPlacement {
	return {
		horizontal: x < edgeMargin ? 'left' : x > chartWidth - edgeMargin ? 'right' : 'center',
		vertical: y < topMargin ? 'below' : 'above'
	};
}
