import { json } from '@sveltejs/kit';
import { fetchCoePayload } from '$lib/server/coe';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		const payload = await fetchCoePayload();
		return json(payload, {
			headers: {
				'Cache-Control': 'public, max-age=300, s-maxage=3600'
			}
		});
	} catch (error) {
		return json(
			{
				source: 'LTA · data.gov.sg',
				sourceUrl: 'https://data.gov.sg/datasets/d_69b3380ad7e51aff3a7dcc84eba52b8a/view',
				fetchedAt: new Date().toISOString(),
				latest: null,
				history: [],
				error: String(error)
			},
			{ status: 502 }
		);
	}
};
