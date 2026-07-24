import { json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { getDb } from '$lib/server/db';
import { mergeLocalEnv } from '$lib/server/env';
import { sendTelegramMessage } from '$lib/server/telegram';
import type { Env } from '$lib/server/types';
import type { RequestHandler } from './$types';

type TelegramUpdate = {
	message?: {
		chat?: { id?: number | string };
		text?: string;
	};
};

export const POST: RequestHandler = async ({ request, platform }) => {
	const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);

	if (env.TELEGRAM_WEBHOOK_SECRET) {
		const header = request.headers.get('x-telegram-bot-api-secret-token');
		if (header !== env.TELEGRAM_WEBHOOK_SECRET) {
			return json({ ok: false }, { status: 401 });
		}
	}

	const update = (await request.json().catch(() => ({}))) as TelegramUpdate;
	const text = update.message?.text?.trim() ?? '';
	const chatId = update.message?.chat?.id;
	if (!text || chatId == null) {
		return json({ ok: true });
	}

	const db = getDb(env);
	const startMatch = text.match(/^\/start(?:@\w+)?(?:\s+(.+))?$/i);
	if (!startMatch) {
		return json({ ok: true });
	}

	const token = (startMatch[1] ?? '').trim();
	if (!token) {
		await sendTelegramMessage(
			env,
			'打开 Personal Radar → 我的 → 连接 Telegram，使用那里的链接完成绑定。',
			String(chatId)
		);
		return json({ ok: true });
	}

	const userId = await db.consumeTelegramLinkToken(token);
	if (!userId) {
		await sendTelegramMessage(env, '链接已失效或无效，请回到 Personal Radar 重新生成。', String(chatId));
		return json({ ok: true });
	}

	await db.setUserTelegramChatId(userId, String(chatId));
	await sendTelegramMessage(
		env,
		'已连接 Personal Radar。趋势摘要与日期提醒会分开发到这里；可在网页「我的」里调整订阅或断开连接。',
		String(chatId)
	);
	return json({ ok: true });
};
