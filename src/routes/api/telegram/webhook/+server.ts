import { json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { getDb } from '$lib/server/db';
import { mergeLocalEnv } from '$lib/server/env';
import { configureTelegramCommands, sendTelegramMessage } from '$lib/server/telegram';
import { isFeatureEnabled } from '$lib/server/features';
import {
	addTrackedPackage,
	listTrackedPackages,
	removeTrackedPackage,
	renderPackageList,
	renderPackageTelegramUpdate
} from '$lib/server/package-tracking/service';
import { getPackageTrackingByNumber, markPackageNotificationsSent } from '$lib/server/package-tracking/repository';
import { normalizeTrackingNumber } from '$lib/server/package-tracking/domain';
import { parsePackageBotCommand } from '$lib/server/package-tracking/telegram-commands';
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
	await configureTelegramCommands(env).catch((error) => {
		console.error(JSON.stringify({
			message: 'telegram command menu configuration failed',
			error: error instanceof Error ? error.message : String(error)
		}));
	});
	const startMatch = text.match(/^\/start(?:@\w+)?(?:\s+(.+))?$/i);
	if (!startMatch) return handlePackageCommand(env, db, String(chatId), text);

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
		'已连接 Personal Radar。趋势摘要、日期提醒与包裹更新会发到这里；可在网页「我的」里调整订阅或断开连接。',
		String(chatId)
	);
	return json({ ok: true });
};

async function handlePackageCommand(
	env: Env,
	db: ReturnType<typeof getDb>,
	chatId: string,
	text: string
) {
	const command = parsePackageBotCommand(text);
	if (command.type === 'unknown') return json({ ok: true });
	const userId = await db.getUserIdByTelegramChatId(chatId);
	if (!userId) {
		await sendTelegramMessage(env, '请先在 Personal Radar「我的」里连接这个 Telegram 账号。', chatId);
		return json({ ok: true });
	}
	if (!(await isFeatureEnabled(db, 'package_tracking'))) {
		await sendTelegramMessage(env, '包裹跟踪目前已停用。', chatId);
		return json({ ok: true });
	}

	if (command.type === 'help') {
		await sendTelegramMessage(env, packageHelp(), chatId);
		return json({ ok: true });
	}
	if (command.type === 'packages') {
		await sendTelegramMessage(env, renderPackageList(await listTrackedPackages(env, userId)), chatId);
		return json({ ok: true });
	}
	if (!('trackingNumber' in command) || !command.trackingNumber) {
		await sendTelegramMessage(
			env,
			command.type === 'track' ? '请输入：/track TRACKING_NUMBER' : '请输入：/untrack TRACKING_NUMBER',
			chatId
		);
		return json({ ok: true });
	}

	try {
		const trackingNumber = normalizeTrackingNumber(command.trackingNumber);
		if (command.type === 'untrack') {
			const existing = await getPackageTrackingByNumber(env, userId, trackingNumber);
			if (!existing) {
				await sendTelegramMessage(env, `没有找到包裹 ${trackingNumber}。`, chatId);
				return json({ ok: true });
			}
			await removeTrackedPackage(env, userId, existing.id);
			await sendTelegramMessage(env, `已停止跟踪并删除 ${trackingNumber}。`, chatId);
			return json({ ok: true });
		}

		const result = await addTrackedPackage(env, userId, trackingNumber);
		const prefix = result.created ? '已添加包裹。' : '这个包裹已经在跟踪中。';
		const message = `${prefix}\n\n${renderPackageTelegramUpdate([result.item])}`;
		const sent = await sendTelegramMessage(env, message, chatId);
		if (sent.ok && (result.item.events?.length ?? 0) > 0) {
			await markPackageNotificationsSent(env, userId, [result.item.id]);
		}
	} catch (error) {
		await sendTelegramMessage(env, error instanceof Error ? error.message : '无法处理这个跟踪单号。', chatId);
	}
	return json({ ok: true });
}

function packageHelp(): string {
	return [
		'包裹跟踪命令',
		'',
		'/track TRACKING_NUMBER · 添加一个包裹',
		'/untrack TRACKING_NUMBER · 删除一个包裹及其历史',
		'/packages · 查看正在跟踪的包裹',
		'/help · 查看这份帮助'
	].join('\n');
}
