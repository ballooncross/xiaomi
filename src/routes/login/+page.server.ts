import { getGoogleAuthUrl } from '$lib/server/auth';
import { mergeLocalEnv } from '$lib/server/env';
import { env as privateEnv } from '$env/dynamic/private';
import type { Env } from '$lib/server/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, platform }) => {
	const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);

	const clientId = env.GOOGLE_CLIENT_ID;
	const origin = url.origin;
	const redirectUri = `${origin}/auth/callback`;

	return {
		googleAuthUrl: clientId ? getGoogleAuthUrl(clientId, redirectUri) : null,
		error: url.searchParams.get('error'),
		authConfigured: Boolean(clientId)
	};
};
