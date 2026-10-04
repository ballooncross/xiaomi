export const RADAR_VIEW_IDS = [
	'home',
	'explore',
	'notifications',
	'concerts',
	'trends',
	'dates',
	'packages',
	'promotions',
	'gym',
	'nutrition',
	'coe',
	'interests',
	'me',
	'settings',
	'saved'
] as const;

export type RadarView = (typeof RADAR_VIEW_IDS)[number];

export const NAV_ITEMS = [
	{ id: 'concerts', label: '演出' },
	{ id: 'trends', label: '趋势' },
	{ id: 'dates', label: '日期' },
	{ id: 'promotions', label: '促销' },
	{ id: 'packages', label: '包裹' },
	{ id: 'gym', label: '健身' },
	{ id: 'nutrition', label: '营养' },
	{ id: 'coe', label: 'COE' },
	{ id: 'interests', label: '兴趣' },
	{ id: 'me', label: '我的' },
	{ id: 'settings', label: '设置' },
	{ id: 'notifications', label: '通知' }
] as const satisfies ReadonlyArray<{ id: RadarView; label: string }>;

export type NavSlotId = (typeof NAV_ITEMS)[number]['id'];

export const DEFAULT_MIDDLE_NAV: NavSlotId[] = ['concerts', 'dates', 'gym'];

const NAV_SLOT_IDS = new Set<string>(NAV_ITEMS.map((item) => item.id));

export function normalizeMiddleNav(
	value: unknown,
	options?: { fallbackToDefault?: boolean }
): NavSlotId[] {
	const ids = Array.isArray(value)
		? value.filter((item): item is NavSlotId => typeof item === 'string' && NAV_SLOT_IDS.has(item))
		: [];
	const unique = [...new Set(ids)].slice(0, 3);
	if (unique.length === 0 && options?.fallbackToDefault !== false) {
		return [...DEFAULT_MIDDLE_NAV];
	}
	return unique;
}

export const VIEW_PATHS: Record<RadarView, string> = Object.fromEntries(
	RADAR_VIEW_IDS.map((id) => [id, `/${id}`])
) as Record<RadarView, string>;

export const FEATURE_GROUPS = [
	{ label: '发现与关注', ids: ['concerts', 'trends', 'interests', 'saved'] },
	{ label: '生活工具', ids: ['dates', 'promotions', 'packages', 'coe', 'gym', 'nutrition'] },
	{ label: '个人与偏好', ids: ['me', 'notifications', 'settings'] }
] as const;

export const FEATURE_DESCRIPTIONS: Partial<Record<RadarView, string>> = {
	concerts: '演出动态与开票提醒', trends: '职业、商业与生活信号',
	interests: '关注主题与屏蔽规则', saved: '收藏与重点跟踪', dates: '生日、纪念日与提醒',
	promotions: 'The Ride Side 雪鞋与固定器折扣',
	packages: '物流状态与历史', coe: '新加坡官方报价', gym: '训练计划与动作搜索',
	nutrition: '营养与热量计算', me: '账号资料与个人入口', notifications: 'Telegram 连接与推送偏好',
	settings: '自定义常用导航'
};

export const ADMIN_PAGES = [
	{ id: 'monitoring', label: '任务监控', hint: '定时任务、本地 Agent 与手动运行', feature: 'admin_ops' },
	{ id: 'performance', label: '使用监控 / 统计', hint: '访问量、功能使用与每日趋势' },
	{ id: 'requests', label: '开发请求', hint: '提交需求、查看进度与结果', feature: 'dev_requests' },
	{ id: 'features', label: '功能配置', hint: '功能开关与用户级别' },
	{ id: 'access', label: '访问管理', hint: '允许登录的邮箱', feature: 'admin_ops' }
] as const;
export type AdminView = 'admin' | (typeof ADMIN_PAGES)[number]['id'];
export const ADMIN_PATHS: Record<AdminView, string> = {
	admin: '/admin', monitoring: '/admin/monitoring', performance: '/admin/performance',
	requests: '/admin/requests', features: '/admin/features', access: '/admin/access'
};
