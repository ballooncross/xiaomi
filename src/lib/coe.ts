export type CoeCategory = 'A' | 'B' | 'C' | 'D' | 'E';

export type CoeCategoryResult = {
	category: CoeCategory;
	label: string;
	quota: number;
	bidsSuccess: number;
	bidsReceived: number;
	premium: number;
};

export type CoeBiddingRound = {
	id: string;
	month: string;
	biddingNo: number;
	label: string;
	categories: CoeCategoryResult[];
};

export type CoePayload = {
	source: string;
	sourceUrl: string;
	fetchedAt: string;
	latest: CoeBiddingRound | null;
	history: CoeBiddingRound[];
};

export function formatSgd(value: number): string {
	const amount = new Intl.NumberFormat('en-SG', {
		maximumFractionDigits: 0
	}).format(value);
	return `S$${amount}`;
}

export function formatCoeTelegramMessage(round: CoeBiddingRound, sourceUrl?: string): string {
	const catA = round.categories.find((c) => c.category === 'A');
	const catB = round.categories.find((c) => c.category === 'B');
	const lines = [
		`新加坡 COE 新结果 · ${round.label}`,
		'',
		catA ? `Cat A：${formatSgd(catA.premium)}` : null,
		catB ? `Cat B：${formatSgd(catB.premium)}` : null,
		'',
		'打开雷达查看完整类别与历史。'
	].filter((line): line is string => line != null);

	if (sourceUrl) {
		lines.push(sourceUrl);
	}

	return lines.join('\n');
}
