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
