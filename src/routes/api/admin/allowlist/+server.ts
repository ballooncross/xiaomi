import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { mergeLocalEnv } from '$lib/server/env';
import { requireAdminUser } from '$lib/server/request-auth';
import { env as privateEnv } from '$env/dynamic/private';
import type { Env } from '$lib/server/types';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform, locals }) => {
	requireAdminUser(locals);
	const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
	const db = getDb(env);
	const emails = await db.listAllowedEmails();
	return json({ emails });
};

export const POST: RequestHandler = async ({ request, platform, locals }) => {
	const admin = requireAdminUser(locals);
	const body = (await request.json().catch(() => ({}))) as { email?: string };
	const email = body.email?.trim().toLowerCase();
	if (!email || !email.includes('@')) {
		return json({ error: 'Valid email is required' }, { status: 400 });
	}

	const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
	const db = getDb(env);
	await db.addAllowedEmail(email, admin.email);
	return json({ ok: true, emails: await db.listAllowedEmails() });
};

export const DELETE: RequestHandler = async ({ request, platform, locals }) => {
	const admin = requireAdminUser(locals);
	const body = (await request.json().catch(() => ({}))) as { email?: string };
	const email = body.email?.trim().toLowerCase();
	if (!email) {
		return json({ error: 'email is required' }, { status: 400 });
	}
	if (email === admin.email.toLowerCase()) {
		return json({ error: 'Cannot remove your own email' }, { status: 400 });
	}

	const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
	const db = getDb(env);
	await db.removeAllowedEmail(email);
	return json({ ok: true, emails: await db.listAllowedEmails() });
};
