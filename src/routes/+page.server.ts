import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** Home lives at /home under the shared [view] shell to avoid remounting the app. */
export const load: PageServerLoad = async () => {
	redirect(302, '/home');
};
