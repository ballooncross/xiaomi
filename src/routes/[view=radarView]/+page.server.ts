import { loadRadarPageData } from '$lib/server/radar-page-load';
import type { Env } from '$lib/server/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, locals }) => {
	return loadRadarPageData(platform?.env as Env | undefined, locals.user ?? null);
};
