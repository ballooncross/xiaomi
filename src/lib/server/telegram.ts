import type { Env } from './types';

export async function sendTelegramMessage(
	env: Env,
	message: string,
	chatId?: string | null
): Promise<{ ok: boolean; detail: string }> {
	if (!env.TELEGRAM_BOT_TOKEN) {
		return { ok: false, detail: 'Telegram bot token is not configured' };
	}

	const target = (chatId || env.TELEGRAM_CHAT_ID || '').trim();
	if (!target) {
		return { ok: false, detail: 'Telegram chat is not configured' };
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

export function telegramDeepLink(botUsername: string, token: string): string {
	const user = botUsername.replace(/^@/, '');
	return `https://t.me/${user}?start=${encodeURIComponent(token)}`;
}

export function isTelegramBotConfigured(env: Env): boolean {
	return Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_BOT_USERNAME);
}
