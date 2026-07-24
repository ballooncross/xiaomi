/** Per-user Telegram notification preferences (shared client + server). */

export type NotifyPrefs = {
	/** Daily / manual radar digest (concerts + trends). */
	digestTrends: boolean;
	/** Birthday / anniversary / milestone reminders (separate Telegram message). */
	digestDates: boolean;
	/** New COE bidding-round alerts. */
	coe: boolean;
};

export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = {
	digestTrends: true,
	digestDates: true,
	coe: false
};

export type NotifyChannel = keyof NotifyPrefs;

export function parseNotifyPrefs(raw: unknown): NotifyPrefs {
	const source =
		typeof raw === 'string'
			? (() => {
					try {
						return JSON.parse(raw) as unknown;
					} catch {
						return {};
					}
				})()
			: raw;

	const obj = source && typeof source === 'object' ? (source as Record<string, unknown>) : {};
	return {
		digestTrends: readBool(obj.digestTrends, DEFAULT_NOTIFY_PREFS.digestTrends),
		digestDates: readBool(obj.digestDates, DEFAULT_NOTIFY_PREFS.digestDates),
		coe: readBool(obj.coe, DEFAULT_NOTIFY_PREFS.coe)
	};
}

export function mergeNotifyPrefs(current: NotifyPrefs, patch: Partial<NotifyPrefs>): NotifyPrefs {
	return {
		digestTrends: patch.digestTrends ?? current.digestTrends,
		digestDates: patch.digestDates ?? current.digestDates,
		coe: patch.coe ?? current.coe
	};
}

function readBool(value: unknown, fallback: boolean): boolean {
	return typeof value === 'boolean' ? value : fallback;
}
