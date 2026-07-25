import { describe, expect, it } from 'vitest';
import { formatCoeTelegramMessage, formatSgd } from '$lib/coe';
import { fetchCoePayload, loadCoePayload } from './coe';

describe('coe helpers', () => {
	it('formats SGD without cents', () => {
		expect(formatSgd(129000)).toBe('S$129,000');
		expect(formatSgd(10201)).toBe('S$10,201');
	});

	it('formats a concise Telegram alert for Cat A/B', () => {
		const message = formatCoeTelegramMessage(
			{
				id: '2026-07-1',
				month: '2026-07',
				biddingNo: 1,
				label: 'Jul 2026 1st',
				categories: [
					{
						category: 'A',
						label: 'Cat A · 小型车',
						quota: 1244,
						bidsSuccess: 1207,
						bidsReceived: 1879,
						premium: 129000
					},
					{
						category: 'B',
						label: 'Cat B · 大型车',
						quota: 867,
						bidsSuccess: 863,
						bidsReceived: 1500,
						premium: 130889
					}
				]
			},
			'https://data.gov.sg/example'
		);

		expect(message).toContain('Jul 2026 1st');
		expect(message).toContain('Cat A：S$129,000');
		expect(message).toContain('Cat B：S$130,889');
		expect(message).toContain('https://data.gov.sg/example');
	});

	it('groups bidding rounds and sorts latest first', async () => {
		const fetchImpl = async () =>
			new Response(
				JSON.stringify({
					success: true,
					result: {
						records: [
							{
								month: '2026-06',
								bidding_no: '2',
								vehicle_class: 'Category A',
								quota: '1,251',
								bids_success: '1,245',
								bids_received: '1,768',
								premium: '123847'
							},
							{
								month: '2026-06',
								bidding_no: '2',
								vehicle_class: 'Category B',
								quota: '883',
								bids_success: '879',
								bids_received: '1,202',
								premium: '123502'
							},
							{
								month: '2026-07',
								bidding_no: '1',
								vehicle_class: 'Category A',
								quota: '1244',
								bids_success: '1207',
								bids_received: '1879',
								premium: '129000'
							},
							{
								month: '2026-07',
								bidding_no: '1',
								vehicle_class: 'Category B',
								quota: '867',
								bids_success: '863',
								bids_received: '1500',
								premium: '130889'
							}
						]
					}
				})
			);

		const payload = await fetchCoePayload(fetchImpl as typeof fetch);
		expect(payload.latest?.id).toBe('2026-07-1');
		expect(payload.latest?.categories.map((c) => c.category)).toEqual(['A', 'B']);
		expect(payload.latest?.categories[0]?.premium).toBe(129000);
		expect(payload.history).toHaveLength(2);
		expect(payload.history[1]?.id).toBe('2026-06-2');
	});

	it('backfills full history into an empty store', async () => {
		const saved: string[] = [];
		const updateModes: boolean[] = [];
		let requestedUrl = '';
		const store = {
			listCoeRounds: async () => [],
			upsertCoeRounds: async (
				rounds: Array<{ id: string }>,
				_sourceUpdatedAt?: string,
				updateExisting = false
			) => {
				saved.push(...rounds.map((round) => round.id));
				updateModes.push(updateExisting);
			}
		};
		const fetchImpl = async (input: RequestInfo | URL) => {
			requestedUrl = String(input);
			return new Response(
				JSON.stringify({
					success: true,
					result: {
						records: [
							{
								month: '2026-07',
								bidding_no: '2',
								vehicle_class: 'Category A',
								quota: '1245',
								bids_success: '1237',
								bids_received: '1590',
								premium: '126000'
							}
						]
					}
				})
			);
		};

		const payload = await loadCoePayload(store, fetchImpl as typeof fetch);
		expect(requestedUrl).toContain('limit=10000');
		expect(saved).toEqual(['2026-07-2']);
		expect(updateModes).toEqual([false]);
		expect(payload.latest?.id).toBe('2026-07-2');
	});

	it('fetches only the latest records when history already exists', async () => {
		const storedRound = {
			id: '2026-07-1',
			month: '2026-07',
			biddingNo: 1,
			label: 'Jul 2026 1st',
			categories: [
				{
					category: 'A' as const,
					label: 'Cat A · 小型车',
					quota: 1244,
					bidsSuccess: 1207,
					bidsReceived: 1879,
					premium: 129000
				}
			]
		};
		const saved: string[] = [];
		const updateModes: boolean[] = [];
		let requestedUrl = '';
		const store = {
			listCoeRounds: async () => [storedRound],
			upsertCoeRounds: async (
				rounds: Array<{ id: string }>,
				_sourceUpdatedAt?: string,
				updateExisting = false
			) => {
				saved.push(...rounds.map((round) => round.id));
				updateModes.push(updateExisting);
			}
		};
		const fetchImpl = async (input: RequestInfo | URL) => {
			requestedUrl = String(input);
			return new Response(
				JSON.stringify({
					success: true,
					result: {
						records: [
							{
								month: '2026-07',
								bidding_no: '2',
								vehicle_class: 'Category A',
								quota: '1245',
								bids_success: '1237',
								bids_received: '1590',
								premium: '126000'
							}
						]
					}
				})
			);
		};

		const payload = await loadCoePayload(store, fetchImpl as typeof fetch);
		expect(requestedUrl).toContain('limit=10');
		expect(requestedUrl).not.toContain('limit=10000');
		expect(saved).toEqual(['2026-07-2']);
		expect(updateModes).toEqual([true]);
		expect(payload.history.map((round) => round.id)).toEqual(['2026-07-2', '2026-07-1']);
	});

	it('falls back to stored history when the latest API request fails', async () => {
		const storedRound = {
			id: '2026-07-1',
			month: '2026-07',
			biddingNo: 1,
			label: 'Jul 2026 1st',
			categories: []
		};
		const store = {
			listCoeRounds: async () => [storedRound],
			upsertCoeRounds: async () => {}
		};
		const fetchImpl = async () => new Response('unavailable', { status: 503 });

		const payload = await loadCoePayload(store, fetchImpl as typeof fetch);
		expect(payload.stale).toBe(true);
		expect(payload.latest?.id).toBe('2026-07-1');
	});
});
