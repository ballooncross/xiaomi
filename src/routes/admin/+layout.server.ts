import { requireAdminUser } from '$lib/server/request-auth';
import type { LayoutServerLoad } from './$types';
export const load: LayoutServerLoad = ({ locals, setHeaders }) => {
 requireAdminUser(locals);
 setHeaders({ 'cache-control': 'private, no-store' });
};
