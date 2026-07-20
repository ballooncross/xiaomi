import { json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { getDb } from '$lib/server/db';
import { mergeLocalEnv } from '$lib/server/env';
import { requireSessionUser } from '$lib/server/request-auth';
import { isTelegramBotConfigured, telegramDeepLink } from '$lib/server/telegram';
import type { Env } from '$lib/server/types';
import type { RequestHandler } from './$types';

const LINK_TTL_MS = 15 * 60 * 1000;

export const GET: RequestHandler = async ({ platform, locals }) => {
	const user = requireSessionUser(locals);
	const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
	const db = getDb(env);
	const chatId = await db.getUserTelegramChatId(user.id);
	return json({
		linked: Boolean(chatId),
		botConfigured: isTelegramBotConfigured(env),
		botUsername: env.TELEGRAM_BOT_USERNAME ?? null
	});
};

export const POST: RequestHandler = async ({ platform, locals }) => {
	const user = requireSessionUser(locals);
	const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
	if (!isTelegramBotConfigured(env)) {
		return json({ error: 'Telegram bot is not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_BOT_USERNAME).' }, { status: 400 });
	}

	const token = crypto.randomUUID().replace(/-/g, '');
	const expiresAt = new Date(Date.now() + LINK_TTL_MS).toISOString();
	const db = getDb(env);
	await db.createTelegramLinkToken(user.id, token, expiresAt);

	const deepLink = telegramDeepLink(env.TELEGRAM_BOT_USERNAME!, token);
	return json({ ok: true, token, deepLink, expiresAt });
};

export const DELETE: RequestHandler = async ({ platform, locals }) => {
	const user = requireSessionUser(locals);
	const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
	await getDb(env).setUserTelegramChatId(user.id, null);
	return json({ ok: true, linked: false });
};
