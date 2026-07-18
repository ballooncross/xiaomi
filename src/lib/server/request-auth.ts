import { error } from '@sveltejs/kit';
import type { AppUser } from '$lib/server/users';

export function requireSessionUser(locals: App.Locals): AppUser {
	if (!locals.user?.id) {
		throw error(401, 'Sign in required');
	}
	return locals.user as AppUser;
}

export function requireAdminUser(locals: App.Locals): AppUser {
	const user = requireSessionUser(locals);
	if (!user.isAdmin) {
		throw error(403, 'Admin only');
	}
	return user;
}

/** Admin session or shared ADMIN_TOKEN header (for cron/agent/scripts). */
export function isAdminAuthorized(
	locals: App.Locals,
	request: Request,
	adminToken: string | undefined
): boolean {
	if (locals.user?.isAdmin) return true;
	if (!adminToken) return false;
	return request.headers.get('x-admin-token') === adminToken;
}
