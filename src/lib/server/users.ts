import { getDb, type RadarDb } from '$lib/server/db';
import { starterWatchTopics } from '$lib/server/seed';
import type { Env } from '$lib/server/types';

export type AppUser = {
	id: string;
	email: string;
	name: string;
	picture: string;
	isAdmin: boolean;
};

export function parseEmailList(raw?: string): string[] {
	if (!raw) return [];
	return raw
		.split(',')
		.map((e) => e.trim().toLowerCase())
		.filter(Boolean);
}

export function isAdminEmail(email: string, env: Env): boolean {
	const admins = parseEmailList(env.ADMIN_EMAILS);
	return admins.includes(email.trim().toLowerCase());
}

export async function isEmailAllowed(db: RadarDb, email: string, env: Env): Promise<boolean> {
	const normalized = email.trim().toLowerCase();
	const fromDb = await db.listAllowedEmails();
	if (fromDb.length > 0) {
		return fromDb.some((e) => e.toLowerCase() === normalized);
	}
	// Bootstrap: empty allowlist table → fall back to env ALLOWED_EMAILS or admins
	const envAllowed = parseEmailList(env.ALLOWED_EMAILS);
	if (envAllowed.length > 0) return envAllowed.includes(normalized);
	return parseEmailList(env.ADMIN_EMAILS).includes(normalized);
}

export async function ensureUser(
	db: RadarDb,
	profile: { email: string; name: string; picture: string },
	env: Env
): Promise<AppUser> {
	const email = profile.email.trim().toLowerCase();
	const existing = await db.getUserByEmail(email);
	if (existing) {
		await db.updateUserProfile(existing.id, profile.name, profile.picture);
		return {
			id: existing.id,
			email: existing.email,
			name: profile.name || existing.name,
			picture: profile.picture || existing.picture,
			isAdmin: isAdminEmail(email, env)
		};
	}

	const id = `user-${crypto.randomUUID()}`;
	await db.createUser({ id, email, name: profile.name, picture: profile.picture });
	await seedStarterPack(db, id);
	return {
		id,
		email,
		name: profile.name,
		picture: profile.picture,
		isAdmin: isAdminEmail(email, env)
	};
}

async function seedStarterPack(db: RadarDb, userId: string): Promise<void> {
	for (const topic of starterWatchTopics) {
		await db.upsertTopicForUser(userId, { ...topic });
	}
}

export function userDb(env: Env | undefined, userId: string): RadarDb {
	return getDb(env, userId);
}

/** Resolve the first ADMIN_EMAILS account for shared digests until per-user Telegram exists. */
export async function getDigestOwnerUserId(db: RadarDb, env: Env): Promise<string | undefined> {
	const adminEmail = parseEmailList(env.ADMIN_EMAILS)[0];
	if (!adminEmail) return undefined;
	const user = await db.getUserByEmail(adminEmail);
	return user?.id;
}

/** DB scoped to the primary admin — used by local agent + digests in Phase 1. */
export async function getAdminScopedDb(env: Env): Promise<RadarDb> {
	const base = getDb(env);
	const ownerId = await getDigestOwnerUserId(base, env);
	return getDb(env, ownerId);
}
