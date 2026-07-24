import type { RadarDb } from './db';
import type { Env } from './types';

export type FeatureRole = 'member' | 'admin';

export type FeatureId =
	| 'ica_check'
	| 'coe_page'
	| 'coe_notify'
	| 'gym_page'
	| 'telegram_digest'
	| 'admin_ops'
	| 'dev_requests';

export type FeatureDefinition = {
	id: FeatureId;
	label: string;
	description: string;
	/** Default when no DB row exists. */
	defaultEnabled: boolean;
	/** Default minimum role when no DB row exists. */
	defaultMinRole: FeatureRole;
	/** Stops / skips the matching cron job when disabled. */
	cronJobName?: string;
};

/** Code registry — source of truth for labels; DB stores overrides. */
export const FEATURE_REGISTRY: FeatureDefinition[] = [
	{
		id: 'ica_check',
		label: 'ICA 预约检查',
		description: 'Me 工具里的 ICA 检查与相关定时任务。关闭后隐藏入口并跳过 cron。',
		defaultEnabled: false,
		defaultMinRole: 'admin',
		cronJobName: 'ica-appointment-check'
	},
	{
		id: 'coe_page',
		label: 'COE 报价页',
		description: '导航与页面中的 COE 官方报价。',
		defaultEnabled: true,
		defaultMinRole: 'member'
	},
	{
		id: 'coe_notify',
		label: 'COE 结果通知',
		description: '新一轮 COE 结果的检查 cron；接收人由各用户在「我的」里订阅。',
		defaultEnabled: true,
		defaultMinRole: 'member',
		cronJobName: 'coe-check'
	},
	{
		id: 'gym_page',
		label: '健身动作库',
		description: '健身搜索页。',
		defaultEnabled: true,
		defaultMinRole: 'member'
	},
	{
		id: 'telegram_digest',
		label: 'Telegram 摘要',
		description: '每日趋势摘要与日期提醒（可分开订阅），以及手动发送。',
		defaultEnabled: true,
		defaultMinRole: 'member',
		cronJobName: 'daily-digest'
	},
	{
		id: 'admin_ops',
		label: '运维工具',
		description: '定时任务状态、手动抓取、允许登录邮箱等管理员工具。',
		defaultEnabled: true,
		defaultMinRole: 'admin'
	},
	{
		id: 'dev_requests',
		label: '功能/Bug 请求',
		description: 'Me 里的开发请求面板。',
		defaultEnabled: true,
		defaultMinRole: 'admin'
	}
];

export type FeatureState = {
	id: FeatureId;
	label: string;
	description: string;
	enabled: boolean;
	minRole: FeatureRole;
	cronJobName?: string;
};

export type FeatureAccess = FeatureState & {
	/** Current user may see/use this feature (enabled AND role OK). */
	allowed: boolean;
};

function roleAtLeast(userIsAdmin: boolean, minRole: FeatureRole): boolean {
	if (minRole === 'member') return true;
	return userIsAdmin;
}

export async function listFeatureStates(db: RadarDb): Promise<FeatureState[]> {
	const rows = await db.listFeatureFlags();
	const byId = new Map(rows.map((r) => [r.id, r]));

	return FEATURE_REGISTRY.map((def) => {
		const row = byId.get(def.id);
		return {
			id: def.id,
			label: def.label,
			description: def.description,
			enabled: row ? row.enabled : def.defaultEnabled,
			minRole: row ? row.minRole : def.defaultMinRole,
			cronJobName: def.cronJobName
		};
	});
}

export async function getFeatureAccess(
	db: RadarDb,
	userIsAdmin: boolean
): Promise<Record<FeatureId, FeatureAccess>> {
	const states = await listFeatureStates(db);
	const out = {} as Record<FeatureId, FeatureAccess>;
	for (const state of states) {
		out[state.id] = {
			...state,
			allowed: state.enabled && roleAtLeast(userIsAdmin, state.minRole)
		};
	}
	return out;
}

export async function isFeatureAllowed(
	db: RadarDb,
	featureId: FeatureId,
	userIsAdmin: boolean
): Promise<boolean> {
	const access = await getFeatureAccess(db, userIsAdmin);
	return access[featureId]?.allowed ?? false;
}

export async function isFeatureEnabled(db: RadarDb, featureId: FeatureId): Promise<boolean> {
	const states = await listFeatureStates(db);
	return states.find((s) => s.id === featureId)?.enabled ?? false;
}

/** For cron worker: skip job when its linked feature is disabled. */
export async function isCronJobFeatureEnabled(db: RadarDb, jobName: string): Promise<boolean> {
	const def = FEATURE_REGISTRY.find((f) => f.cronJobName === jobName);
	if (!def) return true;
	return isFeatureEnabled(db, def.id);
}

/** Optional env bootstrap: FEATURE_FLAGS_JSON={"ica_check":{"enabled":true,"minRole":"admin"}} */
export function parseFeatureFlagEnvOverrides(env: Env): Map<string, { enabled?: boolean; minRole?: FeatureRole }> {
	const raw = env.FEATURE_FLAGS_JSON?.trim();
	if (!raw) return new Map();
	try {
		const parsed = JSON.parse(raw) as Record<string, { enabled?: boolean; minRole?: FeatureRole }>;
		return new Map(Object.entries(parsed));
	} catch {
		return new Map();
	}
}
