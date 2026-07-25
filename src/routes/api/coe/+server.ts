import { json } from '@sveltejs/kit';
import { COE_RESOURCE_ID, loadCoePayload } from '$lib/server/coe';
import { getDb } from '$lib/server/db';
import type { Env } from '$lib/server/types';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform, url }) => {
	try {
		const db = getDb(platform?.env as Env | undefined);
		const payload = await loadCoePayload(db);
		const forceRefresh = url.searchParams.get('refresh') === '1';
		return json(payload, {
			headers: {
				'Cache-Control': forceRefresh
					? 'private, no-store'
					: 'public, max-age=300, s-maxage=3600'
			}
		});
	} catch (error) {
		return json(
			{
				source: 'LTA · data.gov.sg',
				sourceUrl: `https://data.gov.sg/datasets/${COE_RESOURCE_ID}/view`,
				fetchedAt: new Date().toISOString(),
				latest: null,
				history: [],
				error: String(error)
			},
			{ status: 502 }
		);
	}
};
