import { getDb } from './db';
import type { NotifyChannel } from '$lib/notify-prefs';
import { parseEmailList } from './users';
import type { Env } from './types';

/** Send to one chat. Requires an explicit chat id (no shared global fallback). */
export async function sendTelegramMessage(
	env: Env,
	message: string,
	chatId: string
): Promise<{ ok: boolean; detail: string }> {
	if (!env.TELEGRAM_BOT_TOKEN) {
		return { ok: false, detail: 'Telegram bot token is not configured' };
	}

	const target = chatId.trim();
	if (!target) {
		return { ok: false, detail: 'Telegram chat id is missing' };
	}

	const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			chat_id: target,
			text: message,
			disable_web_page_preview: true
		})
	});

	if (!response.ok) {
		return { ok: false, detail: `Telegram HTTP ${response.status}: ${await response.text()}` };
	}

	return { ok: true, detail: 'sent' };
}

/** Shared-feature alerts (e.g. COE) → users who opted in and linked Telegram. */
export async function sendTelegramToSubscribers(
	env: Env,
	message: string,
	channel: NotifyChannel
): Promise<{ ok: boolean; detail: string; notified: number }> {
	if (!env.TELEGRAM_BOT_TOKEN) {
		return { ok: false, detail: 'Telegram bot token is not configured', notified: 0 };
	}

	const db = getDb(env);
	const linked = await db.listUsersWithTelegram();
	const subscribers = [];
	for (const user of linked) {
		const prefs = await db.getNotifyPrefs(user.id);
		if (prefs[channel]) subscribers.push(user);
	}

	// Until someone opts in, keep ops continuity for linked admins (pre-subscription era).
	let targets = subscribers;
	let mode = 'subscribers';
	if (targets.length === 0) {
		const adminEmails = new Set(parseEmailList(env.ADMIN_EMAILS));
		targets = linked.filter((u) => adminEmails.has(u.email.toLowerCase()));
		mode = 'admin-fallback';
	}

	if (targets.length === 0) {
		return {
			ok: false,
			detail: `No ${channel} subscribers (and no admin Telegram fallback)`,
			notified: 0
		};
	}

	let notified = 0;
	const details: string[] = [];
	for (const user of targets) {
		const result = await sendTelegramMessage(env, message, user.telegramChatId);
		if (result.ok) notified += 1;
		details.push(`${user.email}:${result.detail}`);
	}

	return {
		ok: notified > 0,
		detail: `${mode} ${details.join('; ')}`,
		notified
	};
}

/** Ops alerts (ICA / extension) → every ADMIN_EMAILS account that has linked Telegram. */
export async function sendTelegramToAdmins(
	env: Env,
	message: string
): Promise<{ ok: boolean; detail: string; notified: number }> {
	if (!env.TELEGRAM_BOT_TOKEN) {
		return { ok: false, detail: 'Telegram bot token is not configured', notified: 0 };
	}

	const adminEmails = new Set(parseEmailList(env.ADMIN_EMAILS));
	if (adminEmails.size === 0) {
		return { ok: false, detail: 'ADMIN_EMAILS is not configured', notified: 0 };
	}

	const linked = await getDb(env).listUsersWithTelegram();
	const targets = linked.filter((u) => adminEmails.has(u.email.toLowerCase()));
	if (targets.length === 0) {
		return {
			ok: false,
			detail: 'No admin has linked Telegram yet (Me → 连接 Telegram)',
			notified: 0
		};
	}

	let notified = 0;
	const details: string[] = [];
	for (const user of targets) {
		const result = await sendTelegramMessage(env, message, user.telegramChatId);
		if (result.ok) notified += 1;
		details.push(`${user.email}:${result.detail}`);
	}

	return { ok: notified > 0, detail: details.join('; '), notified };
}

/** Normalize BotFather username: "xiaomiRadarBot", not "t.me/..." or "@...". */
export function normalizeTelegramBotUsername(raw: string): string {
	return raw
		.trim()
		.replace(/^https?:\/\//i, '')
		.replace(/^t\.me\//i, '')
		.replace(/^telegram\.me\//i, '')
		.replace(/^@/, '')
		.split(/[/?#]/)[0]
		.trim();
}

export function telegramDeepLink(botUsername: string, token: string): string {
	const user = normalizeTelegramBotUsername(botUsername);
	return `https://t.me/${user}?start=${encodeURIComponent(token)}`;
}

export function isTelegramBotConfigured(env: Env): boolean {
	return Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_BOT_USERNAME && normalizeTelegramBotUsername(env.TELEGRAM_BOT_USERNAME));
}
