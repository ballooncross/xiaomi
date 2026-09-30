import { env as privateEnv } from '$env/dynamic/private';
import { getDb } from '$lib/server/db';
import { mergeLocalEnv } from '$lib/server/env';
import { isFeatureAllowed } from '$lib/server/features';
import type { Env } from '$lib/server/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
	return { gymAllowed: await isFeatureAllowed(getDb(env), 'gym_page', null) };
};
