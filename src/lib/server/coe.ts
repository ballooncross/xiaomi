/** Official Singapore COE bidding results from LTA via data.gov.sg */

import { formatCoeTelegramMessage, type CoeBiddingRound, type CoeCategory, type CoeCategoryResult, type CoePayload } from '$lib/coe';
import { getDb } from './db';
import { sendTelegramToAdmins } from './telegram';
import type { Env, JobResult } from './types';

export type { CoeBiddingRound, CoeCategory, CoeCategoryResult, CoePayload } from '$lib/coe';
export { formatSgd } from '$lib/coe';

export const COE_RESOURCE_ID = 'd_69b3380ad7e51aff3a7dcc84eba52b8a';
const COE_API_URL = `https://data.gov.sg/api/action/datastore_search?resource_id=${COE_RESOURCE_ID}&limit=10000`;

type RawRecord = {
	month: string;
	bidding_no: string;
	vehicle_class: string;
	quota: string;
	bids_success: string;
	bids_received: string;
	premium: string;
};

const CATEGORY_LABELS: Record<CoeCategory, string> = {
	A: 'Cat A · 小型车',
	B: 'Cat B · 大型车',
	C: 'Cat C · 货车/巴士',
	D: 'Cat D · 电单车',
	E: 'Cat E · 开放'
};

function parseNumber(value: string | number | null | undefined): number {
	if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
	if (!value) return 0;
	const n = Number(String(value).replace(/,/g, '').trim());
	return Number.isFinite(n) ? n : 0;
}

function parseCategory(vehicleClass: string): CoeCategory | null {
	const match = /Category\s*([ABCDE])/i.exec(vehicleClass);
	return match ? (match[1].toUpperCase() as CoeCategory) : null;
}

function roundLabel(month: string, biddingNo: number): string {
	const [year, mon] = month.split('-');
	const monthNum = Number(mon);
	const monthName = Number.isFinite(monthNum)
		? new Date(Date.UTC(2000, monthNum - 1, 1)).toLocaleDateString('en-SG', {
				month: 'short',
				timeZone: 'UTC'
			})
		: month;
	const ordinal = biddingNo === 1 ? '1st' : biddingNo === 2 ? '2nd' : `${biddingNo}th`;
	return `${monthName} ${year} ${ordinal}`;
}

function groupRecords(records: RawRecord[]): CoeBiddingRound[] {
	const byRound = new Map<string, CoeBiddingRound>();

	for (const record of records) {
		const category = parseCategory(record.vehicle_class);
		if (!category) continue;

		const biddingNo = parseNumber(record.bidding_no) || 1;
		const month = record.month.trim();
		const id = `${month}-${biddingNo}`;
		let round = byRound.get(id);
		if (!round) {
			round = {
				id,
				month,
				biddingNo,
				label: roundLabel(month, biddingNo),
				categories: []
			};
			byRound.set(id, round);
		}

		round.categories.push({
			category,
			label: CATEGORY_LABELS[category],
			quota: parseNumber(record.quota),
			bidsSuccess: parseNumber(record.bids_success),
			bidsReceived: parseNumber(record.bids_received),
			premium: parseNumber(record.premium)
		});
	}

	const rounds = [...byRound.values()].map((round) => ({
		...round,
		categories: round.categories.sort((a, b) => a.category.localeCompare(b.category))
	}));

	rounds.sort((a, b) => {
		if (a.month !== b.month) return b.month.localeCompare(a.month);
		return b.biddingNo - a.biddingNo;
	});

	return rounds;
}

export async function fetchCoePayload(fetchImpl: typeof fetch = fetch): Promise<CoePayload> {
	const response = await fetchImpl(COE_API_URL, {
		headers: { Accept: 'application/json' }
	});

	if (!response.ok) {
		throw new Error(`COE API HTTP ${response.status}`);
	}

	const payload = (await response.json()) as {
		success?: boolean;
		result?: { records?: RawRecord[] };
	};

	if (!payload.success || !payload.result?.records) {
		throw new Error('COE API returned an unexpected payload');
	}

	const history = groupRecords(payload.result.records);
	return {
		source: 'LTA · data.gov.sg',
		sourceUrl: `https://data.gov.sg/datasets/${COE_RESOURCE_ID}/view`,
		fetchedAt: new Date().toISOString(),
		latest: history[0] ?? null,
		history
	};
}

/**
 * Lightweight COE poller:
 * - fetches the official latest round
 * - seeds a baseline on first run (no spam)
 * - Telegram-notifies once when a newer round appears
 */
export async function runCoeCheckJob(env: Env): Promise<JobResult> {
	const db = getDb(env);

	try {
		const payload = await fetchCoePayload();
		const latest = payload.latest;
		if (!latest) {
			const detail = 'no latest COE round';
			await db.logJob({ jobName: 'coe-check', status: 'skipped', detail });
			return { inserted: 0, updated: 0, considered: 0, notified: 0, detail };
		}

		if (await db.notificationExists('coe_result', latest.id)) {
			const detail = `already seen ${latest.id}`;
			await db.logJob({ jobName: 'coe-check', status: 'ok', detail });
			return { inserted: 0, updated: 0, considered: 1, notified: 0, detail };
		}

		// First successful poll: remember current latest without notifying.
		if (!(await db.notificationExists('coe_result'))) {
			await db.logNotification({
				itemId: latest.id,
				channel: 'telegram',
				type: 'coe_result',
				status: 'skipped',
				message: `baseline ${latest.label}`
			});
			const detail = `seeded baseline ${latest.id}`;
			await db.logJob({ jobName: 'coe-check', status: 'ok', detail });
			return { inserted: 0, updated: 1, considered: 1, notified: 0, detail };
		}

		const message = formatCoeTelegramMessage(latest, payload.sourceUrl);
		const telegram = await sendTelegramToAdmins(env, message);
		await db.logNotification({
			itemId: latest.id,
			channel: 'telegram',
			type: 'coe_result',
			status: telegram.ok ? 'sent' : 'skipped',
			message
		});
		await db.logJob({
			jobName: 'coe-check',
			status: telegram.ok ? 'ok' : 'skipped',
			detail: telegram.ok
				? `notified admins ${telegram.notified} ${latest.id}`
				: `notify failed ${latest.id}: ${telegram.detail}`
		});

		return {
			inserted: 0,
			updated: 0,
			considered: 1,
			notified: telegram.notified,
			detail: telegram.ok ? `notified admins ${telegram.notified} ${latest.id}` : telegram.detail
		};
	} catch (error) {
		const detail = `coe check failed: ${String(error)}`;
		await db.logJob({ jobName: 'coe-check', status: 'error', detail });
		return { inserted: 0, updated: 0, considered: 0, notified: 0, detail };
	}
}
