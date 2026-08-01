export const RADAR_VIEW_IDS = [
	'home',
	'concerts',
	'trends',
	'dates',
	'packages',
	'gym',
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
	{ id: 'packages', label: '包裹' },
	{ id: 'gym', label: '健身' },
	{ id: 'coe', label: 'COE' },
	{ id: 'interests', label: '兴趣' },
	{ id: 'me', label: '我的' },
	{ id: 'settings', label: '设置' }
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
