import { loadRadarPageData } from '$lib/server/radar-page-load';
import { requireAdminUser } from '$lib/server/request-auth';
import type { Env } from '$lib/server/types';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = ({ platform, locals }) => {
 requireAdminUser(locals);
 return loadRadarPageData(platform?.env as Env | undefined, locals.user ?? null);
};
