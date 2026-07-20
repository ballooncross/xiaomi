import { getDb } from '$lib/server/db';
import { env as privateEnv } from '$env/dynamic/private';
import { mergeLocalEnv } from '$lib/server/env';
import { getFeatureAccess, type FeatureAccess, type FeatureId } from '$lib/server/features';
import { getIcaToolStatus } from '$lib/server/ica-tool';
import { getCronJobStatuses } from '$lib/server/job-status';
import { sortReminders } from '$lib/server/lunar';
import type { Env } from '$lib/server/types';

export async function loadRadarPageData(
	platformEnv: Env | undefined,
	user?: { id: string; email: string; name: string; picture: string; isAdmin: boolean } | null
) {
	const env = mergeLocalEnv(platformEnv, privateEnv);
	const emptyIca: Awaited<ReturnType<typeof getIcaToolStatus>> = {
		enabled: false,
		targetBefore: env.ICA_TARGET_BEFORE || '2026-07-01',
		checkerUrlConfigured: false,
		fallbackConfigured: false
	};
	const db = getDb(env, user?.id);
	const features = await getFeatureAccess(db, Boolean(user?.isAdmin));

	const showAdminOps = features.admin_ops?.allowed ?? false;
	const showIca = features.ica_check?.allowed ?? false;

	const [items, savedItems, topics, reminders, icaTool, cronJobs, middleNav, telegramChatId] =
		await Promise.all([
			db.listItems(80),
			db.listSavedItems(),
			db.listTopics(),
			db.listReminders(),
			showIca ? getIcaToolStatus(env) : Promise.resolve(emptyIca),
			showAdminOps ? getCronJobStatuses(env) : Promise.resolve([]),
			user?.id ? db.getMiddleNav(user.id) : Promise.resolve(null),
			user?.id ? db.getUserTelegramChatId(user.id) : Promise.resolve(null)
		]);

	const telegramBotConfigured = Boolean(env?.TELEGRAM_BOT_TOKEN && env?.TELEGRAM_BOT_USERNAME);

	return {
		items,
		savedItems,
		topics,
		reminders: sortReminders(reminders).map((reminder) => ({ ...reminder, note: '' })),
		icaTool,
		cronJobs,
		aiEnabled: (env?.AI_ENABLED ?? 'auto') !== 'false',
		telegramConfigured: telegramBotConfigured,
		telegramBotConfigured,
		telegramLinked: Boolean(telegramChatId),
		features,
		user: user
			? {
					id: user.id,
					email: user.email,
					name: user.name,
					picture: user.picture,
					isAdmin: user.isAdmin
				}
			: null,
		middleNav
	};
}

export type RadarPageData = Awaited<ReturnType<typeof loadRadarPageData>>;

export type PageFeatures = Record<FeatureId, FeatureAccess>;
