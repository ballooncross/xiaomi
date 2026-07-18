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
